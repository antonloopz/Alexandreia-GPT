// src/scripts/tags-konsolidieren.ts
//
// Führt ähnliche Tags zusammen (09/2026, Pendenz "Vernetzung": der
// schwierigste Teil ist die Normalisierung — "Stoizismus" und "stoische
// Philosophie" müssen dasselbe Konzept sein, sonst entstehen Dubletten
// statt Verbindungen). Das Modell sieht das ganze Vokabular samt Büchern
// und schlägt NUR echte Dubletten vor (Synonyme, Schreibweisen, praktisch
// deckungsgleiche Begriffe) — verwandte, aber verschiedene Konzepte bleiben
// getrennt. Siehe zusammenfuehrungenVorschlagen()/tagsZusammenfuehren() in
// src/lib/tags.ts.
//
// Standard: NUR anzeigen. Mit --anwenden werden die Vorschläge
// ausgeführt: Bücher und Kernaussagen auf den Ziel-Tag umgehängt, die alte
// Schreibweise als Alias beim Ziel hinterlegt (künftige Vorschläge landen
// dann direkt dort), der alte Tag gelöscht. Da ein erneuter Modell-Aufruf
// andere Vorschläge liefern kann, lassen sich mit --nur="von>nach|von>nach"
// genau die angezeigten (und gewünschten) Zusammenführungen anwenden.
//
// Anzeigen:           npx tsx src/scripts/tags-konsolidieren.ts
// Alle anwenden:      npx tsx src/scripts/tags-konsolidieren.ts --anwenden
// Nur bestimmte:      npx tsx src/scripts/tags-konsolidieren.ts --nur="Positives Denken>New Thought"

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { tagsZusammenfuehren, zusammenfuehrungenVorschlagen, ladeVokabular } = await import("../lib/tags");

  const nurArg = process.argv.find((a) => a.startsWith("--nur="));
  if (nurArg) {
    const paare = nurArg
      .slice("--nur=".length)
      .split("|")
      .map((p) => p.split(">").map((t) => t.trim()))
      .filter((p) => p.length === 2 && p[0] && p[1]);
    for (const [von, nach] of paare) {
      await tagsZusammenfuehren(von, nach);
      console.log(`zusammengeführt: ${von} → ${nach}`);
    }
    console.log(`\nVokabular jetzt: ${(await ladeVokabular()).length} Tags.`);
    return;
  }

  const vorschlaege = await zusammenfuehrungenVorschlagen();
  console.log(`${vorschlaege.length} Vorschlag/Vorschläge:\n`);
  for (const v of vorschlaege) console.log(`- ${v.von} → ${v.nach}\n    ${v.begruendung}`);
  if (vorschlaege.length === 0) return;

  if (!process.argv.includes("--anwenden")) {
    const nur = vorschlaege.map((v) => `${v.von}>${v.nach}`).join("|");
    console.log(`\nNur Anzeige. Genau diese anwenden:\n  npx tsx src/scripts/tags-konsolidieren.ts --nur="${nur}"`);
    return;
  }
  for (const v of vorschlaege) {
    await tagsZusammenfuehren(v.von, v.nach);
    console.log(`zusammengeführt: ${v.von} → ${v.nach}`);
  }
  console.log(`\nVokabular jetzt: ${(await ladeVokabular()).length} Tags.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
