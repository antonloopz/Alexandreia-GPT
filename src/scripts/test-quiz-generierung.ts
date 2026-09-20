// src/scripts/test-quiz-generierung.ts
//
// Nimmt den zuletzt erstellten, geprüften Buchinhalt und leitet dafür
// Quizfragen ab. Kostet einen einzelnen API-Aufruf (Claude Sonnet 5, ohne
// Web-Suche — reine Ableitung aus schon geprüftem Text).
//
// (09/2026, umbenannt von test-lernkarten.ts: leitete früher zusätzlich
// Lernkarten ab, die inzwischen entfernt wurden — siehe
// src/lib/quiz-generierung.ts.)
//
// Ausführen mit:  npx tsx src/scripts/test-quiz-generierung.ts

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../db");
  const { buchinhalte, buecher } = await import("../db/schema");
  const { eq, desc } = await import("drizzle-orm");
  const { erstelleQuizfragen } = await import("../lib/quiz-generierung");

  const [zeile] = await db
    .select({
      buchinhaltId: buchinhalte.id,
      titel: buecher.titel,
      autor: buecher.autor,
    })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.status, "geprueft"))
    .orderBy(desc(buchinhalte.erstelltAm))
    .limit(1);

  if (!zeile) {
    console.log('Kein Buchinhalt mit Status "geprueft" gefunden — zuerst test-entwurf.ts laufen lassen.');
    return;
  }

  console.log(`Leite Quiz ab für: ${zeile.titel} (${zeile.autor})...\n`);

  const ergebnis = await erstelleQuizfragen(zeile.buchinhaltId, zeile.titel, zeile.autor);

  console.log(`${ergebnis.quizfragenAnzahl} Quizfragen gespeichert.`);
  if (ergebnis.uebersprungen.length > 0) {
    console.log(`\n${ergebnis.uebersprungen.length} übersprungen:`);
    for (const u of ergebnis.uebersprungen) console.log(`  - ${u}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
