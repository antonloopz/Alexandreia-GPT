// src/lib/doubletten.ts
//
// Doublettenerkennung für die Wunschliste (09/2026, Pendenz "Doubletten-
// erkennung + automatische Ergänzung von Buchdetails"). Bisher prüfte
// buecherliste/neu/actions.ts nur einen EXAKTEN Titel-/Autor-Abgleich
// (ilike) — das erkennt zwar "Sapiens" doppelt eingegeben, aber keine
// Tippfehler, abweichende Schreibweisen oder einen weggelassenen Autor,
// und warnt nie, selbst wenn das gefundene Buch schon gelesen oder in
// Produktion ist (ein weiterer Wunschlisten-Eintrag dafür würde dann nur
// unsichtbar herumliegen — buecherliste/page.tsx zeigt ja nur Einträge
// OHNE fertigen Buchinhalt). Reiner Text-Ähnlichkeitsvergleich
// (Levenshtein) gegen den gesamten `buecher`-Bestand, kein externer
// API-Aufruf nötig.

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { buchinhalte, buecher, gezeigteBuecher, wunschlisteneintraege } from "../db/schema";

export type DoublettenStatus = "wunschliste" | "bereit" | "gelesen" | null;

export type DoublettenTreffer = {
  buchId: string;
  titel: string;
  autor: string;
  aehnlichkeit: number;
  istExakt: boolean;
  status: DoublettenStatus;
};

function normalisieren(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Titel ohne Untertitel (alles vor einem Doppelpunkt/Gedankenstrich) —
// fängt z.B. "Sapiens" vs. "Sapiens: Eine kurze Geschichte der
// Menschheit" zusätzlich zum direkten Volltextvergleich ab.
function kernTitel(normalisierterTitel: string): string {
  return normalisierterTitel.split(/ [-–] |:/)[0].trim();
}

function levenshteinDistanz(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const zeile = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) zeile[j] = j;

  for (let i = 1; i <= m; i++) {
    let vorherigDiagonal = zeile[0];
    zeile[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = zeile[j];
      zeile[j] =
        a[i - 1] === b[j - 1] ? vorherigDiagonal : Math.min(zeile[j] + 1, zeile[j - 1] + 1, vorherigDiagonal + 1);
      vorherigDiagonal = temp;
    }
  }
  return zeile[n];
}

function aehnlichkeit(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const distanz = levenshteinDistanz(a, b);
  return 1 - distanz / Math.max(a.length, b.length);
}

// Findet Bücher im Bestand, die vermutlich dasselbe Werk sind wie
// titel/autor — sortiert nach Ähnlichkeit, exakte Treffer zuerst. Nur
// Kandidaten oberhalb der Relevanzschwelle werden zurückgegeben, damit ein
// Aufrufer nicht selbst nochmal filtern muss: exakte Titel-(+Autor-)
// Übereinstimmung, ODER Titel-Ähnlichkeit >= 92%, ODER Titel-Ähnlichkeit
// >= 80% zusammen mit Autor-Ähnlichkeit >= 60% (fehlender Autor blockiert
// dabei nicht — viele Wunschlisten-Einträge haben keinen).
export async function doublettenFinden(
  kontoId: string,
  titel: string,
  autor: string
): Promise<DoublettenTreffer[]> {
  const alleBuecher = await db.select({ id: buecher.id, titel: buecher.titel, autor: buecher.autor }).from(buecher);
  if (alleBuecher.length === 0) return [];

  const normTitel = normalisieren(titel);
  const normAutor = normalisieren(autor);
  const kernNormTitel = kernTitel(normTitel);

  const kandidaten = alleBuecher
    .map((b) => {
      const bTitel = normalisieren(b.titel);
      const bAutor = normalisieren(b.autor);
      const titelAehnlichkeit = Math.max(
        aehnlichkeit(normTitel, bTitel),
        aehnlichkeit(kernNormTitel, kernTitel(bTitel))
      );
      const autorAehnlichkeit = normAutor && bAutor ? aehnlichkeit(normAutor, bAutor) : 1;
      const istExakt = normTitel === bTitel && (!normAutor || normAutor === bAutor);
      const relevant = istExakt || titelAehnlichkeit >= 0.92 || (titelAehnlichkeit >= 0.8 && autorAehnlichkeit >= 0.6);
      if (!relevant) return null;
      return { buchId: b.id, titel: b.titel, autor: b.autor, aehnlichkeit: titelAehnlichkeit, istExakt };
    })
    .filter((k): k is Exclude<typeof k, null> => k !== null)
    .sort((a, b) => Number(b.istExakt) - Number(a.istExakt) || b.aehnlichkeit - a.aehnlichkeit)
    .slice(0, 3);

  if (kandidaten.length === 0) return [];

  const buchIds = kandidaten.map((k) => k.buchId);

  const wunschlisten = await db
    .select({ buchId: wunschlisteneintraege.buchId })
    .from(wunschlisteneintraege)
    .where(and(eq(wunschlisteneintraege.kontoId, kontoId), inArray(wunschlisteneintraege.buchId, buchIds)));
  const wunschlistenSet = new Set(wunschlisten.map((w) => w.buchId));

  const inhalte = await db
    .select({ buchId: buchinhalte.buchId, buchinhaltId: buchinhalte.id })
    .from(buchinhalte)
    .where(and(inArray(buchinhalte.buchId, buchIds), eq(buchinhalte.status, "im_vorrat")));
  const buchinhaltProBuch = new Map(inhalte.map((i) => [i.buchId, i.buchinhaltId]));

  const buchinhaltIds = [...buchinhaltProBuch.values()];
  const gezeigt = buchinhaltIds.length
    ? await db
        .select({ buchinhaltId: gezeigteBuecher.buchinhaltId, abgeschlossenAm: gezeigteBuecher.abgeschlossenAm })
        .from(gezeigteBuecher)
        .where(and(eq(gezeigteBuecher.kontoId, kontoId), inArray(gezeigteBuecher.buchinhaltId, buchinhaltIds)))
    : [];
  const abgeschlossenSet = new Set(gezeigt.filter((g) => g.abgeschlossenAm !== null).map((g) => g.buchinhaltId));

  return kandidaten.map((k) => {
    let status: DoublettenStatus = null;
    if (wunschlistenSet.has(k.buchId)) {
      status = "wunschliste";
    } else {
      const buchinhaltId = buchinhaltProBuch.get(k.buchId);
      if (buchinhaltId) status = abgeschlossenSet.has(buchinhaltId) ? "gelesen" : "bereit";
    }
    return { ...k, status };
  });
}
