// src/scripts/zusammenfassungen-regenerieren.ts
//
// Ersetzt die Zusammenfassung (+ deren Vertrauenshinweis) ALLER bereits
// produzierten Buchinhalte (Status "geprueft" oder "im_vorrat") mit einer
// neuen, ausführlicheren Fassung — siehe entwurf.ts, 09/2026: die
// Zusammenfassungs-Regel wurde verschärft, weil bestehende Zusammenfassungen
// zu knapp ausfielen (Pendenz "Zusammenfassungen dürfen weit ausführlicher
// sein"). Rührt NUR die Zusammenfassung an — Entstehungsgeschichte,
// Autorenhintergrund, Kernzitat, Kernaussagen (und alles, was darauf
// aufbaut: Lernkarten, Quizfragen, Wiederholungs-Fortschritt) bleiben
// unverändert, damit kein bereits gelernter Fortschritt verloren geht.
//
// Kostet einen echten API-Aufruf (Claude Sonnet 5 + Web-Suche) PRO Buch —
// bei vielen Büchern entsprechend viele. Läuft nacheinander (nicht
// parallel), mit kurzer Pause zwischen den Aufrufen, und bricht bei einem
// einzelnen Fehler NICHT den ganzen Lauf ab (Fehler werden geloggt, dann
// geht's mit dem nächsten Buch weiter).
//
// Ausführen mit:            npx tsx src/scripts/zusammenfassungen-regenerieren.ts
// Nur die ersten N testen:   npx tsx src/scripts/zusammenfassungen-regenerieren.ts --limit=3

import { config } from "dotenv";
config({ path: ".env.local" });

function wortanzahl(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  const { db } = await import("../db");
  const { buchinhalte, buecher } = await import("../db/schema");
  const { eq, inArray } = await import("drizzle-orm");
  const { zusammenfassungNeuErstellen } = await import("../lib/entwurf");

  let zeilen = await db
    .select({
      buchinhaltId: buchinhalte.id,
      alteZusammenfassung: buchinhalte.zusammenfassung,
      vertrauenshinweise: buchinhalte.vertrauenshinweise,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
      originalsprache: buecher.originalsprache,
    })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(inArray(buchinhalte.status, ["geprueft", "im_vorrat"]));

  if (limit) zeilen = zeilen.slice(0, limit);

  console.log(`${zeilen.length} Buchinhalt(e) werden neu zusammengefasst.\n`);

  let erfolgreich = 0;
  let fehlgeschlagen = 0;

  for (const zeile of zeilen) {
    try {
      const alteWoerter = wortanzahl(zeile.alteZusammenfassung ?? "");
      const ergebnis = await zusammenfassungNeuErstellen(
        zeile.titel,
        zeile.autor,
        zeile.kategorie,
        zeile.originalsprache
      );
      const neueWoerter = wortanzahl(ergebnis.zusammenfassung);

      await db
        .update(buchinhalte)
        .set({
          zusammenfassung: ergebnis.zusammenfassung,
          vertrauenshinweise: zeile.vertrauenshinweise
            ? { ...zeile.vertrauenshinweise, zusammenfassung: ergebnis.vertrauenshinweis }
            : {
                zusammenfassung: ergebnis.vertrauenshinweis,
                entstehungsgeschichte: "eingeordnet",
                autorenhintergrund: "eingeordnet",
                kernzitat: null,
              },
        })
        .where(eq(buchinhalte.id, zeile.buchinhaltId));

      console.log(`OK    ${zeile.titel}: ${alteWoerter} -> ${neueWoerter} Wörter`);
      erfolgreich++;
    } catch (err) {
      console.error(`FEHLER  ${zeile.titel}:`, err);
      fehlgeschlagen++;
    }

    // Kleine Pause zwischen den Aufrufen, um Rate-Limits zu schonen.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  console.log(`\nFertig: ${erfolgreich} aktualisiert, ${fehlgeschlagen} fehlgeschlagen.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
