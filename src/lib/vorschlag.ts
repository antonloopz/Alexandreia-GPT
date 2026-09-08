// src/lib/vorschlag.ts
//
// Erster Schritt der Content-Pipeline (Konzept Abschnitt "Pipeline"):
// "Vorschlag" — zeigt die nächsten Buchkandidaten vorab, bevor irgendein
// Entwurf/Prüfung passiert. Reiner Lese-Vorgang, keine Nebenwirkungen:
// legt nichts an, markiert nichts als "in Bearbeitung".
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
//    Büchern unter der Ziel-Quote (40%) liegt — sonst aus anderen Quellen,
//    falls vorhanden (aktuell ist der Buch-Katalog nur wunschlisten-
//    gespeist; Klassiker/Geheimtipp/Synergie-Kandidaten kommen erst mit
//    der externen Recherche in einem späteren Schritt dazu).
// 4. Bücher, für die schon ein Buchinhalt existiert (gleich welchen
//    Status), sind keine Kandidaten mehr.

import { db } from "../db";
import { buecher, buchinhalte, wunschlisteneintraege } from "../db/schema";
import { and, eq, sql } from "drizzle-orm";

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
};

export async function vorschlaege(
  kontoId: string,
  anzahl = 3
): Promise<VorschlagKandidat[]> {
  // Bereits mit Buchinhalt versehene Bücher ausschliessen (gleich welchen
  // Status — "in Bearbeitung" ist kein Kandidat mehr). Vorgezogen, weil
  // sowohl die manuelle Priorisierung (Schritt 0) als auch die
  // Kategorie-Logik das brauchen.
  const belegt = await db.select({ buchId: buchinhalte.buchId }).from(buchinhalte);
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
    });
  }

  if (ergebnis.length >= anzahl) return ergebnis;

  const bereitsGewaehlt = new Set(ergebnis.map((e) => e.buchId));

  // 1. Bestand pro Kategorie (nur "im_vorrat")
  const bestandRows = await db
    .select({ kategorie: buecher.kategorie, anzahl: sql<number>`count(*)::int` })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.status, "im_vorrat"))
    .groupBy(buecher.kategorie);

  const bestand = new Map<Kategorie, number>(ALLE_KATEGORIEN.map((k) => [k, 0]));
  for (const row of bestandRows) bestand.set(row.kategorie as Kategorie, row.anzahl);

  // 2. Knappe Kategorien, knappste zuerst
  const knappeKategorien = ALLE_KATEGORIEN
    .filter((k) => bestand.get(k)! < MINDESTBESTAND)
    .sort((a, b) => bestand.get(a)! - bestand.get(b)!);

  if (knappeKategorien.length === 0) return ergebnis;

  // 4. Wunschlisten-Quote: Anteil bereits produzierter Bücher, die aus der
  //    eigenen Liste dieses Kontos stammen
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

    let gewaehlt: (typeof offen)[number];
    let quelle: VorschlagKandidat["quelle"];
    let grund: string;

    if (wunschlisteBevorzugt && ausListe.length > 0) {
      gewaehlt = ausListe[0];
      quelle = "eigene_liste";
      grund = `Kategorie "${kategorie}" unter Mindestbestand (${bestand.get(kategorie)}/${MINDESTBESTAND}); Wunschlisten-Quote noch nicht erreicht (${Math.round(ausListeAnteil * 100)}% von ${Math.round(WUNSCHLISTEN_QUOTE * 100)}%).`;
    } else if (andere.length > 0) {
      gewaehlt = andere[0];
      quelle = "klassiker"; // Platzhalter, solange es keine feinere Herkunftsmarkierung im Katalog gibt
      grund = `Kategorie "${kategorie}" unter Mindestbestand (${bestand.get(kategorie)}/${MINDESTBESTAND}); Wunschlisten-Quote bereits erreicht, Kandidat aus anderer Quelle.`;
    } else if (ausListe.length > 0) {
      gewaehlt = ausListe[0];
      quelle = "eigene_liste";
      grund = `Kategorie "${kategorie}" unter Mindestbestand (${bestand.get(kategorie)}/${MINDESTBESTAND}); kein Nicht-Wunschlisten-Kandidat verfügbar, daher trotzdem aus eigener Liste.`;
    } else {
      continue;
    }

    ergebnis.push({
      buchId: gewaehlt.id,
      titel: gewaehlt.titel,
      autor: gewaehlt.autor,
      kategorie,
      quelle,
      grund,
    });
  }

  return ergebnis;
}
