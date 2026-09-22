// src/db/wieder-im-lauf-spalten-2026-09-22.ts
//
// Fügt gezeigte_buecher die Spalten für "Gelesene Bücher wieder in den Lauf
// aufnehmen" hinzu (wiederImLaufSeit, erneutGezeigtAm, durchgaenge — siehe
// schema.ts). Per SQL statt `npx drizzle-kit push`, weil drizzle-kit
// bestehende unique-Constraints fälschlich als fehlend meldet und dabei
// anbietet, Tabellen zu leeren (siehe CLAUDE.md). Fügt nur Spalten hinzu,
// ändert keine bestehenden Daten. Idempotent.
//
// Ausführen mit:  npx tsx src/db/wieder-im-lauf-spalten-2026-09-22.ts

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL!);

  await sql.query(`alter table "gezeigte_buecher" add column if not exists "wiederImLaufSeit" timestamp`);
  await sql.query(`alter table "gezeigte_buecher" add column if not exists "erneutGezeigtAm" date`);
  await sql.query(`alter table "gezeigte_buecher" add column if not exists "durchgaenge" integer not null default 1`);

  const [z] = await sql.query(
    `select count(*)::int as n, count("abgeschlossenAm")::int as gelesen from "gezeigte_buecher"`
  );
  console.log(`Spalten vorhanden. gezeigte_buecher: ${z.n} Zeilen, davon ${z.gelesen} gelesen (unverändert).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
