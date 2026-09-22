// src/lib/lesemodus-laden.ts
//
// Lädt den Lesemodus (siehe lesemodus.ts) eines Kontos — getrennt von
// lesemodus.ts, weil dieses auch in Client Components landet und keinen
// DB-Import tragen darf. Ohne Einstellung: Standardwerte.

import { eq } from "drizzle-orm";
import { db } from "../db";
import { kontoeinstellungen } from "../db/schema";
import { normalisiereLesemodus, type Lesemodus } from "./lesemodus";

export async function ladeLesemodus(kontoId: string | undefined): Promise<Lesemodus> {
  if (!kontoId) return normalisiereLesemodus(null);
  const [zeile] = await db
    .select({ lesemodus: kontoeinstellungen.lesemodus })
    .from(kontoeinstellungen)
    .where(eq(kontoeinstellungen.kontoId, kontoId));
  return normalisiereLesemodus(zeile?.lesemodus ?? null);
}
