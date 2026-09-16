// src/lib/vorschlag.ts
//
// Erster Schritt der Content-Pipeline (Konzept Abschnitt "Pipeline"):
// "Vorschlag" — zeigt die nächsten Buchkandidaten vorab, bevor irgendein
// Entwurf/Prüfung passiert. Fast ein reiner Lese-Vorgang: markiert nichts
// als "in Bearbeitung", kann aber — wenn für eine knappe Kategorie weder
// Wunschliste noch bestehender Katalog etwas liefert — über recherche.ts
// einen neuen `buecher`-Eintrag anlegen (siehe Schritt 3 unten).
//
// Logik:
// 0. Manuell priorisierte Wunschlisten-Einträge ("bald" = true, noch ohne
//    Buchinhalt) zuerst — UNABHÄNGIG von der Kategorie-Mindestbestand-Logik.
//    Wer ein Buch über die Bücherliste explizit "für den nächsten Lauf
//    vormerkt", will es dann auch bekommen, nicht erst wenn seine Kategorie
//    zufällig knapp wird.
// 1. Bestand pro Kategorie zählen (Buchinhalte mit Status "im_vorrat").
// 2. Kategorien unter dem Mindestbestand (2) sind kandidatenwürdig,
//    knappste zuerst.
// 3. Pro knapper Kategorie einen Kandidaten wählen: bevorzugt aus der
//    eigenen Wunschliste, solange deren Anteil an bereits produzierten
//    Büchern unter der Ziel-Quote (40%) liegt — sonst aus dem bestehenden
//    Recherche-Pool (Klassiker/Geheimtipp/Synergie), und erst wenn auch der
//    leer ist, wird live per Claude+Websuche ein neues Buch recherchiert und
//    angelegt (siehe recherche.ts). WICHTIG: vorschlaege() ist damit NICHT
//    mehr rein lesend — kann bei Bedarf einen `buecher`-Eintrag anlegen.
// 4. Bücher, für die schon ein Buchinhalt existiert (gleich welchen
//    Status), sind keine Kandidaten mehr.

import { db } from "../db";
import { buecher, buchinhalte, gezeigteBuecher, kontoeinstellungen, wunschlisteneintraege } from "../db/schema";
import { and, eq, sql } from "drizzle-orm";
import { kandidatRecherchieren } from "./recherche";
import { sicherstelleUmfang } from "./umfang";

export const ALLE_KATEGORIEN = [
  "philosophie",
  "psychologie",
  "wirtschaft_business",
  "geschichte",
  "naturwissenschaft",
  "gesellschaft_politik",
  "biografie_memoir",
  "literatur_klassiker",
  "spiritualitaet_sinnfragen",
  "persoenliche_entwicklung",
] as const;

export type Kategorie = (typeof ALLE_KATEGORIEN)[number];

export const STANDARD_MINDESTBESTAND = 2;
const WUNSCHLISTEN_QUOTE = 0.4;

export type VorschlagKandidat = {
  buchId: string;
  titel: string;
  autor: string;
  kategorie: Kategorie;
  quelle: "eigene_liste" | "klassiker" | "geheimtipp" | "synergie";
  grund: string;
  // Grobe Umfangsangabe (z.B. "412 Seiten"), siehe lib/umfang.ts. null, wenn
  // kein Treffer gefunden wurde.
  umfang: string | null;
};

// Bereits mit Buchinhalt versehene Bücher (gleich welchen Status — "in
// Bearbeitung" ist kein Kandidat mehr). Von vorschlaege() UND
// kategorieUebersicht() gebraucht.
async function belegteBuecher(): Promise<{ buchId: string }[]> {
  return db.select({ buchId: buchinhalte.buchId }).from(buchinhalte);
}

// Bestand pro Kategorie (nur "im_vorrat"), inkl. der Kategorien mit 0 —
// von vorschlaege() UND kategorieUebersicht() gebraucht.
async function bestandProKategorie(): Promise<Map<Kategorie, number>> {
  const bestandRows = await db
    .select({ kategorie: buecher.kategorie, anzahl: sql<number>`count(*)::int` })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.status, "im_vorrat"))
    .groupBy(buecher.kategorie);

  const bestand = new Map<Kategorie, number>(ALLE_KATEGORIEN.map((k) => [k, 0]));
  for (const row of bestandRows) bestand.set(row.kategorie as Kategorie, row.anzahl);
  return bestand;
}

