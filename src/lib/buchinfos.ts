// src/lib/buchinfos.ts
//
// Automatische Ergänzung von Buchinfos (Beschreibung/Klappentext, Verlag,
// Erscheinungsjahr, Coverbild) für Wunschlisten- UND Bibliotheks-Einträge
// (09/2026, Pendenz "Automatische Ergänzung von Infos in der Wunschliste",
// erweitert auf die Bibliothek per Folge-Pendenz "Coverbilder auch in der
// Bibliothek") — analog lib/umfang.ts über die kostenlose Open Library API
// (kein API-Key, kein Claude-Aufruf), läuft automatisch im Hintergrund für
// alle angezeigten Einträge (app/buecherliste/page.tsx UND
// app/bookshelf/page.tsx), sowohl für bestehende als auch neu hinzugefügte
// Bücher — kein separates Backfill-Skript nötig.
//
// Coverbild (Pendenz "prüfen ob Coverbilder möglich sind"): Open Library
// liefert für einen Suchtreffer optional ein cover_i (numerische Cover-ID),
// aus der sich eine feste, öffentliche Bild-URL bauen lässt — kein
// zusätzlicher API-Aufruf nötig.
//
// Beschreibung/Klappentext steht (falls vorhanden) NICHT im Suchtreffer,
// sondern erst auf der Open-Library-Works-Seite (ein Werk kann mehrere
// Editionen haben) — deshalb bei Treffer mit `key` ein zweiter Aufruf gegen
// die Works-API.
//
// BUG-FIX 09/2026 ("kein einziges Buch hat ein Cover"): sicherstelleBuchinfos()
// setzte den Negativ-Cache-Zeitstempel (buchinfosGeprueftAm) bisher bei
// JEDEM Versuch, auch bei einem echten Fehlschlag (Netzwerkfehler,
// Timeout, HTTP-Fehler) — nicht nur bei einem bestätigten "kein Treffer".
// Da app/buecherliste/page.tsx beim ersten Seitenaufbau nach dem Ausrollen
// für ALLE Zeilen gleichzeitig (Promise.all, ungedrosselt, je zwei
// Anfragen pro Buch) losgeschickt hat, reichte ein einziger schlechter
// Moment (z.B. Rate-Limiting durch Open Library bei so vielen parallelen
// Anfragen von einer IP), um praktisch jedes Buch dauerhaft ohne
// Buchinfos zu "verriegeln" — ein erneutes Laden der Seite half nicht,
// weil der früh gesetzte Zeitstempel jeden weiteren Versuch überspringen
// liess. Jetzt: openLibraryDokumente() unterscheidet echten Fehlschlag
// (null) von erfolgreicher Anfrage ohne Treffer ([]) — buchinfosSuchen()
// wirft bei einem echten Fehlschlag, sicherstelleBuchinfos() fängt das ab
// und setzt in diesem Fall den Zeitstempel BEWUSST NICHT, damit der
// nächste Seitenaufruf es erneut versucht.

import { eq } from "drizzle-orm";
import { db } from "../db";
import { buecher } from "../db/schema";
import { openLibraryDokumente, type OpenLibraryDoc } from "./umfang";

type OpenLibraryDocErweitert = OpenLibraryDoc & {
  first_publish_year?: number;
  publisher?: string[];
  cover_i?: number;
  key?: string;
};

export type Buchinfos = {
  beschreibung: string | null;
  verlag: string | null;
  erscheinungsjahr: number | null;
  coverUrl: string | null;
  externeReferenz: string | null;
};

const LEERE_BUCHINFOS: Buchinfos = {
  beschreibung: null,
  verlag: null,
  erscheinungsjahr: null,
  coverUrl: null,
  externeReferenz: null,
};

// Wirft bei einem ECHTEN Fehlschlag (openLibraryDokumente() liefert null),
// statt ihn wie ein "kein Treffer" zu behandeln — siehe Bug-Fix-Hinweis
// oben. Liefert sonst die (ggf. leere) Trefferliste.
async function buchinfosSuchen(titel: string, autor: string): Promise<OpenLibraryDocErweitert[]> {
  const docs = await openLibraryDokumente(
    titel,
    autor,
    "title,author_name,first_publish_year,publisher,cover_i,key",
    5
  );
  if (docs === null) {
    throw new Error(`Open-Library-Suche fehlgeschlagen für "${titel}"${autor ? ` von ${autor}` : ""}.`);
  }
  return docs as OpenLibraryDocErweitert[];
}

