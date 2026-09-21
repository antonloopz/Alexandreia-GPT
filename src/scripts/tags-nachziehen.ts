// src/scripts/tags-nachziehen.ts
//
// Vergibt Tags (lib/tags.ts, Pendenz "Autotags zu Notizen und Büchern")
// für bereits produzierte Bücher, die noch keine haben — dieselbe Funktion
// wie Stufe 3 der Pipeline. Rührt sonst nichts an. Notizen erben die Tags
// ihres Buchs, brauchen also keinen eigenen Lauf.
//
// Läuft bewusst NACHEINANDER, ältestes Buch zuerst: das Vokabular wächst
// mit jedem Buch, und jedes weitere Buch soll die bis dahin angelegten
// Tags wiederverwenden können (statt dass parallel Dubletten entstehen).
//
// Kostet 1 kurzen API-Aufruf ohne Websuche pro Buch. Bricht bei einem
// einzelnen Fehler NICHT den ganzen Lauf ab.
//
// Ausführen mit:              npx tsx src/scripts/tags-nachziehen.ts
// Nur die ersten N testen:     npx tsx src/scripts/tags-nachziehen.ts --limit=3
// Bestimmte Titel NEU taggen
// (alte Zuordnung wird ersetzt): npx tsx src/scripts/tags-nachziehen.ts --titel="On Liberty|Schuld und Sühne"
// Nur das Vokabular anzeigen:  npx tsx src/scripts/tags-nachziehen.ts --liste
// ALLE Tags löschen und alle
// Bücher neu taggen:           npx tsx src/scripts/tags-nachziehen.ts --alle-neu
//   (löscht sämtliche Zuordnungen UND das ganze Vokabular, damit das alte,
//   zu feine Vokabular die Neu-Vergabe nicht prägt — nach einer
//   Prompt-Anpassung, Entscheid 21.09.2026)

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;
  const titelArg = process.argv.find((a) => a.startsWith("--titel="));
  const titelFilter = titelArg
    ? new Set(titelArg.slice("--titel=".length).split("|").map((t) => t.trim()))
    : undefined;

  const { db } = await import("../db");
  const { buchinhalte, buecher, buchTags, kernaussagen, tags } = await import("../db/schema");
  const { asc, eq, inArray } = await import("drizzle-orm");
  const { ladeVokabular, tagsVergeben } = await import("../lib/tags");

  if (process.argv.includes("--liste")) {
    const vokabular = await ladeVokabular();
    console.log(`${vokabular.length} Tags:\n`);
    for (const v of vokabular) {
      console.log(`${String(v.anzahl).padStart(3)}  ${v.name}${v.aliase.length ? `   (auch: ${v.aliase.join(", ")})` : ""}`);
    }
    return;
  }

  const alleNeu = process.argv.includes("--alle-neu");
  if (alleNeu) {
    if (titelFilter || limit) throw new Error("--alle-neu nicht zusammen mit --titel/--limit verwenden.");
    const vorher = await ladeVokabular();
    await db.delete(buchTags);
    await db.delete(tags);
    console.log(`Alle Tags gelöscht (${vorher.length} Tags samt Zuordnungen). Neu-Vergabe:\n`);
  }

  const alle = await db
    .select({
      buchId: buecher.id,
      buchinhaltId: buchinhalte.id,
      zusammenfassung: buchinhalte.zusammenfassung,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
    })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(inArray(buchinhalte.status, ["geprueft", "im_vorrat"]))
    .orderBy(asc(buchinhalte.erstelltAm));

  // Ein Eintrag pro Buch (bei mehreren Buchinhalten der neueste).
  const proBuch = new Map<string, (typeof alle)[number]>();
  for (const z of alle) proBuch.set(z.buchId, z);
  let zeilen = [...proBuch.values()];

  const mitTags = new Set((await db.selectDistinct({ buchId: buchTags.buchId }).from(buchTags)).map((z) => z.buchId));
  if (titelFilter) {
    zeilen = zeilen.filter((z) => titelFilter.has(z.titel));
  } else {
    zeilen = zeilen.filter((z) => !mitTags.has(z.buchId));
  }
  if (limit) zeilen = zeilen.slice(0, limit);

  console.log(`${zeilen.length} Buch/Bücher werden getaggt.\n`);

  let erfolgreich = 0;
  let fehlgeschlagen = 0;

  for (const zeile of zeilen) {
    try {
      if (titelFilter) await db.delete(buchTags).where(eq(buchTags.buchId, zeile.buchId));
      const aussagen = await db
        .select({ text: kernaussagen.text })
        .from(kernaussagen)
        .where(eq(kernaussagen.buchinhaltId, zeile.buchinhaltId))
        .orderBy(asc(kernaussagen.reihenfolge));
      const vergabe = await tagsVergeben(
        zeile.buchId,
        zeile.titel,
        zeile.autor,
        zeile.kategorie,
        zeile.zusammenfassung,
        aussagen.map((a) => a.text)
      );
      console.log(`OK    ${zeile.titel}: ${vergabe.tags.join(", ")}`);
      if (vergabe.neu.length) console.log(`      neu: ${vergabe.neu.join(", ")}`);
      if (vergabe.aliaseErgaenzt.length) console.log(`      Synonym: ${vergabe.aliaseErgaenzt.join("; ")}`);
      erfolgreich++;
    } catch (err) {
      console.error(`FEHLER  ${zeile.titel}:`, err);
      fehlgeschlagen++;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const vokabular = await ladeVokabular();
  console.log(`\nFertig: ${erfolgreich} getaggt, ${fehlgeschlagen} fehlgeschlagen. Vokabular: ${vokabular.length} Tags.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
