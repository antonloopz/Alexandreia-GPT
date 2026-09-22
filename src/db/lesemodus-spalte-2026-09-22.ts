// src/db/lesemodus-spalte-2026-09-22.ts
//
// Fügt kontoeinstellungen die Spalte "lesemodus" hinzu (schema.ts, Pendenz
// "Lesemodus"). Per SQL statt `npx drizzle-kit push` (siehe CLAUDE.md:
// drizzle-kit meldet bestehende Constraints fälschlich als fehlend und
// bietet an, Tabellen zu leeren). Nur neue Spalte, idempotent.
//
// Ausführen mit:  npx tsx src/db/lesemodus-spalte-2026-09-22.ts

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL!);
  await sql.query(`alter table "kontoeinstellungen" add column if not exists "lesemodus" jsonb`);
  const [z] = await sql.query(`select count(*)::int as n from "kontoeinstellungen"`);
  console.log(`Spalte lesemodus vorhanden. kontoeinstellungen: ${z.n} Zeile(n), unverändert.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
