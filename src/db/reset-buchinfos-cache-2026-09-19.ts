// src/db/reset-buchinfos-cache-2026-09-19.ts
//
// Einmaliges Reparatur-Skript (Bug-Fix 09/2026, "kein einziges Buch hat
// ein Cover" — siehe lib/buchinfos.ts): setzt buchinfosGeprueftAm bei allen
// Büchern zurück, die bereits (fälschlich, wegen eines Fehlers statt eines
// echten "kein Treffer") negativ gecacht wurden — erkennbar daran, dass
// ALLE VIER Buchinfo-Felder leer sind, obwohl schon ein Versuch
// protokolliert ist. Nach dem Reset greift der gefixte Code beim nächsten
// Laden der Wunschliste/Bibliothek automatisch erneut.
//
// Ausführen mit:  npx tsx src/db/reset-buchinfos-cache-2026-09-19.ts

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("./index");
  const { buecher } = await import("./schema");
  const { and, isNull, isNotNull, eq } = await import("drizzle-orm");

  const betroffene = await db
    .select({ id: buecher.id, titel: buecher.titel, autor: buecher.autor })
    .from(buecher)
    .where(
      and(
        isNotNull(buecher.buchinfosGeprueftAm),
        isNull(buecher.beschreibung),
        isNull(buecher.verlag),
        isNull(buecher.erscheinungsjahr),
        isNull(buecher.coverUrl)
      )
    );

  if (betroffene.length === 0) {
    console.log("Keine betroffenen Bücher gefunden — nichts zurückzusetzen.");
    return;
  }

  for (const buch of betroffene) {
    await db.update(buecher).set({ buchinfosGeprueftAm: null }).where(eq(buecher.id, buch.id));
  }

  console.log(`${betroffene.length} Buch(-Einträge) zurückgesetzt:`);
  for (const buch of betroffene) {
    console.log(`  - ${buch.titel} (${buch.autor})`);
  }
  console.log("Beim nächsten Laden der Wunschliste/Bibliothek wird für diese erneut nachgeschlagen.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
