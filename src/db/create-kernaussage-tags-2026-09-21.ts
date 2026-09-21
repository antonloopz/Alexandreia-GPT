// src/db/create-kernaussage-tags-2026-09-21.ts
//
// Legt die Tabelle kernaussage_tags (schema.ts, Pendenz "Vernetzung")
// direkt per SQL an — Ersatz für `npx drizzle-kit push`, das bestehende
// unique-Constraints (buch_tags, repetitionselemente) fälschlich als fehlend
// meldet und dabei anbietet, Tabellen zu leeren (siehe CLAUDE.md). Legt nur
// Neues an, ändert keine bestehenden Daten. Idempotent.
//
// Ausführen mit:  npx tsx src/db/create-kernaussage-tags-2026-09-21.ts

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL!);

  await sql.query(`
    create table if not exists "kernaussage_tags" (
      "kernaussageId" uuid not null references "kernaussagen"("id") on delete cascade,
      "tagId" uuid not null references "tags"("id") on delete cascade
    )
  `);
  const vorhanden = await sql.query("select 1 from pg_constraint where conname = $1", [
    "kernaussage_tags_kernaussage_tag_key",
  ]);
  if (vorhanden.length === 0) {
    await sql.query(
      `alter table "kernaussage_tags" add constraint "kernaussage_tags_kernaussage_tag_key" unique ("kernaussageId", "tagId")`
    );
  }
  const [{ n }] = await sql.query(`select count(*)::int as n from "kernaussage_tags"`);
  console.log(`kernaussage_tags vorhanden (${n} Zeilen), Constraint vorhanden.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
