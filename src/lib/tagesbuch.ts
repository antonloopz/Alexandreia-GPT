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
import { wortanzahl } from "./darstellung";

export type TagesBuch = {
  buchinhaltId: string;
  buchId: string;
  titel: string;
  autor: string;
  kategorie: string;
  teaser: string;
  // Umfang Original (Seitenangabe) + Wortanzahl der Zusammenfassung, für
  // Homes Anzeige "Kategorie, Titel, Wordcount, Autor" (09/2026, Pendenz
  // "Startseite umbauen") — dieselben Werte, die auch die Bibliothek zeigt
  // (siehe darstellung.ts), hier schon vorgerechnet statt des vollen
  // Zusammenfassungstexts, den Home sonst gar nicht bräuchte.
  umfang: string | null;
  wortanzahl: number;
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
  // Produktionsdatum (buchinhalte.erstelltAm) — für die "hinzugefügt"-
  // Anzeige in Bookshelfs "Bereit"-Abschnitt und Homes "Weiterlesen"-Liste
  // (09/2026, Pendenz "Hinzugefügt-Datum").
  erstelltAm: Date;
};

// Wie BereitesBuch, zusätzlich mit Umfangsangabe — für Homes
// Rotations-Vorschau (naechsteBuecherVorschau unten), die dieselbe
// Umfangsangabe wie das Buch heute zeigt.
export type RotationsVorschauBuch = BereitesBuch & {
  umfang: string | null;
  wortanzahl: number;
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
      umfang: buecher.umfang,
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
      umfang: bereitsHeute.umfang,
      wortanzahl: wortanzahl(bereitsHeute.zusammenfassung),
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
      umfang: buecher.umfang,
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
    umfang: gewaehlt.umfang,
    wortanzahl: wortanzahl(gewaehlt.zusammenfassung),
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
// diesem Konto entweder noch nie gezeigt wurden ODER schon geöffnet, aber
// nicht fertig gelesen sind (abgeschlossenAm noch null) — dieselbe Auswahl
// wie Bookshelfs "Bereit"-Abschnitt, hier aber nur die ersten `limit`
// (alphabetisch), für den kompakten Vorschlagsblock auf Home nach Abschluss
// des Tagesbuchs.
//
// Bug-Fix 09/2026 (Pendenz "Wunschliste: Bestand ungelesener Bücher pro
// Kategorie"): filterte bisher jedes Buch mit IRGENDEINER gezeigteBuecher-
// Zeile raus, unabhängig von abgeschlossenAm — ein begonnenes, aber nicht
// fertig gelesenes Buch verschwand dadurch aus dieser Liste, obwohl es in
// Bookshelfs "Bereit"-Abschnitt (der explizit nach abgeschlossenAm
// unterscheidet, nicht nach blossem "schon mal gezeigt") weiterhin auftaucht
// — Diskrepanz zwischen Home und Bibliothek. weitereBuecher() wird nur
// aufgerufen, wenn buch.abgeschlossen bereits true ist (app/page.tsx), das
// heutige Buch hat zu dem Zeitpunkt also selbst schon abgeschlossenAm
// gesetzt und wird hier korrekt mit ausgeschlossen.
export async function bereiteBuecher(kontoId: string, limit = 3): Promise<BereitesBuch[]> {
  const gezeigt = await db
    .select({ buchinhaltId: gezeigteBuecher.buchinhaltId, abgeschlossenAm: gezeigteBuecher.abgeschlossenAm })
    .from(gezeigteBuecher)
    .where(eq(gezeigteBuecher.kontoId, kontoId));
  const abgeschlossenIds = new Set(gezeigt.filter((r) => r.abgeschlossenAm !== null).map((r) => r.buchinhaltId));

  const kandidaten = await db
    .select({
      buchinhaltId: buchinhalte.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
      erstelltAm: buchinhalte.erstelltAm,
    })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.status, "im_vorrat"));

  return kandidaten
    .filter((b) => !abgeschlossenIds.has(b.buchinhaltId))
    .sort((a, b) => a.titel.localeCompare(b.titel))
    .slice(0, limit);
}

