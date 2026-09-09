// app/buecherliste/neu/actions.ts
//
// Server Action fürs Hinzufügen eines Wunschbuchs. Die Kategorie im
// Formular ist jetzt optional ("Automatisch erkennen") — wird sie
// weggelassen, übernimmt kategorieErkennen() (Claude-Klassifikation ohne
// Websuche, siehe src/lib/kategorieerkennung.ts) diese Aufgabe, nur wenn
// wirklich ein neues `buecher`-Buch angelegt werden muss (ein bereits
// bekanntes Buch hat schon eine Kategorie). Schlägt auch das fehl, geht's
// zurück zum Formular mit einem Fehlerhinweis und den bisherigen Eingaben
// vorausgefüllt — dann kann der Nutzer die Kategorie manuell wählen.
// Titel+Autor werden gegen bestehende `buecher` abgeglichen
// (case-insensitiv), um Duplikate zu vermeiden.

"use server";

import { redirect } from "next/navigation";
import { and, ilike } from "drizzle-orm";
import { db } from "../../../src/db";
import { buecher, kategorieEnum, konten, wunschlisteneintraege } from "../../../src/db/schema";
import { kategorieErkennen } from "../../../src/lib/kategorieerkennung";

export async function buchHinzufuegen(formData: FormData) {
  const titel = String(formData.get("titel") ?? "").trim();
  const autor = String(formData.get("autor") ?? "").trim();
  const originalsprache = String(formData.get("originalsprache") ?? "").trim() || "Deutsch";
  const kategorieEingabe = String(formData.get("kategorie") ?? "").trim() as
    | (typeof kategorieEnum.enumValues)[number]
    | "";
  const notiz = String(formData.get("notiz") ?? "").trim();
  const bald = formData.get("bald") === "on";

  if (!titel) return;

  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) return;

  const bedingungen = [ilike(buecher.titel, titel)];
  if (autor) bedingungen.push(ilike(buecher.autor, autor));

  let [buch] = await db
    .select()
    .from(buecher)
    .where(and(...bedingungen));

  if (!buch) {
    let kategorie: (typeof kategorieEnum.enumValues)[number] | null = kategorieEingabe || null;
    if (!kategorie) {
      kategorie = await kategorieErkennen(titel, autor);
    }

    if (!kategorie) {
      const params = new URLSearchParams({ fehler: "kategorie", titel, originalsprache });
      if (autor) params.set("autor", autor);
      if (notiz) params.set("notiz", notiz);
      if (bald) params.set("bald", "on");
      redirect(`/buecherliste/neu?${params.toString()}`);
    }

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
