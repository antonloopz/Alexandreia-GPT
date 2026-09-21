// src/lib/fertigstellung.ts
//
// Steuerung der dreistufigen Buch-Produktion (09/2026, siehe CLAUDE.md
// "Inhaltliches Grundprinzip"). Hintergrund: alles in einem Lauf passte
// nicht mehr sicher in maxDuration (Vercel Hobby: höchstens 300 s), und
// die Prüfung verwarf ganze Entwürfe wegen Kleinigkeiten.
//
//   Stufe 1 — Original (app/api/cron/produzieren, Button "Jetzt aufbereiten")
//     Entwurf → Status "in_aufbereitung"            (entwurf.ts pipelineSchritt)
//   Stufe 2 — Prüfung (app/api/cron/pruefen[-2])
//     Prüfung + Korrektur → "geprueft"              (entwurfPruefenUndKorrigieren)
//     schwere Fehler → Entwurf gelöscht, Buch wieder frei
//   Stufe 3 — Synthese + Wissensstatus (app/api/cron/fertigstellen[-2])
//     Einordnung, "Das bleibt hängen", Wissensstatus pro Kernaussage, Tags,
//     Quiz → "im_vorrat" (sichtbar)                 (fertigstellen, unten)
//
// Jeder Lauf erledigt genau EIN Buch (ältestes zuerst). Stufe 3: Synthese,
// Wissensstatus und Tags sind optional — scheitern sie, wird das Buch trotzdem
// fertiggestellt (die Screens blenden fehlende Abschnitte aus) und kann
// später per src/scripts/ergaenzungen-nachziehen.ts ergänzt werden. Das
// Quiz ist Pflicht — ohne Quizfragen bleibt der Status "geprueft" und der
// nächste Lauf versucht es erneut. Nebeneffekt: früher bei "geprueft"
// hängengebliebene Bücher (check-stuck-buchinhalte-2026-09-20.ts) werden
// so ebenfalls automatisch nachgezogen.

import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { buchinhalte, buecher, kernaussagen, quizfragen } from "../db/schema";
import { entwurfPruefenUndKorrigieren, ergaenzungenErstellen, type PruefErgebnis } from "./entwurf";
import { erstelleQuizfragen } from "./quiz-generierung";
import { hatTags, tagsVergeben } from "./tags";

async function aeltesterMitStatus(status: "in_aufbereitung" | "geprueft"): Promise<string | null> {
  const [zeile] = await db
    .select({ id: buchinhalte.id })
    .from(buchinhalte)
    .where(eq(buchinhalte.status, status))
    .orderBy(asc(buchinhalte.erstelltAm))
    .limit(1);
  return zeile?.id ?? null;
}

// ---------------------------------------------------------------------------
// Stufe 2
// ---------------------------------------------------------------------------

export function naechsterZuPruefender(): Promise<string | null> {
  return aeltesterMitStatus("in_aufbereitung");
}

export async function pruefen(buchinhaltId: string): Promise<PruefErgebnis & { titel: string }> {
  const [buch] = await db
    .select({ titel: buecher.titel })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.id, buchinhaltId));
  const ergebnis = await entwurfPruefenUndKorrigieren(buchinhaltId);
  return { ...ergebnis, titel: buch?.titel ?? "?" };
}

// ---------------------------------------------------------------------------
// Stufe 3
// ---------------------------------------------------------------------------

export type FertigstellungErgebnis = {
  buchinhaltId: string;
  titel: string;
  status: "im_vorrat" | "geprueft";
  ergaenzungen: "ergaenzt" | "vorhanden" | "fehlgeschlagen";
  einordnungHeute: string | null;
  wissensstatusAnzahl: number;
  tags: string[];
  quizfragenAnzahl: number;
  hinweise: string[];
};

export function naechsterFertigzustellender(): Promise<string | null> {
  return aeltesterMitStatus("geprueft");
}

