// app/buecherliste/neu/actions.ts
//
// Server Action fürs Hinzufügen eines Wunschbuchs. Vereinfachung gegenüber
// dem Konzept: der dort vorgesehene Datenbank-Abgleich zur Disambiguierung
// und die automatische Kategorie-Erkennung (z.B. per Google Books/KI) sind
// noch nicht gebaut — hier wählt der Nutzer die Kategorie stattdessen
// manuell aus einer Liste. Titel+Autor werden gegen bestehende `buecher`
// abgeglichen (case-insensitiv), um Duplikate zu vermeiden.

"use server";

import { redirect } from "next/navigation";
import { and, ilike } from "drizzle-orm";
import { db } from "../../../src/db";
import { buecher, kategorieEnum, konten, wunschlisteneintraege } from "../../../src/db/schema";

export async function buchHinzufuegen(formData: FormData) {
  const titel = String(formData.get("titel") ?? "").trim();
  const autor = String(formData.get("autor") ?? "").trim();
  const originalsprache = String(formData.get("originalsprache") ?? "").trim() || "Deutsch";
  const kategorie = String(formData.get("kategorie") ?? "") as (typeof kategorieEnum.enumValues)[number];
  const notiz = String(formData.get("notiz") ?? "").trim();
  const bald = formData.get("bald") === "on";

  if (!titel || !kategorie) return;

  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) return;

  const bedingungen = [ilike(buecher.titel, titel)];
  if (autor) bedingungen.push(ilike(buecher.autor, autor));

  let [buch] = await db
    .select()
    .from(buecher)
    .where(and(...bedingungen));

  if (!buch) {
    [buch] = await db
      .insert(buecher)
      .values({ titel, autor: autor || "Unbekannt", originalsprache, kategorie })
      .returning();
  }

  await db.insert(wunschlisteneintraege).values({
    kontoId: konto.id,
    buchId: buch.id,
    notiz: notiz || null,
    bald,
  });

  redirect("/buecherliste");
}