// Pro-Kategorie-Mindestbestand für dieses Konto: Standardwert
// (STANDARD_MINDESTBESTAND), aber überschreibbar über
// kontoeinstellungen.kategorieZielwerte (siehe
// app/einstellungen/themenverteilung — von dort aus einstellbar). Fehlende
// oder ungültige Einträge (keine Zahl, negativ) fallen auf den
// Standardwert zurück. Von vorschlaege() UND kategorieUebersicht()
// gebraucht.
async function mindestbestandProKategorie(kontoId: string): Promise<Map<Kategorie, number>> {
  const [einstellungen] = await db
    .select({ kategorieZielwerte: kontoeinstellungen.kategorieZielwerte })
    .from(kontoeinstellungen)
    .where(eq(kontoeinstellungen.kontoId, kontoId));

  const zielwerte = einstellungen?.kategorieZielwerte ?? {};
  const ergebnis = new Map<Kategorie, number>();
  for (const kategorie of ALLE_KATEGORIEN) {
    const wert = zielwerte[kategorie];
    ergebnis.set(kategorie, typeof wert === "number" && wert >= 0 ? wert : STANDARD_MINDESTBESTAND);
  }
  return ergebnis;
}

// Wunschlisten-Quote dieses Kontos: Anteil bereits produzierter Bücher, die
// aus der eigenen Liste stammen, plus ob die Ziel-Quote (40%) noch nicht
// erreicht ist — von vorschlaege() UND kategorieUebersicht() gebraucht.
//
// NUR herkunft="eigene_liste" zählt hier (09/2026, Pendenz "Wunschliste:
// Markierung ob Vorschlag von Claude oder Eintrag vom Nutzer") — seit
// recherche.ts auch KI-Vorschläge als Wunschlisten-Eintrag anlegt, würden
// sonst deren buchId hier mitgezählt und fälschlich als "eigener Wunsch"
// behandelt (verzerrt sowohl die Quote als auch die ausListe/andere-
// Einteilung weiter unten in vorschlaege()).
async function wunschlistenQuote(
  kontoId: string,
  belegt: { buchId: string }[]
): Promise<{ wunschlistenIds: Set<string>; ausListeAnteil: number; wunschlisteBevorzugt: boolean }> {
  const eintraege = await db
    .select({ buchId: wunschlisteneintraege.buchId, herkunft: wunschlisteneintraege.herkunft })
    .from(wunschlisteneintraege)
    .where(eq(wunschlisteneintraege.kontoId, kontoId));
  const wunschlistenIds = new Set(
    eintraege
      .filter((r) => r.herkunft === "eigene_liste")
      .map((r) => r.buchId)
      .filter((id): id is string => id !== null)
  );

  const ausListeAnteil =
    belegt.length === 0
      ? 0
      : belegt.filter((r) => wunschlistenIds.has(r.buchId)).length / belegt.length;
  const wunschlisteBevorzugt = ausListeAnteil < WUNSCHLISTEN_QUOTE;

  return { wunschlistenIds, ausListeAnteil, wunschlisteBevorzugt };
}

