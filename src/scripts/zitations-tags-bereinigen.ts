// src/scripts/zitations-tags-bereinigen.ts
//
// Einmalige Bereinigung für den Bug in src/lib/entwurf.ts (09/2026): bei
// aktiver Websuche hat das Modell teils seine interne Zitations-Markierung
// (z.B. `<cite index="12-3">...</cite>`) wörtlich in Textfelder
// geschrieben — sichtbar bis in die App-Zusammenfassung. gesamtText() dort
// entfernt das jetzt für NEU produzierte Bücher automatisch; dieses Skript
// bereinigt bereits gespeicherte Buchinhalte/Kernaussagen nachträglich.
//
// Reine Textbereinigung ohne API-Aufruf, kostet nichts. Ohne Flag wird
// geschrieben; mit --dry-run wird nur gezeigt, was betroffen wäre.
//
// Ausführen mit:   npx tsx src/scripts/zitations-tags-bereinigen.ts
// Nur anzeigen:    npx tsx src/scripts/zitations-tags-bereinigen.ts --dry-run

import { config } from "dotenv";
config({ path: ".env.local" });

function bereinigen(text: string): string {
  return text.replace(/<cite[^>]*>[\s\S]*?<\/cite>/gi, "").replace(/<\/?cite\b[^>]*>/gi, "");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const { db } = await import("../db");
  const { buchinhalte, kernaussagen } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");

  let betroffen = 0;

  const alleBuchinhalte = await db.select().from(buchinhalte);
  for (const b of alleBuchinhalte) {
    const felder = {
      zusammenfassung: b.zusammenfassung,
      entstehungsgeschichte: b.entstehungsgeschichte,
      autorenhintergrund: b.autorenhintergrund,
      kernzitatOriginal: b.kernzitatOriginal,
      kernzitatUebersetzung: b.kernzitatUebersetzung,
    };
    const bereinigt: Record<string, string | null> = {};
    let geaendert = false;
    for (const [feld, wert] of Object.entries(felder)) {
      if (typeof wert === "string" && wert.includes("<cite")) {
        bereinigt[feld] = bereinigen(wert);
        geaendert = true;
      }
    }
    if (geaendert) {
      betroffen++;
      console.log(`buchinhalte/${b.id}: Felder ${Object.keys(bereinigt).join(", ")} betroffen.`);
      if (!dryRun) {
        await db.update(buchinhalte).set(bereinigt).where(eq(buchinhalte.id, b.id));
      }
    }
  }

  const alleKernaussagen = await db.select().from(kernaussagen);
  for (const k of alleKernaussagen) {
    const bereinigt: { text?: string; erklaerung?: string } = {};
    if (k.text.includes("<cite")) bereinigt.text = bereinigen(k.text);
    if (k.erklaerung.includes("<cite")) bereinigt.erklaerung = bereinigen(k.erklaerung);
    if (Object.keys(bereinigt).length > 0) {
      betroffen++;
      console.log(`kernaussagen/${k.id}: Felder ${Object.keys(bereinigt).join(", ")} betroffen.`);
      if (!dryRun) {
        await db.update(kernaussagen).set(bereinigt).where(eq(kernaussagen.id, k.id));
      }
    }
  }

  console.log(
    `\nFertig. ${betroffen} Zeile(n) betroffen${dryRun ? " (--dry-run, nichts geschrieben)" : ", bereinigt."}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
