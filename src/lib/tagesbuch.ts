// src/lib/tagesbuch.ts
//
// Bestimmt das "Buch heute" für Home — getrennt von vorschlaege() in
// vorschlag.ts, das die PRODUKTION steuert (welche Kategorie braucht
// Nachschub). Hier geht es um die ANZEIGE: welches bereits fertige
// ("im_vorrat") Buch wird heute vorgeschlagen.
//
// Ablauf:
// 1. Wurde für heute schon ein Buch gezeigt (gezeigteBuecher-Zeile mit
//    datumGezeigt = heute)? Dann genau das zurückgeben — idempotent,
//    ein erneuter Aufruf am selben Tag ändert nichts.
// 2. Sonst: unter den "im_vorrat"-Büchern, die diesem Konto noch nie
//    gezeigt wurden, die Kategorie wählen, die am längsten nicht dran
//    war (nie gezeigte Kategorien zuerst) — und dafür eine neue
//    gezeigteBuecher-Zeile anlegen (das "Zeigen" passiert genau hier).

import { db } from "../db";
import {
  buchinhalte,
  buecher,
  gezeigteBuecher,
  kernaussagen,
  repetitionselemente,
  wunschlisteneintraege,
} from "../db/schema";
import { and, desc, eq, gte, lt, lte, notInArray, sql } from "drizzle-orm";

export type TagesBuch = {
  buchinhaltId: string;
  buchId: string;
  titel: string;
  autor: string;
  kategorie: string;
  teaser: string;
  kernaussagenAnzahl: number;
  // true sobald die gezeigteBuecher-Zeile ein abgeschlossenAm trägt (siehe
  // app/abschluss/[id]/page.tsx) — Home zeigt dann nicht mehr den vollen
  // Detail-Block, sondern einen kompakten "geschafft"-Zustand.
  abgeschlossen: boolean;
};

export type BereitesBuch = {
  buchinhaltId: string;
  titel: string;
  autor: string;
  kategorie: string;
};

function heuteDatum(): Date {
  // Echtes Date-Objekt — die "date"-Spalten (mode:"date") erwarten zur
  // Laufzeit ein Date, kein vorformatiertes String+Cast (das bricht bei
  // Drizzles interner .toISOString()-Serialisierung).
  return new Date();
}

