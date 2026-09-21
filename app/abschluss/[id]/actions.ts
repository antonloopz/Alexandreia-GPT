// app/abschluss/[id]/actions.ts
//
// Server Action: Buch-Feedback speichern (09/2026, Buch-Bewertung Phase 1)
// — Buchwert (stark/solide/schwach), "Im Original lesen" und "Aufbereitung
// war schwach", siehe gezeigteBuecher in src/db/schema.ts. Aufrufer:
// BuchBewertung.tsx (Abschluss-Screen). Jede Angabe wird einzeln als
// Teil-Update gespeichert (sofort beim Antippen, kein Speichern-Button).
//
// Aktualisiert NUR eine bestehende gezeigte_buecher-Zeile: sobald ein Buch
// einmal gezeigt wurde, existiert sie (sicherstelleGezeigt() in
// src/lib/tagesbuch.ts). Fehlt sie, passiert bewusst nichts — hier eine
// anzulegen würde sicherstelleGezeigt() (Datum/Quelle) umgehen.

"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../../src/db";
import { buchBewertungEnum, gezeigteBuecher, konten } from "../../../src/db/schema";
import { and, eq } from "drizzle-orm";

export type BuchBewertung = (typeof buchBewertungEnum.enumValues)[number];

export type BuchFeedback = {
  buchBewertung: BuchBewertung | null;
  imOriginalLesen: boolean;
  aufbereitungSchwach: boolean;
};

export async function buchFeedbackSpeichern(buchinhaltId: string, aenderung: Partial<BuchFeedback>) {
  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) return;

  // Serverseitig validieren — Server Actions sind öffentlich aufrufbare
  // Endpunkte, der Client-Typ allein schützt nicht.
  const werte: Partial<BuchFeedback> = {};
  if ("buchBewertung" in aenderung) {
    const b = aenderung.buchBewertung;
    if (b != null && !buchBewertungEnum.enumValues.includes(b as BuchBewertung)) {
      throw new Error(`buchFeedbackSpeichern: ungültige Bewertung ${String(b)}`);
    }
    werte.buchBewertung = b ?? null;
  }
  if (typeof aenderung.imOriginalLesen === "boolean") werte.imOriginalLesen = aenderung.imOriginalLesen;
  if (typeof aenderung.aufbereitungSchwach === "boolean") werte.aufbereitungSchwach = aenderung.aufbereitungSchwach;
  if (Object.keys(werte).length === 0) return;

  await db
    .update(gezeigteBuecher)
    .set(werte)
    .where(and(eq(gezeigteBuecher.kontoId, konto.id), eq(gezeigteBuecher.buchinhaltId, buchinhaltId)));

  revalidatePath(`/abschluss/${buchinhaltId}`);
  revalidatePath("/bookshelf");
}
