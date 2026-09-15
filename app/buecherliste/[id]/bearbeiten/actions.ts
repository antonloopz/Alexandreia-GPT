// app/buecherliste/[id]/bearbeiten/actions.ts
//
// Server Action fürs Bearbeiten eines bestehenden Wunschlisten-Eintrags
// (09/2026, Pendenz "Wunschliste: Einträge bearbeiten/löschen"). Anders als
// beim Hinzufügen (buecherliste/neu/actions.ts) gibt es hier keinen
// Titel/Autor-Abgleich gegen bestehende Bücher mehr — das Buch existiert
// ja bereits (buchId ist beim Erstellen eines Eintrags immer gesetzt, siehe
// buecherliste/neu/actions.ts), es werden nur dessen Felder aktualisiert.
// Kategorie ist hier bewusst PFLICHT (anders als im Hinzufügen-Formular,
// wo "Automatisch erkennen" zulässig ist) — das Buch hat zu diesem
// Zeitpunkt immer schon eine Kategorie, ein Zurücksetzen auf "automatisch"
// ergibt beim Bearbeiten keinen Sinn.

"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "../../../../src/db";
import { buecher, kategorieEnum, wunschlisteneintraege } from "../../../../src/db/schema";

export async function eintragAktualisieren(eintragId: string, formData: FormData) {
  const titel = String(formData.get("titel") ?? "").trim();
  const autor = String(formData.get("autor") ?? "").trim();
  const originalsprache = String(formData.get("originalsprache") ?? "").trim() || "Deutsch";
  const kategorie = String(formData.get("kategorie") ?? "").trim() as (typeof kategorieEnum.enumValues)[number];
  const notiz = String(formData.get("notiz") ?? "").trim();
  const bald = formData.get("bald") === "on";

  if (!titel || !kategorie) return;

  const [eintrag] = await db
    .select({ buchId: wunschlisteneintraege.buchId })
    .from(wunschlisteneintraege)
    .where(eq(wunschlisteneintraege.id, eintragId));
  if (!eintrag) return;

  // buchId ist bei jedem über buecherliste/neu angelegten Eintrag gesetzt
  // (siehe dortige actions.ts) — ohne verknüpftes Buch gibt es hier nichts
  // zu bearbeiten.
  if (eintrag.buchId) {
    await db
      .update(buecher)
      .set({ titel, autor: autor || "Unbekannt", originalsprache, kategorie })
      .where(eq(buecher.id, eintrag.buchId));
  }

  await db
    .update(wunschlisteneintraege)
    .set({ notiz: notiz || null, bald })
    .where(eq(wunschlisteneintraege.id, eintragId));

  redirect("/buecherliste");
}