function teaserAus(zusammenfassung: string): string {
  // Erster Satz der Zusammenfassung als kurzer Aufhänger, bis eine
  // eigene Teaser-Spalte nötig wird (aktuell kein Schema-Feld dafür).
  const ohneUeberschriften = zusammenfassung.replace(/^#+\s.*$/gm, "").trim();
  const ersterSatz = ohneUeberschriften.split(/(?<=[.!?])\s/)[0];
  return ersterSatz?.trim() || ohneUeberschriften.slice(0, 140);
}

export async function naechstesBuchFuerHeute(kontoId: string): Promise<TagesBuch | null> {
  const heute = heuteDatum();

  // 1. Schon etwas für heute gezeigt?
  const [bereitsHeute] = await db
    .select({
      buchinhaltId: buchinhalte.id,
      buchId: buecher.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
      zusammenfassung: buchinhalte.zusammenfassung,
      abgeschlossenAm: gezeigteBuecher.abgeschlossenAm,
    })
    .from(gezeigteBuecher)
    .innerJoin(buchinhalte, eq(gezeigteBuecher.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(and(eq(gezeigteBuecher.kontoId, kontoId), eq(gezeigteBuecher.datumGezeigt, heute)));

  if (bereitsHeute) {
    const anzahl = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(kernaussagen)
      .where(eq(kernaussagen.buchinhaltId, bereitsHeute.buchinhaltId));
    return {
      buchinhaltId: bereitsHeute.buchinhaltId,
      buchId: bereitsHeute.buchId,
      titel: bereitsHeute.titel,
      autor: bereitsHeute.autor,
      kategorie: bereitsHeute.kategorie,
      teaser: teaserAus(bereitsHeute.zusammenfassung),
      kernaussagenAnzahl: anzahl[0]?.n ?? 0,
      abgeschlossen: bereitsHeute.abgeschlossenAm !== null,
    };
  }

  // 2. Bereits gezeigte Buchinhalte dieses Kontos ausschliessen
  const bisherGezeigt = await db
    .select({ buchinhaltId: gezeigteBuecher.buchinhaltId, kategorie: buecher.kategorie, datum: gezeigteBuecher.datumGezeigt })
    .from(gezeigteBuecher)
    .innerJoin(buchinhalte, eq(gezeigteBuecher.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(gezeigteBuecher.kontoId, kontoId))
    .orderBy(desc(gezeigteBuecher.datumGezeigt));

  const ausgeschlosseneIds = bisherGezeigt.map((r) => r.buchinhaltId);

  const kandidaten = await db
    .select({
      buchinhaltId: buchinhalte.id,
      buchId: buecher.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
      zusammenfassung: buchinhalte.zusammenfassung,
    })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(
      ausgeschlosseneIds.length > 0
        ? and(eq(buchinhalte.status, "im_vorrat"), notInArray(buchinhalte.id, ausgeschlosseneIds))
        : eq(buchinhalte.status, "im_vorrat")
    );

  if (kandidaten.length === 0) return null;

  // Kategorie wählen, die am längsten nicht dran war (nie gezeigt zuerst).
  // r.datum kommt als echtes Date-Objekt zurück (mode:"date").
  const letzteKategorieDatum = new Map<string, number>();
  for (const r of bisherGezeigt) {
    if (!letzteKategorieDatum.has(r.kategorie)) {
      letzteKategorieDatum.set(r.kategorie, new Date(r.datum).getTime());
    }
  }

  const sortiert = [...kandidaten].sort((a, b) => {
    const da = letzteKategorieDatum.get(a.kategorie) ?? 0;
    const db_ = letzteKategorieDatum.get(b.kategorie) ?? 0;
    return da - db_;
  });

  const gewaehlt = sortiert[0];

  await sicherstelleGezeigt(kontoId, gewaehlt.buchinhaltId, gewaehlt.buchId);

  const anzahl = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(kernaussagen)
    .where(eq(kernaussagen.buchinhaltId, gewaehlt.buchinhaltId));

  return {
    buchinhaltId: gewaehlt.buchinhaltId,
    buchId: gewaehlt.buchId,
    titel: gewaehlt.titel,
    autor: gewaehlt.autor,
    kategorie: gewaehlt.kategorie,
    teaser: teaserAus(gewaehlt.zusammenfassung),
    kernaussagenAnzahl: anzahl[0]?.n ?? 0,
    abgeschlossen: false,
  };
}

// Stellt sicher, dass für dieses Buch+Konto eine gezeigteBuecher-Zeile
// existiert (idempotent, kein Doppel-Insert bei erneutem Aufruf) — genutzt
// von naechstesBuchFuerHeute (offizielle Tagesauswahl) UND von der
// Lesen-Seite (app/lesen/[id]/page.tsx), falls jemand ein "Bereit"-Buch
// direkt öffnet statt über Home. Ohne Letzteres würde so ein Buch nie in
// Bookshelfs "Gelesen"-Historie oder den Streak einfliessen.
export async function sicherstelleGezeigt(
  kontoId: string,
  buchinhaltId: string,
  buchId: string
): Promise<void> {
  const [vorhanden] = await db
    .select({ id: gezeigteBuecher.id })
    .from(gezeigteBuecher)
    .where(and(eq(gezeigteBuecher.kontoId, kontoId), eq(gezeigteBuecher.buchinhaltId, buchinhaltId)));

  if (vorhanden) return;

  const wunschlistenTreffer = await db
    .select()
    .from(wunschlisteneintraege)
    .where(and(eq(wunschlisteneintraege.kontoId, kontoId), eq(wunschlisteneintraege.buchId, buchId)))
    .limit(1);

  // Herkunft nur relevant, wenn das Buch NICHT aus der Wunschliste stammt —
  // recherchierte Bücher tragen sie auf buecher.herkunft (siehe recherche.ts).
  let quelle: "eigene_liste" | "klassiker" | "geheimtipp" | "synergie" = "eigene_liste";
  if (wunschlistenTreffer.length === 0) {
    const [buch] = await db.select({ herkunft: buecher.herkunft }).from(buecher).where(eq(buecher.id, buchId));
    quelle = buch?.herkunft ?? "klassiker";
  }

  await db.insert(gezeigteBuecher).values({
    kontoId,
    buchinhaltId,
    datumGezeigt: heuteDatum(),
    quelle,
  });
}

// "Bereit zum Weiterlesen": fertig produzierte ("im_vorrat") Bücher, die
// diesem Konto noch nie gezeigt wurden — dieselbe Auswahl wie Bookshelfs
// "Bereit"-Abschnitt, hier aber nur die ersten `limit` (alphabetisch), für
// den kompakten Vorschlagsblock auf Home nach Abschluss des Tagesbuchs.
export async function bereiteBuecher(kontoId: string, limit = 3): Promise<BereitesBuch[]> {
  const gezeigt = await db
    .select({ buchinhaltId: gezeigteBuecher.buchinhaltId })
    .from(gezeigteBuecher)
    .where(eq(gezeigteBuecher.kontoId, kontoId));
  const gezeigtIds = new Set(gezeigt.map((r) => r.buchinhaltId));

  const kandidaten = await db
    .select({
      buchinhaltId: buchinhalte.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
    })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.status, "im_vorrat"));

  return kandidaten
    .filter((b) => !gezeigtIds.has(b.buchinhaltId))
    .sort((a, b) => a.titel.localeCompare(b.titel))
    .slice(0, limit);
}

export type AbgeschlossenesBuch = {
  buchinhaltId: string;
  titel: string;
  autor: string;
  kategorie: string;
};

// Alle Bücher, die HEUTE (Kalendertag) abgeschlossen wurden — nicht nur das
// offizielle "Buch heute". Seit Bookshelf kann man beliebig viele "Bereit"-
// Bücher direkt öffnen (app/lesen/[id]/page.tsx ruft dafür sicherstelleGezeigt
// auf) und am selben Tag fertig lesen — Home zeigte im "Heute geschafft"-
// Zustand bisher aber nur das eine offizielle Buch heute, alle zusätzlich
// heute abgeschlossenen Bücher gingen unter (Bug, 09/2026). Filtert über
// abgeschlossenAm (Abschlusszeitpunkt), nicht datumGezeigt (Zeitpunkt des
// ERSTEN Öffnens) — die können bei einem über mehrere Tage verteilt
// gelesenen Buch auseinanderfallen. ausgeschlossenerBuchinhaltId blendet das
// bereits separat als grosse Karte gezeigte Buch heute aus dieser Liste aus.
export async function heuteAbgeschlosseneBuecher(
  kontoId: string,
  ausgeschlossenerBuchinhaltId?: string
): Promise<AbgeschlossenesBuch[]> {
  const heuteStart = new Date();
  heuteStart.setHours(0, 0, 0, 0);
  const morgenStart = new Date(heuteStart);
  morgenStart.setDate(heuteStart.getDate() + 1);

  const rows = await db
    .select({
      buchinhaltId: buchinhalte.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
    })
    .from(gezeigteBuecher)
    .innerJoin(buchinhalte, eq(gezeigteBuecher.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(
      and(
        eq(gezeigteBuecher.kontoId, kontoId),
        gte(gezeigteBuecher.abgeschlossenAm, heuteStart),
        lt(gezeigteBuecher.abgeschlossenAm, morgenStart)
      )
    )
    .orderBy(desc(gezeigteBuecher.abgeschlossenAm));

  return rows.filter((r) => r.buchinhaltId !== ausgeschlossenerBuchinhaltId);
}

export async function faelligeWiederholungenAnzahl(kontoId: string): Promise<number> {
  const heute = heuteDatum();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(repetitionselemente)
    .where(and(eq(repetitionselemente.kontoId, kontoId), lte(repetitionselemente.naechsteFaelligkeit, heute)));
  return row?.n ?? 0;
}