// Grobe Umfangsangabe sicherstellen: vorhandenen Wert übernehmen, sonst per
// Google Books nachschlagen und für künftige Aufrufe direkt auf der
// `buecher`-Zeile festschreiben (Best-Effort — ohne Treffer bleibt es null).
export async function vorschlaege(
  kontoId: string,
  anzahl = 3
): Promise<VorschlagKandidat[]> {
  // Vorgezogen, weil sowohl die manuelle Priorisierung (Schritt 0) als auch
  // die Kategorie-Logik das brauchen.
  const belegt = await belegteBuecher();
  const belegteIds = new Set(belegt.map((r) => r.buchId));

  const ergebnis: VorschlagKandidat[] = [];

  // 0. Manuell priorisiert ("bald"), noch ohne Buchinhalt — siehe Kommentar
  // oben. Reihenfolge: wie in der Wunschliste angelegt.
  const priorisiert = await db
    .select({
      buchId: buecher.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
      umfang: buecher.umfang,
      umfangGeprueftAm: buecher.umfangGeprueftAm,
    })
    .from(wunschlisteneintraege)
    .innerJoin(buecher, eq(wunschlisteneintraege.buchId, buecher.id))
    .where(and(eq(wunschlisteneintraege.kontoId, kontoId), eq(wunschlisteneintraege.bald, true)));

  for (const buch of priorisiert) {
    if (ergebnis.length >= anzahl) break;
    if (belegteIds.has(buch.buchId)) continue; // längst produziert, "bald" nur noch Alt-Markierung
    ergebnis.push({
      buchId: buch.buchId,
      titel: buch.titel,
      autor: buch.autor,
      kategorie: buch.kategorie as Kategorie,
      quelle: "eigene_liste",
      grund: "Manuell für den nächsten Lauf vorgemerkt.",
      umfang: await sicherstelleUmfang(buch.buchId, buch.titel, buch.autor, buch.umfang, buch.umfangGeprueftAm),
    });
  }

  if (ergebnis.length >= anzahl) return ergebnis;

  const bereitsGewaehlt = new Set(ergebnis.map((e) => e.buchId));

  // 1. Bestand pro Kategorie (nur "im_vorrat") + Mindestbestand pro Kategorie
  const bestand = await bestandProKategorie();
  const mindestbestandeMap = await mindestbestandProKategorie(kontoId);

  // 2. Knappe Kategorien, knappste zuerst
  const knappeKategorien = ALLE_KATEGORIEN
    .filter((k) => bestand.get(k)! < mindestbestandeMap.get(k)!)
    .sort((a, b) => bestand.get(a)! - bestand.get(b)!);

  if (knappeKategorien.length === 0) return ergebnis;

  // 4. Wunschlisten-Quote
  const { wunschlistenIds, ausListeAnteil, wunschlisteBevorzugt } = await wunschlistenQuote(
    kontoId,
    belegt
  );

  // 5. Pro knapper Kategorie einen Kandidaten ziehen, bis `anzahl` erreicht
  for (const kategorie of knappeKategorien) {
    if (ergebnis.length >= anzahl) break;

    const kandidatenInKategorie = await db
      .select()
      .from(buecher)
      .where(eq(buecher.kategorie, kategorie));

    const offen = kandidatenInKategorie.filter(
      (b) => !belegteIds.has(b.id) && !bereitsGewaehlt.has(b.id)
    );
    if (offen.length === 0) continue; // (noch) kein Kandidat in dieser Kategorie

    const ausListe = offen.filter((b) => wunschlistenIds.has(b.id));
    const andere = offen.filter((b) => !wunschlistenIds.has(b.id));

    let gewaehlt:
      | { id: string; titel: string; autor: string; umfang?: string | null; umfangGeprueftAm?: Date | null }
      | undefined;
    let quelle: VorschlagKandidat["quelle"] | undefined;
    let grund = "";

    if (wunschlisteBevorzugt && ausListe.length > 0) {
      gewaehlt = ausListe[0];
      quelle = "eigene_liste";
      grund = `Kategorie "${kategorie}" unter Mindestbestand (${bestand.get(kategorie)}/${mindestbestandeMap.get(kategorie)}); Wunschlisten-Quote noch nicht erreicht (${Math.round(ausListeAnteil * 100)}% von ${Math.round(WUNSCHLISTEN_QUOTE * 100)}%).`;
    } else if (andere.length > 0) {
      gewaehlt = andere[0];
      quelle = (andere[0].herkunft as VorschlagKandidat["quelle"]) ?? "klassiker";
      grund = `Kategorie "${kategorie}" unter Mindestbestand (${bestand.get(kategorie)}/${mindestbestandeMap.get(kategorie)}); Kandidat aus Recherche-Pool (${quelle}).`;
    } else {
      try {
        const recherchiert = await kandidatRecherchieren(kontoId, kategorie);
        gewaehlt = recherchiert;
        quelle = recherchiert.quelle;
        grund = recherchiert.grund;
      } catch (err) {
        if (ausListe.length > 0) {
          gewaehlt = ausListe[0];
          quelle = "eigene_liste";
          grund = `Kategorie "${kategorie}" unter Mindestbestand; Recherche fehlgeschlagen (${(err as Error).message}), Notlösung aus eigener Liste.`;
        }
      }
    }

    if (!gewaehlt || !quelle) continue;

    const umfang = await sicherstelleUmfang(
      gewaehlt.id,
      gewaehlt.titel,
      gewaehlt.autor,
      gewaehlt.umfang,
      gewaehlt.umfangGeprueftAm
    );

    ergebnis.push({
      buchId: gewaehlt.id,
      titel: gewaehlt.titel,
      autor: gewaehlt.autor,
      kategorie,
      quelle,
      grund,
      umfang,
    });
  }

  return ergebnis;
}

// Rein lesende Übersicht über die Kategorie-Rotation: pro Kategorie der
// aktuelle Bestand und — unabhängig davon, ob die Kategorie gerade knapp
// ist — welches Buch dort als Nächstes an der Reihe wäre. Bewusst NICHT
// dieselbe Auswahl wie vorschlaege() (die berücksichtigt zusätzlich manuell
// priorisierte "bald"-Einträge querbeet über alle Kategorien) — hier geht
// es um die reine Rotation pro Kategorie zum Nachschauen, nicht um die
// tatsächliche nächste Produktionsreihenfolge.
export type KategorieStatus = {
  kategorie: Kategorie;
  bestand: number;
  mindestbestand: number;
  naechsterKandidat: { titel: string; autor: string } | null;
};

