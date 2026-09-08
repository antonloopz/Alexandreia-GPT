// src/db/index.ts
//
// Drizzle-Client für Laufzeit-Code (API-Routen, Cron-Jobs, Skripte) —
// getrennt von drizzle.config.ts, das nur drizzle-kit (push/generate) steuert.

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
