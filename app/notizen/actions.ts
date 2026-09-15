// app/notizen/actions.ts
//
// Server Actions für Hervorhebungen/Notizen (notizen-Tabelle) — genutzt vom
// Lesen-Screen (Hervorhebbarer.tsx, Text markieren + optional Notiz) und von
// dieser Notizen-Übersicht selbst (Entfernen). Feature "Notiz-/Highlight-
// Funktion" 09/2026.

"use server";

import { db } from "../../src/db";
import { konten, notizen, repetitionselemente } from "../../src/db/schema";
import { and, eq } from "drizzle-orm";
import type { NotizFeld } from "../../src/lib/notizen";
import { faelligkeitFuer } from "../../src/lib/wiederholung";

export type { NotizFeld };

export async function hervorhebungErstellen(buchinhaltId: string, feld: NotizFeld, textAuszugRoh: string) {
  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) return null;

  const textAuszug = textAuszugRoh.trim();
  if (!textAuszug) return null;

  const [zeile] = await db
    .insert(notizen)
    .values({ kontoId: konto.id, buchinhaltId, feld, textAuszug })
    .returning();
  return zeile;
}

export async function notizSpeichern(id: string, textRoh: string) {
  const text = textRoh.trim();
  await db
    .update(notizen)
    .set({ text: text.length > 0 ? text : null })
    .where(eq(notizen.id, id));
}

export async function hervorhebungLoeschen(id: string) {
  await db.delete(notizen).where(eq(notizen.id, id));
}

// Hervorhebung/Notiz optional zur Wiederholung (Spaced Repetition, siehe
// src/lib/wiederholung.ts) hinzufügen bzw. wieder entfernen — Pendenz
// "Notizen/Hervorhebungen optional in die Wiederholung aufnehmen", 09/2026.
// Genutzt vom Popover im Lesen-Screen (Hervorhebbarer.tsx) UND von der
// Notizen-Übersicht selbst. Startet bewusst auf Intervallstufe 0 (morgen
// wieder fällig) statt sofort — konsistent mit einer frisch erstellten
// Lernkarten-Wiederholung.
export async function wiederholungHinzufuegen(notizId: string) {
  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) return;

  const [bestehend] = await db
    .select()
    .from(repetitionselemente)
    .where(and(eq(repetitionselemente.kontoId, konto.id), eq(repetitionselemente.notizId, notizId)));
  if (bestehend) return;

  await db.insert(repetitionselemente).values({
    kontoId: konto.id,
    notizId,
    naechsteFaelligkeit: faelligkeitFuer(0),
    intervallstufe: 0,
  });
}

export async function wiederholungEntfernen(notizId: string) {
  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) return;

  await db
    .delete(repetitionselemente)
    .where(and(eq(repetitionselemente.kontoId, konto.id), eq(repetitionselemente.notizId, notizId)));
}
