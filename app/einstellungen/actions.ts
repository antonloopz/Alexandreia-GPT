// app/einstellungen/actions.ts
//
// Server Actions für die beiden Export-Toggles. Legt die kontoeinstellungen-
// Zeile bei Bedarf an (existiert bisher nicht automatisch — seed.ts hat nur
// die konten-Zeile angelegt), sonst wird nur das jeweilige Feld aktualisiert.

"use server";

import { db } from "../../src/db";
import { konten, kontoeinstellungen } from "../../src/db/schema";
import { eq } from "drizzle-orm";

export async function obsidianExportUmschalten(aktiv: boolean) {
  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) return;

  await db
    .insert(kontoeinstellungen)
    .values({ kontoId: konto.id, obsidianExportAktiv: aktiv })
    .onConflictDoUpdate({ target: kontoeinstellungen.kontoId, set: { obsidianExportAktiv: aktiv } });
}

export async function ankiExportUmschalten(aktiv: boolean) {
  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) return;

  await db
    .insert(kontoeinstellungen)
    .values({ kontoId: konto.id, ankiExportAktiv: aktiv })
    .onConflictDoUpdate({ target: kontoeinstellungen.kontoId, set: { ankiExportAktiv: aktiv } });
}