// Simuliert, welche(s) Buch/Bücher gemäss der Kategorie-Rotation aus
// naechstesBuchFuerHeute() als Nächstes(s) dran wäre(n) — OHNE dabei
// irgendeine gezeigteBuecher-Zeile anzulegen (reine Vorschau, kein
// Seiteneffekt). Für Home, Abschnitt "Als Nächstes gem. Rotation" unterhalb
// des Buchs heute (09/2026, Pendenz "Startseite umbauen").
//
// Simuliert dafür denselben Auswahlschritt wie naechstesBuchFuerHeute
// mehrfach hintereinander: die am längsten nicht gezeigte Kategorie kommt
// zuerst dran, danach gilt ihr "letztes Zeigedatum" für den nächsten
// Simulationsschritt als aktualisiert (auf einen fortlaufend erhöhten
// Zeitstempel) — sonst würde derselbe Schritt immer wieder dieselbe
// Kategorie wählen, solange sie nicht WIRKLICH gezeigt wurde.
export async function naechsteBuecherVorschau(
  kontoId: string,
  heutigerBuchinhaltId: string,
  heutigeKategorie: string,
  anzahl = 2
): Promise<RotationsVorschauBuch[]> {
  const bisherGezeigt = await db
    .select({ buchinhaltId: gezeigteBuecher.buchinhaltId, kategorie: buecher.kategorie, datum: gezeigteBuecher.datumGezeigt })
    .from(gezeigteBuecher)
    .innerJoin(buchinhalte, eq(gezeigteBuecher.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(gezeigteBuecher.kontoId, kontoId))
    .orderBy(desc(gezeigteBuecher.datumGezeigt));

  const ausgeschlosseneIds = new Set(bisherGezeigt.map((r) => r.buchinhaltId));
  ausgeschlosseneIds.add(heutigerBuchinhaltId);

  const kandidaten = await db
    .select({
      buchinhaltId: buchinhalte.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
      umfang: buecher.umfang,
      zusammenfassung: buchinhalte.zusammenfassung,
      erstelltAm: buchinhalte.erstelltAm,
    })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.status, "im_vorrat"));

  let pool = kandidaten.filter((k) => !ausgeschlosseneIds.has(k.buchinhaltId));

  const letzteKategorieDatum = new Map<string, number>();
  for (const r of bisherGezeigt) {
    if (!letzteKategorieDatum.has(r.kategorie)) {
      letzteKategorieDatum.set(r.kategorie, new Date(r.datum).getTime());
    }
  }
  // Das heute gewählte Buch zählt ab sofort ebenfalls als "gerade dran
  // gewesen" — sonst würde die Vorschau dieselbe Kategorie gleich nochmal
  // an erster Stelle zeigen.
  let simuliertesJetzt = Date.now();
  letzteKategorieDatum.set(heutigeKategorie, simuliertesJetzt);

  const ergebnis: RotationsVorschauBuch[] = [];
  while (ergebnis.length < anzahl && pool.length > 0) {
    simuliertesJetzt += 1;
    const sortiert = [...pool].sort((a, b) => {
      const da = letzteKategorieDatum.get(a.kategorie) ?? 0;
      const db_ = letzteKategorieDatum.get(b.kategorie) ?? 0;
      return da - db_;
    });
    const gewaehlt = sortiert[0];
    ergebnis.push({
      buchinhaltId: gewaehlt.buchinhaltId,
      titel: gewaehlt.titel,
      autor: gewaehlt.autor,
      kategorie: gewaehlt.kategorie,
      umfang: gewaehlt.umfang,
      wortanzahl: wortanzahl(gewaehlt.zusammenfassung),
      erstelltAm: gewaehlt.erstelltAm,
    });
    letzteKategorieDatum.set(gewaehlt.kategorie, simuliertesJetzt);
    pool = pool.filter((k) => k.buchinhaltId !== gewaehlt.buchinhaltId);
  }
  return ergebnis;
}

// Bestand "bereit, aber noch nicht gelesen" GRUPPIERT pro Kategorie —
// dieselbe Auswahl wie bereiteBuecher() oben (im_vorrat UND abgeschlossenAm
// noch null, schliesst also auch begonnene, aber nicht fertig gelesene
// Bücher mit ein — deckungsgleich mit Bookshelfs "Bereit"-Abschnitt), hier
// aber als Kategorie->Anzahl-Map statt flacher Liste. Für die Wunschliste,
// Kategorie-Filter-Chips (09/2026, Pendenz "Wunschliste: Kategoriebuttons
// farbig + Bestand ungelesener Bücher zeigen") — bewusst eine eigene
// Zählung statt bestandProKategorie() aus vorschlag.ts: die zählt ALLE
// "im_vorrat"-Bücher, unabhängig davon, ob das Konto sie schon gelesen hat,
// und beantwortet damit eine andere Frage (Produktions-Nachschub statt "was
// kann ich mir als Nächstes vornehmen").
export async function bestandUngelesenProKategorie(kontoId: string): Promise<Map<string, number>> {
  const gezeigt = await db
    .select({ buchinhaltId: gezeigteBuecher.buchinhaltId, abgeschlossenAm: gezeigteBuecher.abgeschlossenAm })
    .from(gezeigteBuecher)
    .where(eq(gezeigteBuecher.kontoId, kontoId));
  const abgeschlossenIds = new Set(gezeigt.filter((r) => r.abgeschlossenAm !== null).map((r) => r.buchinhaltId));

  const kandidaten = await db
    .select({ buchinhaltId: buchinhalte.id, kategorie: buecher.kategorie })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.status, "im_vorrat"));

  const ergebnis = new Map<string, number>();
  for (const k of kandidaten) {
    if (abgeschlossenIds.has(k.buchinhaltId)) continue;
    ergebnis.set(k.kategorie, (ergebnis.get(k.kategorie) ?? 0) + 1);
  }
  return ergebnis;
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
