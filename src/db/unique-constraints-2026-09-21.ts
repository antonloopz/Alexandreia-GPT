// src/db/unique-constraints-2026-09-21.ts
//
// Legt die unique-Constraints aus schema.ts direkt per SQL an, OHNE
// drizzle-kit push: drizzle-kit bietet beim Hinzufügen eines Constraints zu
// einer befüllten Tabelle an, die Tabelle zu leeren ("Yes, I want to
// truncate") — bei repetitionselemente wäre der ganze Wiederholungs-
// Fortschritt weg. Dieses Skript fügt nur die Constraints hinzu; schlägt
// eines fehl (Duplikate), bricht Postgres ab, ohne Daten zu ändern.
// Duplikate vorher prüfen: src/db/dedupe-repetitionselemente-2026-09-21.ts.
//
// Idempotent: bereits vorhandene Constraints werden übersprungen. Danach
// sollte `npx drizzle-kit push` keine Änderungen mehr melden.
//
// Ausführen mit:  npx tsx src/db/unique-constraints-2026-09-21.ts

import { config } from "dotenv";
config({ path: ".env.local" });

const CONSTRAINTS = [
  { tabelle: "buch_tags", name: "buch_tags_buch_tag_key", spalten: ['"buchId"', '"tagId"'] },
  { tabelle: "repetitionselemente", name: "repetitionselemente_konto_kernaussage_key", spalten: ['"kontoId"', '"kernaussageId"'] },
  { tabelle: "repetitionselemente", name: "repetitionselemente_konto_notiz_key", spalten: ['"kontoId"', '"notizId"'] },
];

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL!);

  for (const c of CONSTRAINTS) {
    const vorhanden = await sql.query("select 1 from pg_constraint where conname = $1", [c.name]);
    if (vorhanden.length > 0) {
      console.log(`übersprungen (existiert): ${c.name}`);
      continue;
    }
    await sql.query(`alter table "${c.tabelle}" add constraint "${c.name}" unique (${c.spalten.join(", ")})`);
    console.log(`angelegt: ${c.name}`);
  }

  const zaehlung = await sql.query(
    `select (select count(*)::int from repetitionselemente) as rep, (select count(*)::int from buch_tags) as tags`
  );
  console.log(`\nZeilen danach: repetitionselemente ${zaehlung[0].rep}, buch_tags ${zaehlung[0].tags}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
