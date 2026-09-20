// src/db/check-stuck-buchinhalte-2026-09-20.ts
//
// Rein lesendes Diagnose-Skript (Untersuchung 09/2026, Cron-Fix in
// app/api/cron/produzieren/route.ts): prüft die Hypothese, dass Bücher bei
// buchinhalte.status = "geprueft" hängen bleiben können, obwohl Entwurf
// und Prüfung bereits erfolgreich durchlaufen wurden. Grund laut Hypothese:
// erstelleLernkartenUndQuiz() (siehe lib/lernkarten.ts) hebt den Status nur
// auf "im_vorrat", wenn dabei MINDESTENS 1 Lernkarte UND MINDESTENS 1
// Quizfrage entstanden ist — kommt eine der beiden Ableitungen (ohne
// Fehler!) mit 0 Ergebnissen zurück, bleibt die Zeile für immer bei
// "geprueft" stehen. Da vorschlaege() -> belegteBuecher() JEDE
// buchinhalte-Zeile unabhängig vom Status als "schon belegt" zählt, wird
// ein so hängengebliebenes Buch außerdem nie wieder für die Produktion in
// Betracht gezogen — es blockiert also dauerhaft und unbemerkt einen
// Produktions-Slot.
//
// Dieses Skript ändert NICHTS an der Datenbank — nur SELECT-Abfragen. Es
// listet für jede bei "geprueft" feststeckende buchinhalte-Zeile Titel,
// Autor, Kategorie, Anzahl Kernaussagen, Anzahl Lernkarten und Anzahl
// Quizfragen auf (Lernkarten/Quizfragen hängen im Schema nicht direkt an
// buchinhalte, sondern an kernaussagen — siehe schema.ts), damit auf einen
// Blick erkennbar ist, ob es sich um den "0 Lernkarten"- oder den
// "0 Quizfragen"-Fall handelt (oder etwas anderes, z.B. auch 0
// Kernaussagen).
//
// Ausführen mit:  npx tsx src/db/check-stuck-buchinhalte-2026-09-20.ts

import { config } from "dotenv";
config({ path: ".env.local" });

function vorZeitraum(datum: Date): string {
  const tageMs = 1000 * 60 * 60 * 24;
  const tage = Math.floor((Date.now() - datum.getTime()) / tageMs);
  if (tage <= 0) return "heute";
  if (tage === 1) return "vor 1 Tag";
  return `vor ${tage} Tagen`;
}

async function main() {
  const { db } = await import("./index");
  const { buchinhalte, buecher, kernaussagen, lernkarten, quizfragen } = await import(
    "./schema"
  );
  const { eq, sql, asc } = await import("drizzle-orm");

  const feststeckende = await db
    .select({
      buchinhaltId: buchinhalte.id,
      erstelltAm: buchinhalte.erstelltAm,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
    })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.status, "geprueft"))
    .orderBy(asc(buchinhalte.erstelltAm));

  if (feststeckende.length === 0) {
    console.log("Keine feststeckenden Bücher gefunden.");
    return;
  }

  console.log(
    `${feststeckende.length} Buch(-Inhalt) feststeckend bei Status "geprueft":\n`
  );

  let nullLernkarten = 0;
  let nullQuizfragen = 0;
  let nullKernaussagen = 0;

  for (const zeile of feststeckende) {
    const kernaussagenAnzahl = (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(kernaussagen)
        .where(eq(kernaussagen.buchinhaltId, zeile.buchinhaltId))
    )[0]?.n ?? 0;

    const lernkartenAnzahl = (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(lernkarten)
        .innerJoin(kernaussagen, eq(lernkarten.kernaussageId, kernaussagen.id))
        .where(eq(kernaussagen.buchinhaltId, zeile.buchinhaltId))
    )[0]?.n ?? 0;

    const quizfragenAnzahl = (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(quizfragen)
        .innerJoin(kernaussagen, eq(quizfragen.kernaussageId, kernaussagen.id))
        .where(eq(kernaussagen.buchinhaltId, zeile.buchinhaltId))
    )[0]?.n ?? 0;

    if (kernaussagenAnzahl === 0) nullKernaussagen++;
    if (lernkartenAnzahl === 0) nullLernkarten++;
    if (quizfragenAnzahl === 0) nullQuizfragen++;

    const diagnose: string[] = [];
    if (kernaussagenAnzahl === 0) diagnose.push("0 Kernaussagen");
    else {
      if (lernkartenAnzahl === 0) diagnose.push("0 Lernkarten");
      if (quizfragenAnzahl === 0) diagnose.push("0 Quizfragen");
    }
    const diagnoseText = diagnose.length > 0 ? ` -> Verdacht: ${diagnose.join(", ")}` : "";

    console.log(`- ${zeile.titel} (${zeile.autor})`);
    console.log(`    Kategorie: ${zeile.kategorie}`);
    console.log(`    Erstellt: ${vorZeitraum(zeile.erstelltAm)} (${zeile.erstelltAm.toISOString()})`);
    console.log(`    Kernaussagen: ${kernaussagenAnzahl}, Lernkarten: ${lernkartenAnzahl}, Quizfragen: ${quizfragenAnzahl}${diagnoseText}`);
    console.log(`    buchinhaltId: ${zeile.buchinhaltId}`);
    console.log("");
  }

  console.log("Zusammenfassung:");
  console.log(`  Davon mit 0 Kernaussagen: ${nullKernaussagen}`);
  console.log(`  Davon mit 0 Lernkarten: ${nullLernkarten}`);
  console.log(`  Davon mit 0 Quizfragen: ${nullQuizfragen}`);
  console.log(`\n${feststeckende.length} Bücher stecken bei "geprueft" fest.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
