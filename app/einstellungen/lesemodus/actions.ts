// app/einstellungen/lesemodus/actions.ts
//
// Server Action: Lesemodus speichern (09/2026, siehe src/lib/lesemodus.ts).
// Legt die kontoeinstellungen-Zeile bei Bedarf an (wie die Obsidian-
// Actions in app/einstellungen/actions.ts). Werte werden serverseitig
// normalisiert — Server Actions sind öffentlich aufrufbar.

"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../../src/db";
import { konten, kontoeinstellungen } from "../../../src/db/schema";
import { normalisiereLesemodus } from "../../../src/lib/lesemodus";

export async function lesemodusSpeichern(roh: unknown) {
  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) return;
  const lesemodus = normalisiereLesemodus(roh);
  await db
    .insert(kontoeinstellungen)
    .values({ kontoId: konto.id, lesemodus })
    .onConflictDoUpdate({ target: kontoeinstellungen.kontoId, set: { lesemodus } });
  revalidatePath("/einstellungen");
}