export async function kategorieUebersicht(kontoId: string): Promise<KategorieStatus[]> {
  const belegt = await belegteBuecher();
  const belegteIds = new Set(belegt.map((r) => r.buchId));

  const bestand = await bestandProKategorie();
  const mindestbestandeMap = await mindestbestandProKategorie(kontoId);
  const { wunschlistenIds, wunschlisteBevorzugt } = await wunschlistenQuote(kontoId, belegt);

  const ergebnis: KategorieStatus[] = [];

  for (const kategorie of ALLE_KATEGORIEN) {
    const kandidatenInKategorie = await db
      .select()
      .from(buecher)
      .where(eq(buecher.kategorie, kategorie));

    const offen = kandidatenInKategorie.filter((b) => !belegteIds.has(b.id));
    const ausListe = offen.filter((b) => wunschlistenIds.has(b.id));
    const andere = offen.filter((b) => !wunschlistenIds.has(b.id));

    let gewaehlt: (typeof offen)[number] | undefined;
    if (wunschlisteBevorzugt && ausListe.length > 0) gewaehlt = ausListe[0];
    else if (andere.length > 0) gewaehlt = andere[0];
    else if (ausListe.length > 0) gewaehlt = ausListe[0];

    ergebnis.push({
      kategorie,
      bestand: bestand.get(kategorie)!,
      mindestbestand: mindestbestandeMap.get(kategorie)!,
      naechsterKandidat: gewaehlt ? { titel: gewaehlt.titel, autor: gewaehlt.autor } : null,
    });
  }

  return ergebnis;
}

// Wunschlisten-Bestand pro Kategorie, für die Filter-Chips auf der
// Wunschliste (09/2026, Pendenz "Wunschliste: Zahlangabe Bestand/
// Aufbereitet" — ersetzt die vorherige bestandUngelesenProKategorie(), die
// den Bestand ALLER produzierten Bücher zeigte, unabhängig von der
// Wunschliste). Beantwortet "wie viele meiner Wunschlisten-Einträge (eigene
// + KI-Vorschläge) gibt es in dieser Kategorie noch, und wie viele davon
// sind schon aufbereitet". Zählt JEDEN Eintrag mit Kategorie-Zuordnung,
// unabhängig von herkunft — die Wunschliste zeigt ja inzwischen auch
// KI-Vorschläge als eigene Karten. Einträge ohne buchId (reiner rohTitel,
// noch kein Datenbank-Abgleich) bleiben unberücksichtigt, weil ihnen noch
// keine Kategorie zugeordnet ist.
//
// Bewusst OHNE bereits fertig gelesene Bücher (09/2026, Nachschärfung
// "die beiden Zahlen sollen sich nur auf die Wunschliste beziehen") — ein
// Buch, das schon durchgelesen ist, gehört gedanklich nicht mehr zur
// Wunschliste, sondern zur Bibliothek (siehe bookshelf/page.tsx, "Gelesen"
// -Abschnitt); es zählt dort weiterhin über den absoluten Bibliotheks-
// Bestand mit, aber nicht mehr hier.
export async function wunschlisteBestandProKategorie(
  kontoId: string
): Promise<Map<Kategorie, { bestand: number; aufbereitet: number }>> {
  const zeilen = await db
    .select({
      kategorie: buecher.kategorie,
      status: buchinhalte.status,
      abgeschlossenAm: gezeigteBuecher.abgeschlossenAm,
    })
    .from(wunschlisteneintraege)
    .innerJoin(buecher, eq(wunschlisteneintraege.buchId, buecher.id))
    .leftJoin(buchinhalte, eq(buchinhalte.buchId, buecher.id))
    .leftJoin(
      gezeigteBuecher,
      and(eq(gezeigteBuecher.buchinhaltId, buchinhalte.id), eq(gezeigteBuecher.kontoId, kontoId))
    )
    .where(eq(wunschlisteneintraege.kontoId, kontoId));

  const ergebnis = new Map<Kategorie, { bestand: number; aufbereitet: number }>(
    ALLE_KATEGORIEN.map((k) => [k, { bestand: 0, aufbereitet: 0 }])
  );
  for (const zeile of zeilen) {
    const eintrag = ergebnis.get(zeile.kategorie as Kategorie);
    if (!eintrag) continue;
    const bereit = zeile.status === "im_vorrat";
    const fertigGelesen = bereit && zeile.abgeschlossenAm != null;
    if (fertigGelesen) continue; // gehört jetzt zur Bibliothek, nicht mehr zur Wunschliste
    eintrag.bestand += 1;
    if (bereit) eintrag.aufbereitet += 1;
  }
  return ergebnis;
}
