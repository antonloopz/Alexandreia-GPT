// src/scripts/test-entwurf.ts
//
// Nimmt den ERSTEN Vorschlag-Kandidaten und lässt Entwurf + Prüfung
// einmal komplett durchlaufen. Kostet echte API-Aufrufe (Claude Sonnet 5
// + Web-Suche) — bewusst nur EIN Buch pro Lauf, nicht die ganze Liste,
// damit sich Kosten/Ergebnis erst an einem Beispiel beurteilen lassen.
//
// Ausführen mit:  npx tsx src/scripts/test-entwurf.ts

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../db");
  const { konten } = await import("../db/schema");
  const { vorschlaege } = await import("../lib/vorschlag");
  const { pipelineSchritt } = await import("../lib/entwurf");

  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) {
    throw new Error("Kein Konto gefunden — zuerst `npx tsx src/db/seed.ts` ausführen.");
  }

  const [kandidat] = await vorschlaege(konto.id, 1);
  if (!kandidat) {
    console.log("Kein offener Vorschlag-Kandidat mehr.");
    return;
  }

  console.log(`Erstelle Entwurf für: ${kandidat.titel} (${kandidat.autor}) — Kategorie ${kandidat.kategorie}...\n`);

  const ergebnis = await pipelineSchritt(kandidat.buchId);

  if (ergebnis.status === "verworfen") {
    console.log("Entwurf VERWORFEN — Prüfung nicht bestanden:");
    for (const p of ergebnis.probleme) console.log(`  - ${p}`);
    console.log("\nNichts wurde gespeichert. Erneuter Lauf erzeugt einen frischen, unabhängigen Entwurf.");
    return;
  }

  console.log(`Gespeichert — buchinhalt ${ergebnis.buchinhaltId}, ${ergebnis.anzahlKernaussagen} Kernaussagen.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
