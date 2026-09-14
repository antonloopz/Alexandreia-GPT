// app/notizen/actions.ts
//
// Server Actions für Hervorhebungen/Notizen (notizen-Tabelle) — genutzt vom
// Lesen-Screen (Hervorhebbarer.tsx, Text markieren + optional Notiz) und von
// dieser Notizen-Übersicht selbst (Entfernen). Feature "Notiz-/Highlight-
// Funktion" 09/2026.

"use server";

import { db } from "../../src/db";
import { konten, notizen } from "../../src/db/schema";
import { eq } from "drizzle-orm";

export type NotizFeld =
  | "zusammenfassung"
  | "entstehungsgeschichte"
  | "autorenhintergrund"
  | "kernzitat_original"
  | "kernzitat_uebersetzung";

export const FELD_LABEL: Record<NotizFeld, string> = {
  zusammenfassung: "Zusammenfassung",
  entstehungsgeschichte: "Entstehungsgeschichte",
  autorenhintergrund: "Autor",
  kernzitat_original: "Kernzitat",
  kernzitat_uebersetzung: "Kernzitat",
};

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
