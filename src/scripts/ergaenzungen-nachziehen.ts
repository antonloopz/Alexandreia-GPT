// src/scripts/ergaenzungen-nachziehen.ts
//
// Ergänzt bereits produzierte Buchinhalte um die 09/2026 neu eingeführten
// Schichten "Synthese" und "Wissensstatus": "einordnung" (Lesen-Screen),
// "bleibtHaengen" (Abschluss-Screen) und kernaussagen.wissensstatus
// (Kernaussagen-Screen) — siehe ergaenzungenErstellen() in
// src/lib/entwurf.ts (dieselbe Funktion wie Stufe 3 der Pipeline). Rührt nichts Bestehendes an (Zusammenfassung,
// Kernaussagen, Quiz, Wiederholungs-Fortschritt, Notizen), deshalb für ALLE
// Bücher geeignet, auch bereits gelesene (Entscheid 21.09.2026).
//
// Standardmässig nur Buchinhalte, denen mindestens eines der beiden Felder
// noch fehlt — ein erneuter Lauf kostet für bereits ergänzte Bücher also
// nichts. Mit --titel werden die angegebenen Bücher auch dann neu ergänzt,
// wenn sie beide Felder schon haben (z.B. nach einer Prompt-Anpassung).
//
// Kostet 2 echte API-Aufrufe (mit Websuche) PRO Buch. Läuft nacheinander,
// mit kurzer Pause, bricht bei einem einzelnen Fehler NICHT den ganzen
// Lauf ab.
//
// Ausführen mit:              npx tsx src/scripts/ergaenzungen-nachziehen.ts
// Nur die ersten N testen:     npx tsx src/scripts/ergaenzungen-nachziehen.ts --limit=2
// Nur bestimmte Titel, "|"
// getrennt:                    npx tsx src/scripts/ergaenzungen-nachziehen.ts --titel="On Liberty|Schuld und Sühne"

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
  const { buchinhalte, buecher, kernaussagen } = await import("../db/schema");
  const { asc, eq, inArray } = await import("drizzle-orm");
  const { ergaenzungenErstellen } = await import("../lib/entwurf");

  let zeilen = await db
    .select({
      buchinhaltId: buchinhalte.id,
      zusammenfassung: buchinhalte.zusammenfassung,
      einordnung: buchinhalte.einordnung,
      bleibtHaengen: buchinhalte.bleibtHaengen,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
    })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(inArray(buchinhalte.status, ["geprueft", "im_vorrat"]));

  if (titelFilter) {
    zeilen = zeilen.filter((z) => titelFilter.has(z.titel));
  } else {
    zeilen = zeilen.filter((z) => !z.einordnung || !z.bleibtHaengen);
  }
  if (limit) zeilen = zeilen.slice(0, limit);

  console.log(`${zeilen.length} Buchinhalt(e) werden ergänzt.\n`);

  let erfolgreich = 0;
  let fehlgeschlagen = 0;

  for (const zeile of zeilen) {
    try {
      const aussagen = await db
        .select({ id: kernaussagen.id, text: kernaussagen.text, erklaerung: kernaussagen.erklaerung })
        .from(kernaussagen)
        .where(eq(kernaussagen.buchinhaltId, zeile.buchinhaltId))
        .orderBy(asc(kernaussagen.reihenfolge));
      const ergebnis = await ergaenzungenErstellen(zeile.titel, zeile.autor, zeile.kategorie, zeile.zusammenfassung, aussagen);
      await db
        .update(buchinhalte)
        .set({ einordnung: ergebnis.einordnung, bleibtHaengen: ergebnis.bleibtHaengen })
        .where(eq(buchinhalte.id, zeile.buchinhaltId));
      // Wissensstatus: bei einem erneuten Lauf (--titel) zuerst alte Werte
      // entfernen, damit nicht mehr belegte Urteile nicht stehen bleiben.
      await db.update(kernaussagen).set({ wissensstatus: null }).where(eq(kernaussagen.buchinhaltId, zeile.buchinhaltId));
      for (const w of ergebnis.wissensstatus) {
        await db.update(kernaussagen).set({ wissensstatus: w.wissensstatus }).where(eq(kernaussagen.id, aussagen[w.index].id));
      }

      const heute = ergebnis.einordnung?.heute ? `heute: ${ergebnis.einordnung.heute.urteil}` : "heute: –";
      const block = ergebnis.einordnung ? `Einordnung ${ergebnis.einordnung.umfang} (${heute})` : "keine Einordnung";
      const ideen = ergebnis.bleibtHaengen ? `${ergebnis.bleibtHaengen.ideen.length} Ideen + Frage` : "kein 'bleibt hängen'";
      const ws = `Wissensstatus ${ergebnis.wissensstatus.length}/${aussagen.length}`;
      console.log(`OK    ${zeile.titel}: ${block}, ${ideen}, ${ws}`);
      for (const h of ergebnis.hinweise) console.log(`      ${h}`);
      erfolgreich++;
    } catch (err) {
      console.error(`FEHLER  ${zeile.titel}:`, err);
      fehlgeschlagen++;
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  console.log(`\nFertig: ${erfolgreich} ergänzt, ${fehlgeschlagen} fehlgeschlagen.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