export async function fertigstellen(buchinhaltId: string): Promise<FertigstellungErgebnis> {
  const [zeile] = await db
    .select({
      buchId: buecher.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
      zusammenfassung: buchinhalte.zusammenfassung,
      einordnung: buchinhalte.einordnung,
      bleibtHaengen: buchinhalte.bleibtHaengen,
    })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.id, buchinhaltId));
  if (!zeile) throw new Error(`Buchinhalt ${buchinhaltId} nicht gefunden.`);

  const aussagen = await db
    .select({ id: kernaussagen.id, text: kernaussagen.text, erklaerung: kernaussagen.erklaerung })
    .from(kernaussagen)
    .where(eq(kernaussagen.buchinhaltId, buchinhaltId))
    .orderBy(asc(kernaussagen.reihenfolge));

  const hinweise: string[] = [];
  let ergaenzungen: FertigstellungErgebnis["ergaenzungen"] = "vorhanden";
  let einordnungHeute: string | null = zeile.einordnung?.heute?.urteil ?? null;
  let wissensstatusAnzahl = 0;

  // 1. Synthese + Wissensstatus (optional, siehe Kopfkommentar)
  if (!zeile.einordnung || !zeile.bleibtHaengen) {
    try {
      const ergebnis = await ergaenzungenErstellen(
        zeile.titel,
        zeile.autor,
        zeile.kategorie,
        zeile.zusammenfassung,
        aussagen
      );
      await db
        .update(buchinhalte)
        .set({ einordnung: ergebnis.einordnung, bleibtHaengen: ergebnis.bleibtHaengen })
        .where(eq(buchinhalte.id, buchinhaltId));
      for (const w of ergebnis.wissensstatus) {
        await db
          .update(kernaussagen)
          .set({ wissensstatus: w.wissensstatus })
          .where(eq(kernaussagen.id, aussagen[w.index].id));
      }
      ergaenzungen = "ergaenzt";
      einordnungHeute = ergebnis.einordnung?.heute?.urteil ?? null;
      wissensstatusAnzahl = ergebnis.wissensstatus.length;
      hinweise.push(...ergebnis.hinweise);
      if (!ergebnis.einordnung) hinweise.push("Keine Einordnung erzeugt.");
      if (!ergebnis.bleibtHaengen) hinweise.push("Kein 'Das bleibt hängen' erzeugt.");
    } catch (err) {
      ergaenzungen = "fehlgeschlagen";
      const nachricht = err instanceof Error ? err.message : String(err);
      hinweise.push(`Synthese/Wissensstatus fehlgeschlagen (später nachziehbar): ${nachricht}`);
      console.error(`[fertigstellung] Ergänzungen für "${zeile.titel}" fehlgeschlagen:`, err);
    }
  }

  // 2. Tags (optional, siehe lib/tags.ts) — nur wenn das Buch noch keine
  // hat (hängen am Buch, überleben also eine Neu-Aufbereitung).
  let tagNamen: string[] = [];
  try {
    if (!(await hatTags(zeile.buchId))) {
      const vergabe = await tagsVergeben(
        zeile.buchId,
        zeile.titel,
        zeile.autor,
        zeile.kategorie,
        zeile.zusammenfassung,
        aussagen.map((a) => a.text)
      );
      tagNamen = vergabe.tags;
      if (vergabe.neu.length) hinweise.push(`Neue Tags: ${vergabe.neu.join(", ")}`);
      if (vergabe.aliaseErgaenzt.length) hinweise.push(`Synonyme zugeordnet: ${vergabe.aliaseErgaenzt.join("; ")}`);
    }
  } catch (err) {
    const nachricht = err instanceof Error ? err.message : String(err);
    hinweise.push(`Tags fehlgeschlagen (später nachziehbar): ${nachricht}`);
    console.error(`[fertigstellung] Tags für "${zeile.titel}" fehlgeschlagen:`, err);
  }

  // 3. Quiz (Pflicht). Existieren schon Quizfragen (z.B. ein früher
  // hängengebliebener Buchinhalt), nicht doppelt erzeugen, nur freischalten.
  const vorhandeneQuizfragen = await db
    .select({ id: quizfragen.id })
    .from(quizfragen)
    .innerJoin(kernaussagen, eq(quizfragen.kernaussageId, kernaussagen.id))
    .where(eq(kernaussagen.buchinhaltId, buchinhaltId));

  let quizfragenAnzahl = vorhandeneQuizfragen.length;
  if (quizfragenAnzahl > 0) {
    await db.update(buchinhalte).set({ status: "im_vorrat" }).where(eq(buchinhalte.id, buchinhaltId));
  } else {
    const quiz = await erstelleQuizfragen(buchinhaltId, zeile.titel, zeile.autor);
    quizfragenAnzahl = quiz.quizfragenAnzahl;
    hinweise.push(...quiz.uebersprungen);
  }

  return {
    buchinhaltId,
    titel: zeile.titel,
    status: quizfragenAnzahl > 0 ? "im_vorrat" : "geprueft",
    ergaenzungen,
    einordnungHeute,
    wissensstatusAnzahl,
    tags: tagNamen,
    quizfragenAnzahl,
    hinweise,
  };
}