async function beschreibungNachschlagen(workKey: string): Promise<string | null> {
  try {
    const res = await fetch(`https://openlibrary.org${workKey}.json`, {
      headers: { "User-Agent": "Alexandreia/1.0 (privates Buchprojekt)" },
    });
    if (!res.ok) {
      console.error(`[beschreibungNachschlagen] HTTP ${res.status} für "${workKey}".`);
      return null;
    }
    const data = (await res.json()) as { description?: string | { value?: string } };
    if (!data.description) return null;
    return typeof data.description === "string" ? data.description : data.description.value ?? null;
  } catch (err) {
    // Bewusst NICHT geworfen (anders als buchinfosSuchen oben) — die
    // Beschreibung ist ein "Nice-to-have" obendrauf, ein Fehlschlag hier
    // soll Verlag/Jahr/Cover nicht mit blockieren bzw. deren Cache-
    // Schreibung nicht verhindern; im schlimmsten Fall bleibt nur die
    // Beschreibung leer, statt dass das ganze Buch erneut versucht wird.
    console.error(`[beschreibungNachschlagen] Fehler für "${workKey}":`, err);
    return null;
  }
}

export async function buchinfosNachschlagen(titel: string, autor: string): Promise<Buchinfos> {
  let docs = autor ? await buchinfosSuchen(titel, autor) : [];
  if (docs.length === 0) {
    docs = await buchinfosSuchen(titel, "");
  }

  if (docs.length === 0) {
    console.log(`[buchinfosNachschlagen] Kein Treffer für "${titel}"${autor ? ` von ${autor}` : ""}.`);
    return LEERE_BUCHINFOS;
  }

  const erscheinungsjahr = docs.find((d) => typeof d.first_publish_year === "number")?.first_publish_year ?? null;
  const verlag = docs.find((d) => d.publisher && d.publisher.length > 0)?.publisher?.[0] ?? null;
  // Eigener Suchdurchgang speziell nach einem Treffer MIT cover_i (09/2026,
  // Bug-Fix: vorher gewann durch ein zu grosszügiges .find() praktisch
  // immer der erste Treffer, weil fast jeder Treffer irgendein `key` hat —
  // ein Cover im 2. oder 3. Treffer wurde so nie gefunden).
  const coverTreffer = docs.find((d) => typeof d.cover_i === "number");
  const coverUrl = coverTreffer?.cover_i ? `https://covers.openlibrary.org/b/id/${coverTreffer.cover_i}-L.jpg` : null;
  // Für die Beschreibung nach Möglichkeit denselben Treffer wie fürs Cover
  // nehmen (gleiche Edition/Werk), sonst den ersten mit überhaupt einem
  // Werk-Key.
  const externeReferenz = coverTreffer?.key ?? docs.find((d) => d.key)?.key ?? null;
  const beschreibung = externeReferenz ? await beschreibungNachschlagen(externeReferenz) : null;

  return { beschreibung, verlag, erscheinungsjahr, coverUrl, externeReferenz };
}

// Liefert die Buchinfos zurück und persistiert sie (Cache-Writeback) — analog
// sicherstelleUmfang() in lib/umfang.ts, aber mit EIGENEM Negativ-Cache-
// Zeitstempel (buchinfosGeprueftAm), weil es ein anderer API-Aufruf mit
// anderen Feldern ist. Setzt den Zeitstempel NUR bei einer erfolgreich
// DURCHGEFÜHRTEN Anfrage (ob mit oder ohne Treffer) — bei einem echten
// Fehlschlag (buchinfosSuchen() wirft) bleibt er unangetastet, damit der
// nächste Seitenaufruf es erneut versucht (siehe Bug-Fix-Hinweis oben).
export async function sicherstelleBuchinfos(
  buchId: string,
  titel: string,
  autor: string,
  buchinfosGeprueftAm: Date | null | undefined
): Promise<Buchinfos | null> {
  if (buchinfosGeprueftAm) return null;
  let gefunden: Buchinfos;
  try {
    gefunden = await buchinfosNachschlagen(titel, autor);
  } catch (err) {
    console.error(
      `[sicherstelleBuchinfos] Fehlschlag für "${titel}"${autor ? ` von ${autor}` : ""}, kein Negativ-Cache gesetzt:`,
      err
    );
    return null;
  }
  await db
    .update(buecher)
    .set({ ...gefunden, buchinfosGeprueftAm: new Date() })
    .where(eq(buecher.id, buchId));
  return gefunden;
}
