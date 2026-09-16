// app/einstellungen/actions.ts
//
// Server Actions für den Obsidian-Export-Toggle und den Ordnernamen dafür.
// Legt die kontoeinstellungen-Zeile bei Bedarf an (existiert bisher nicht
// automatisch — seed.ts hat nur die konten-Zeile angelegt), sonst wird nur
// das jeweilige Feld aktualisiert. Anki-Export (nie über den Schalter
// hinaus gebaut) wieder entfernt, siehe Pendenz "Anki-Exportfunktion
// entfernen".

"use server";

import { db } from "../../src/db";
import { konten, kontoeinstellungen } from "../../src/db/schema";

export async function obsidianExportUmschalten(aktiv: boolean) {
  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) return;

  await db
    .insert(kontoeinstellungen)
    .values({ kontoId: konto.id, obsidianExportAktiv: aktiv })
    .onConflictDoUpdate({ target: kontoeinstellungen.kontoId, set: { obsidianExportAktiv: aktiv } });
}

// Ordner-/Vaultname für den Obsidian-Export (09/2026, Pendenz "Obsidian-
// Export für Notizen fertigstellen") — optional; leer = Dateien landen im
// ZIP-Wurzelverzeichnis. Siehe src/lib/obsidian.ts.
export async function obsidianVaultNameSpeichern(nameRoh: string) {
  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) return;

  const name = nameRoh.trim();
  await db
    .insert(kontoeinstellungen)
    .values({ kontoId: konto.id, obsidianVaultName: name.length > 0 ? name : null })
    .onConflictDoUpdate({
      target: kontoeinstellungen.kontoId,
      set: { obsidianVaultName: name.length > 0 ? name : null },
    });
}
