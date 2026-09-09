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
import { buecher, buchinhalte, wunschlisteneintraege } from "../db/schema";
import { and, eq, sql } from "drizzle-orm";
import { kandidatRecherchieren } from "./recherche";
import { umfangNachschlagen } from "./umfang";

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

const MINDESTBESTAND = 2;
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

// Wunschlisten-Quote dieses Kontos: Anteil bereits produzierter Bücher, die
// aus der eigenen Liste stammen, plus ob die Ziel-Quote (40%) noch nicht
// erreicht ist — von vorschlaege() UND kategorieUebersicht() gebraucht.
async function wunschlistenQuote(
  kontoId: string,
  belegt: { buchId: string }[]
): Promise<{ wunschlistenIds: Set<string>; ausListeAnteil: number; wunschlisteBevorzugt: boolean }> {
  const eintraege = await db
    .select({ buchId: wunschlisteneintraege.buchId })
    .from(wunschlisteneintraege)
    .where(eq(wunschlisteneintraege.kontoId, kontoId));
  const wunschlistenIds = new Set(
    eintraege.map((r) => r.buchId).filter((id): id is string => id !== null)
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
async function sicherstelleUmfang(
  buchId: string,
  titel: string,
  autor: string,
  vorhandenerUmfang: string | null | undefined
): Promise<string | null> {
  if (vorhandenerUmfang) return vorhandenerUmfang;
  const gefunden = await umfangNachschlagen(titel, autor);
  if (gefunden) {
    await db.update(buecher).set({ umfang: gefunden }).where(eq(buecher.id, buchId));
  }
  return gefunden;
}

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
      umfang: await sicherstelleUmfang(buch.buchId, buch.titel, buch.autor, buch.umfang),
    });
  }

  if (ergebnis.length >= anzahl) return ergebnis;

  const bereitsGewaehlt = new Set(ergebnis.map((e) => e.buchId));

  // 1. Bestand pro Kategorie (nur "im_vorrat")
  const bestand = await bestandProKategorie();

  // 2. Knappe Kategorien, knappste zuerst
  const knappeKategorien = ALLE_KATEGORIEN
    .filter((k) => bestand.get(k)! < MINDESTBESTAND)
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

    let gewaehlt: { id: string; titel: string; autor: string; umfang?: string | null } | undefined;
    let quelle: VorschlagKandidat["quelle"] | undefined;
    let grund = "";

    if (wunschlisteBevorzugt && ausListe.length > 0) {
      gewaehlt = ausListe[0];
      quelle = "eigene_liste";
      grund = `Kategorie "${kategorie}" unter Mindestbestand (${bestand.get(kategorie)}/${MINDESTBESTAND}); Wunschlisten-Quote noch nicht erreicht (${Math.round(ausListeAnteil * 100)}% von ${Math.round(WUNSCHLISTEN_QUOTE * 100)}%).`;
    } else if (andere.length > 0) {
      gewaehlt = andere[0];
      quelle = (andere[0].herkunft as VorschlagKandidat["quelle"]) ?? "klassiker";
      grund = `Kategorie "${kategorie}" unter Mindestbestand (${bestand.get(kategorie)}/${MINDESTBESTAND}); Kandidat aus Recherche-Pool (${quelle}).`;
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

    const umfang = await sicherstelleUmfang(gewaehlt.id, gewaehlt.titel, gewaehlt.autor, gewaehlt.umfang);

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
      mindestbestand: MINDESTBESTAND,
      naechsterKandidat: gewaehlt ? { titel: gewaehlt.titel, autor: gewaehlt.autor } : null,
    });
  }

  return ergebnis;
}
