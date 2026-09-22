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
//
// Wieder in den Lauf aufgenommene Bücher (09/2026, gezeigteBuecher.
// wiederImLaufSeit gesetzt, erneutGezeigtAm noch null) zählen in Schritt 2
// wieder als Kandidaten — wie nie gezeigte. Ihr neuer Durchgang beginnt in
// sicherstelleGezeigt() (erneutGezeigtAm = heute), die bestehende Zeile
// wird dabei umgewidmet statt eine zweite angelegt (unique-Constraint).
// "Heute gezeigt" heisst deshalb: datumGezeigt ODER erneutGezeigtAm = heute.

import { db } from "../db";
import {
  buchinhalte,
  buecher,
  gezeigteBuecher,
  kategorieEnum,
  kernaussagen,
  repetitionselemente,
  wunschlisteneintraege,
} from "../db/schema";
import { and, desc, eq, gte, isNotNull, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { relativesDatum, wortanzahl } from "./darstellung";
import { KATEGORIE_LABEL } from "./kategorien";

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
  // Kurze Begründung "Warum dieses Buch heute" (09/2026, Pendenz "Home:
  // kurze Begründung 'Warum dieses Buch heute' anzeigen") — spiegelt exakt
  // den Auswahlmechanismus unten wider (Kategorie-Rotation: am längsten
  // nicht dran zuerst), keine separate/erfundene Erklärung.
  begruendung: string;
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

// Zeigedaten einer gezeigteBuecher-Zeile — das erste Zeigen plus ggf. der
// Beginn eines erneuten Durchgangs (wieder in den Lauf aufgenommen).
type ZeigeZeile = {
  datumGezeigt: Date;
  erneutGezeigtAm: Date | null;
  wiederImLaufSeit: Date | null;
};

// Wartet ein wieder aufgenommenes Buch noch auf seinen neuen Durchgang?
// Dann ist es — wie ein nie gezeigtes — Kandidat für die Tagesauswahl.
export function wartetImLauf(z: Pick<ZeigeZeile, "erneutGezeigtAm" | "wiederImLaufSeit">): boolean {
  return z.wiederImLaufSeit !== null && z.erneutGezeigtAm === null;
}

// Letztes Zeigedatum einer Zeile (für die Kategorie-Rotation).
function letztesZeigedatum(z: Pick<ZeigeZeile, "datumGezeigt" | "erneutGezeigtAm">): number {
  const erst = new Date(z.datumGezeigt).getTime();
  return z.erneutGezeigtAm ? Math.max(erst, new Date(z.erneutGezeigtAm).getTime()) : erst;
}

// Rotationsbasis: pro Kategorie das letzte Zeigedatum (ms).
function letzteDatenProKategorie(zeilen: (ZeigeZeile & { kategorie: string })[]): Map<string, number> {
  const karte = new Map<string, number>();
  for (const z of zeilen) {
    const d = letztesZeigedatum(z);
    if (d > (karte.get(z.kategorie) ?? 0)) karte.set(z.kategorie, d);
  }
  return karte;
}

function teaserAus(zusammenfassung: string): string {
  // Erster Satz der Zusammenfassung als kurzer Aufhänger, bis eine
  // eigene Teaser-Spalte nötig wird (aktuell kein Schema-Feld dafür).
  const ohneUeberschriften = zusammenfassung.replace(/^#+\s.*$/gm, "").trim();
  const ersterSatz = ohneUeberschriften.split(/(?<=[.!?])\s/)[0];
  return ersterSatz?.trim() || ohneUeberschriften.slice(0, 140);
}

// Letztes Zeigedatum dieser Kategorie für dieses Konto, VOR `vorDatum` —
// Basis für die Begründung "Warum dieses Buch heute" (Kategorie-Rotation).
// `vorDatum` ist bewusst Mitternacht des aktuellen Tages, nicht der exakte
// Auswahlzeitpunkt, damit eine heute schon angelegte gezeigteBuecher-Zeile
// (egal zu welcher Uhrzeit) nie sich selbst als "letztes Mal" zählt.
async function letztesDatumFuerKategorie(
  kontoId: string,
  kategorie: (typeof kategorieEnum.enumValues)[number],
  vorDatum: Date
): Promise<Date | null> {
  // Erstes Zeigen UND Beginn eines erneuten Durchgangs zählen (09/2026).
  const zeilen = await db
    .select({ datumGezeigt: gezeigteBuecher.datumGezeigt, erneutGezeigtAm: gezeigteBuecher.erneutGezeigtAm })
    .from(gezeigteBuecher)
    .innerJoin(buchinhalte, eq(gezeigteBuecher.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(and(eq(gezeigteBuecher.kontoId, kontoId), eq(buecher.kategorie, kategorie)));
  // Kalendertag-Vergleich wie zuvor lt(datumGezeigt, vorDatum): nur Tage
  // VOR dem Tag von vorDatum zählen.
  const tagGrenze = new Date(vorDatum);
  tagGrenze.setHours(0, 0, 0, 0);
  let bestes: number | null = null;
  for (const z of zeilen) {
    for (const d of [z.datumGezeigt, z.erneutGezeigtAm]) {
      if (!d) continue;
      const t = new Date(d).getTime();
      if (t < tagGrenze.getTime() && (bestes === null || t > bestes)) bestes = t;
    }
  }
  return bestes === null ? null : new Date(bestes);
}

// Baut aus dem Rotationsergebnis den Anzeigetext — bewusst derselbe Grund,
// der das Buch tatsächlich ausgewählt hat (am längsten nicht dran gewesene
// Kategorie zuerst), keine nachträglich erfundene Erklärung.
function begruendungText(kategorieLabel: string, letztesDatum: Date | null): string {
  if (!letztesDatum) {
    return `${kategorieLabel} ist heute zum ersten Mal dran.`;
  }
  const relativ = relativesDatum(letztesDatum);
  const zeitangabe = relativ === "heute" || relativ === "gestern" || relativ.startsWith("vor ")
    ? relativ
    : `am ${relativ}`;
  return `${kategorieLabel} war zuletzt ${zeitangabe} dran.`;
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
      wiederImLaufSeit: gezeigteBuecher.wiederImLaufSeit,
    })
    .from(gezeigteBuecher)
    .innerJoin(buchinhalte, eq(gezeigteBuecher.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(
      and(
        eq(gezeigteBuecher.kontoId, kontoId),
        or(eq(gezeigteBuecher.datumGezeigt, heute), eq(gezeigteBuecher.erneutGezeigtAm, heute))
      )
    )
    // Ein heute begonnener erneuter Durchgang hat Vorrang vor einem heute
    // (zusätzlich) direkt geöffneten Buch.
    .orderBy(sql`${gezeigteBuecher.erneutGezeigtAm} is null`);

  if (bereitsHeute) {
    const anzahl = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(kernaussagen)
      .where(eq(kernaussagen.buchinhaltId, bereitsHeute.buchinhaltId));
    const letztesDatum = await letztesDatumFuerKategorie(kontoId, bereitsHeute.kategorie, heute);
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
      // Im erneuten Durchgang (wiederImLaufSeit gesetzt) gilt das Buch erst
      // nach dem neuen Abschluss wieder als geschafft.
      abgeschlossen: bereitsHeute.abgeschlossenAm !== null && bereitsHeute.wiederImLaufSeit === null,
      begruendung: begruendungText(KATEGORIE_LABEL[bereitsHeute.kategorie] ?? bereitsHeute.kategorie, letztesDatum),
    };
  }

  // 2. Bereits gezeigte Buchinhalte dieses Kontos ausschliessen
  const bisherGezeigt = await db
    .select({
      buchinhaltId: gezeigteBuecher.buchinhaltId,
      kategorie: buecher.kategorie,
      datumGezeigt: gezeigteBuecher.datumGezeigt,
      erneutGezeigtAm: gezeigteBuecher.erneutGezeigtAm,
      wiederImLaufSeit: gezeigteBuecher.wiederImLaufSeit,
    })
    .from(gezeigteBuecher)
    .innerJoin(buchinhalte, eq(gezeigteBuecher.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(gezeigteBuecher.kontoId, kontoId));

  // Wieder in den Lauf aufgenommene, noch wartende Bücher bleiben Kandidaten.
  const ausgeschlosseneIds = bisherGezeigt.filter((r) => !wartetImLauf(r)).map((r) => r.buchinhaltId);

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
  const letzteKategorieDatum = letzteDatenProKategorie(bisherGezeigt);

  const sortiert = [...kandidaten].sort((a, b) => {
    const da = letzteKategorieDatum.get(a.kategorie) ?? 0;
    const db_ = letzteKategorieDatum.get(b.kategorie) ?? 0;
    return da - db_;
  });

  const gewaehlt = sortiert[0];

  // Vor dem Insert ermitteln (letztesDatumFuerKategorie schliesst "heute"
  // ohnehin per Datumsvergleich aus, Reihenfolge wäre also auch danach
  // unschädlich — hier trotzdem zuerst, für die klarere Lesbarkeit).
  const letztesDatum = await letztesDatumFuerKategorie(kontoId, gewaehlt.kategorie, heute);

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
    begruendung: begruendungText(KATEGORIE_LABEL[gewaehlt.kategorie] ?? gewaehlt.kategorie, letztesDatum),
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

  // Bug-Fix 09/2026 (Race Condition): vorher erst per SELECT geprüft, ob
  // schon eine Zeile existiert, und nur dann eingefügt — bei zwei fast
  // gleichzeitigen Aufrufen (z.B. Home + Lesen-Seite, oder zwei Geräte)
  // konnten beide den SELECT als "noch nichts da" sehen und je eine Zeile
  // einfügen. Jetzt übernimmt der unique-Constraint auf (kontoId,
  // buchinhaltId) in schema.ts das Idempotenz-Versprechen ATOMAR direkt in
  // der Datenbank — ON CONFLICT DO NOTHING statt eines vorherigen Checks.
  await db
    .insert(gezeigteBuecher)
    .values({
      kontoId,
      buchinhaltId,
      datumGezeigt: heuteDatum(),
      quelle,
    })
    .onConflictDoNothing({ target: [gezeigteBuecher.kontoId, gezeigteBuecher.buchinhaltId] });

  // Wieder in den Lauf aufgenommenes Buch (09/2026): der neue Durchgang
  // beginnt jetzt — egal ob über die Tagesauswahl oder direkt aus der
  // Bibliothek geöffnet. Nur beim ersten Mal (erneutGezeigtAm noch null).
  await db
    .update(gezeigteBuecher)
    .set({ erneutGezeigtAm: heuteDatum() })
    .where(
      and(
        eq(gezeigteBuecher.kontoId, kontoId),
        eq(gezeigteBuecher.buchinhaltId, buchinhaltId),
        isNotNull(gezeigteBuecher.wiederImLaufSeit),
        isNull(gezeigteBuecher.erneutGezeigtAm)
      )
    );
}

// Gelesenes Buch wieder in den Lauf aufnehmen bzw. wieder herausnehmen
// (09/2026, Pendenz "Gelesene Bücher wieder in den Lauf aufnehmen").
// Aufnehmen nur bei einem abgeschlossenen Buch, das nicht schon im Lauf
// ist; der bisherige Durchgang bleibt gezählt (abgeschlossenAm/Quiz
// bleiben stehen, Entscheid 22.09.2026). Herausnehmen setzt nur die beiden
// Lauf-Felder zurück.
export async function wiederInDenLaufSetzen(kontoId: string, buchinhaltId: string, imLauf: boolean): Promise<void> {
  const zeile = and(eq(gezeigteBuecher.kontoId, kontoId), eq(gezeigteBuecher.buchinhaltId, buchinhaltId));
  if (imLauf) {
    await db
      .update(gezeigteBuecher)
      .set({ wiederImLaufSeit: new Date(), erneutGezeigtAm: null })
      .where(and(zeile, isNotNull(gezeigteBuecher.abgeschlossenAm), isNull(gezeigteBuecher.wiederImLaufSeit)));
  } else {
    await db.update(gezeigteBuecher).set({ wiederImLaufSeit: null, erneutGezeigtAm: null }).where(zeile);
  }
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
    .select({
      buchinhaltId: gezeigteBuecher.buchinhaltId,
      abgeschlossenAm: gezeigteBuecher.abgeschlossenAm,
      wiederImLaufSeit: gezeigteBuecher.wiederImLaufSeit,
    })
    .from(gezeigteBuecher)
    .where(eq(gezeigteBuecher.kontoId, kontoId));
  // Wieder in den Lauf aufgenommene Bücher gelten als bereit (09/2026).
  const abgeschlossenIds = new Set(
    gezeigt.filter((r) => r.abgeschlossenAm !== null && r.wiederImLaufSeit === null).map((r) => r.buchinhaltId)
  );

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
    .select({
      buchinhaltId: gezeigteBuecher.buchinhaltId,
      kategorie: buecher.kategorie,
      datumGezeigt: gezeigteBuecher.datumGezeigt,
      erneutGezeigtAm: gezeigteBuecher.erneutGezeigtAm,
      wiederImLaufSeit: gezeigteBuecher.wiederImLaufSeit,
    })
    .from(gezeigteBuecher)
    .innerJoin(buchinhalte, eq(gezeigteBuecher.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(gezeigteBuecher.kontoId, kontoId));

  const ausgeschlosseneIds = new Set(bisherGezeigt.filter((r) => !wartetImLauf(r)).map((r) => r.buchinhaltId));
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

  const letzteKategorieDatum = letzteDatenProKategorie(bisherGezeigt);
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
