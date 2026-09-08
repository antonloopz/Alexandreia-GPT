// src/db/seed.ts
//
// Einmaliger Seed: legt die Standard-Konto-Zeile an, falls noch keine
// existiert. Es gibt aktuell kein Login/Onboarding, aber jede kontobezogene
// Tabelle (Wunschliste, Gezeigte Bücher, Repetition, Notizen, Einstellungen)
// braucht trotzdem einen konto_id-Bezug (siehe Konzept, Abschnitt 11).
//
// Ausführen mit:  npx tsx src/db/seed.ts

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  // Dynamischer Import erst NACH config() — ein normaler Top-Level-Import
  // würde durch ES-Module-Hoisting vor dem config()-Aufruf laufen und
  // DATABASE_URL wäre beim Erstellen des Neon-Clients noch leer.
  const { db } = await import("./index");
  const { konten } = await import("./schema");

  const existing = await db.select().from(konten).limit(1);
  if (existing.length > 0) {
    console.log("Konto existiert bereits, nichts zu tun:", existing[0]);
    return;
  }

  const [konto] = await db.insert(konten).values({}).returning();
  console.log("Standard-Konto angelegt:", konto);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
