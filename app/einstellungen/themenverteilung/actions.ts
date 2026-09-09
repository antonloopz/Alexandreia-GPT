// app/einstellungen/themenverteilung/actions.ts
//
// Server Action für die Themenverteilung-Unterseite. Schreibt einen
// Mindestbestand-Wert pro Kategorie in kontoeinstellungen.kategorieZielwerte
// (siehe src/lib/vorschlag.ts, mindestbestandProKategorie() liest das dann
// statt des festen Standardwerts). Legt die kontoeinstellungen-Zeile bei
// Bedarf an, genau wie die beiden Export-Toggles in ../actions.ts.

"use server";

import { redirect } from "next/navigation";
import { db } from "../../../src/db";
import { konten, kontoeinstellungen } from "../../../src/db/schema";
import { ALLE_KATEGORIEN, STANDARD_MINDESTBESTAND } from "../../../src/lib/vorschlag";

export async function zielwerteSpeichern(formData: FormData) {
  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) return;

  const zielwerte: Record<string, number> = {};
  for (const kategorie of ALLE_KATEGORIEN) {
    const eingabe = Number(formData.get(`zielwert_${kategorie}`));
    zielwerte[kategorie] =
      Number.isFinite(eingabe) && eingabe >= 0 ? Math.round(eingabe) : STANDARD_MINDESTBESTAND;
  }

  await db
    .insert(kontoeinstellungen)
    .values({ kontoId: konto.id, kategorieZielwerte: zielwerte })
    .onConflictDoUpdate({ target: kontoeinstellungen.kontoId, set: { kategorieZielwerte: zielwerte } });

  redirect("/einstellungen");
}
