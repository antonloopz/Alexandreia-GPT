// src/scripts/test-vorschlag.ts
//
// Testet die Vorschlag-Logik (src/lib/vorschlag.ts) gegen die echten,
// geseedeten Daten. ACHTUNG: seit der Klassiker/Geheimtipp/Synergie-
// Recherche (siehe lib/recherche.ts) ist das NICHT mehr garantiert
// nebenwirkungsfrei — ist eine Kategorie knapp und weder Wunschliste noch
// Recherche-Pool liefern einen Kandidaten, legt dieser Aufruf per Claude+
// Websuche ein echtes neues `buecher`-Eintrag an (kostet einen API-Call).
//
// Ausführen mit:  npx tsx src/scripts/test-vorschlag.ts

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../db");
  const { konten } = await import("../db/schema");
  const { vorschlaege } = await import("../lib/vorschlag");

  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) {
    throw new Error("Kein Konto gefunden — zuerst `npx tsx src/db/seed.ts` ausführen.");
  }

  const kandidaten = await vorschlaege(konto.id, 3);

  if (kandidaten.length === 0) {
    console.log("Keine Vorschläge — alle Kategorien sind ausreichend bestückt (oder es gibt keine offenen Kandidaten mehr).");
    return;
  }

  console.log(`${kandidaten.length} Vorschlag/Vorschläge:\n`);
  for (const k of kandidaten) {
    console.log(`— ${k.titel} (${k.autor})`);
    console.log(`  Kategorie: ${k.kategorie} · Quelle: ${k.quelle} · Umfang: ${k.umfang ?? "unbekannt"}`);
    console.log(`  ${k.grund}\n`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
