// src/scripts/kernaussagen-regenerieren.ts
//
// Ersetzt die Kernaussagen (+ daraus abgeleitete Lernkarten/Quizfragen)
// bereits produzierter, aber NOCH NIE gelesener/geöffneter Buchinhalte
// (Status "im_vorrat", keine gezeigteBuecher-Zeile) mit einer neuen,
// kategoriespezifischen Fassung — siehe entwurf.ts, kernaussagenAnleitung(),
// 09/2026: Pendenz "Kernaussagen-Funktion überdenken: passt nicht für alle
// Kategorien".
//
// Bewusst NUR für ungelesene Bücher: Lernkarten, Quizfragen, Wiederholungs-
// Fortschritt und Notizen/Hervorhebungen hängen per Fremdschlüssel (ohne
// cascade) an den bestehenden Kernaussagen — bei einem bereits gelesenen
// Buch wäre das Ersetzen entweder von der Datenbank blockiert (FK-Fehler)
// oder würde echten Nutzer-Fortschritt zerstören. Der Sicherheitsfilter
// unten (kein gezeigteBuecher-Eintrag) stellt das für JEDES Buch einzeln
// sicher, bevor irgendetwas gelöscht wird.
//
// Ablauf pro Buch: neue Kernaussagen ERST erzeugen (API-Aufruf) — erst wenn
// das klappt, werden die alten Quizfragen + Lernkarten + Kernaussagen
// gelöscht (in dieser Reihenfolge, wegen der Fremdschlüssel) und die neuen
// Kernaussagen eingefügt (seit 09/2026 inkl. "beispiel"). Danach
// erstelleQuizfragen() erneut aufrufen —
// leitet aus den NEUEN Kernaussagen frische Quizfragen ab und setzt den
// Buchinhalt-Status zurück auf "im_vorrat". Schlägt irgendetwas NACH dem
// Löschen fehl (Netzwerkfehler, 0 Quizfragen erzeugt), wird der
// Buchinhalt-Status auf "geprueft" zurückgesetzt — damit ein
// unvollständiges Buch NIE über Home/Vorschlag ausgespielt werden kann,
// sondern erst nach einem manuellen Nachziehen.
//
// Kostet zwei echte API-Aufrufe PRO Buch (Kernaussagen + Quiz).
// Läuft nacheinander, mit kurzer Pause zwischen den Büchern, bricht bei
// einem einzelnen Fehler NICHT den ganzen Lauf ab.
//
// Ausführen mit:              npx tsx src/scripts/kernaussagen-regenerieren.ts
// Nur die ersten N testen:     npx tsx src/scripts/kernaussagen-regenerieren.ts --limit=3
// Nur bestimmte Kategorien
// (z.B. nur die, deren Prompt
// sich inhaltlich geändert hat,
// um API-Kosten zu sparen),
// "|" getrennt:                npx tsx src/scripts/kernaussagen-regenerieren.ts --kategorie=biografie_memoir|geschichte|literatur_klassiker
// Nur bestimmte Titel, "|"
// getrennt (NICHT Komma —
// Titel können selbst ein
// Komma enthalten):            npx tsx src/scripts/kernaussagen-regenerieren.ts --titel="Sapiens|Silent Spring"
//
// Sicherheitsfilter gelockert (09/2026, Pendenz "Aufbereitung:
// kategorieabhängige Prompts"): vorher galt jedes Buch mit gezeigteBuecher-
// Zeile als gelesen — der Lesen-Screen legt die aber schon beim blossen
// Öffnen an. Jetzt übersprungen werden nur Bücher, bei denen tatsächlich
// Fortschritt an den Kernaussagen hängt: abgeschlossen (abgeschlossenAm),
// Wiederholungs-Einträge (repetitionselemente.kernaussageId) oder Notizen/
// Hervorhebungen an Kernaussagen (notizen.kernaussageId). Ausserdem
// übersprungen: Bücher, deren Kernaussagen schon alle ein "beispiel" haben
// (bereits im neuen Format — spart API-Kosten bei einem erneuten Lauf).

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  const kategorieArg = process.argv.find((a) => a.startsWith("--kategorie="));
  const kategorieFilter = kategorieArg
    ? new Set(kategorieArg.slice("--kategorie=".length).split("|").map((k) => k.trim()))
    : undefined;

  const titelArg = process.argv.find((a) => a.startsWith("--titel="));
  const titelFilter = titelArg
    ? new Set(titelArg.slice("--titel=".length).split("|").map((t) => t.trim()))
    : undefined;

  const { db } = await import("../db");
  const { buchinhalte, buecher, gezeigteBuecher, kernaussagen, lernkarten, notizen, quizfragen, repetitionselemente } =
    await import("../db/schema");
  const { eq, inArray, isNotNull } = await import("drizzle-orm");
  const { kernaussagenNeuErstellen } = await import("../lib/entwurf");
  const { erstelleQuizfragen } = await import("../lib/quiz-generierung");

  // Sicherheitsfilter (siehe Kopfkommentar): Buchinhalte, an deren
  // Kernaussagen echter Fortschritt hängt, werden NIE angefasst.
  const geschuetzt = new Set<string>();
  for (const g of await db
    .select({ buchinhaltId: gezeigteBuecher.buchinhaltId })
    .from(gezeigteBuecher)
    .where(isNotNull(gezeigteBuecher.abgeschlossenAm))) {
    geschuetzt.add(g.buchinhaltId);
  }
  for (const r of await db
    .select({ buchinhaltId: kernaussagen.buchinhaltId })
    .from(repetitionselemente)
    .innerJoin(kernaussagen, eq(repetitionselemente.kernaussageId, kernaussagen.id))) {
    geschuetzt.add(r.buchinhaltId);
  }
  for (const n of await db
    .select({ buchinhaltId: kernaussagen.buchinhaltId })
    .from(notizen)
    .innerJoin(kernaussagen, eq(notizen.kernaussageId, kernaussagen.id))) {
    geschuetzt.add(n.buchinhaltId);
  }

  // Bereits im neuen Format: ALLE Kernaussagen haben ein Beispiel.
  const alleKernaussagenZeilen = await db
    .select({ buchinhaltId: kernaussagen.buchinhaltId, beispiel: kernaussagen.beispiel })
    .from(kernaussagen);
  const ohneBeispiel = new Set(alleKernaussagenZeilen.filter((k) => !k.beispiel).map((k) => k.buchinhaltId));

  let zeilen = await db
    .select({
      buchinhaltId: buchinhalte.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
    })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.status, "im_vorrat"));

  zeilen = zeilen.filter((z) => !geschuetzt.has(z.buchinhaltId) && ohneBeispiel.has(z.buchinhaltId));

  if (kategorieFilter) zeilen = zeilen.filter((z) => kategorieFilter.has(z.kategorie));
  if (titelFilter) zeilen = zeilen.filter((z) => titelFilter.has(z.titel));
  if (limit) zeilen = zeilen.slice(0, limit);

  console.log(`${zeilen.length} ungelesene(s) Buchinhalt(e) werden mit neuen Kernaussagen versehen.\n`);

  let erfolgreich = 0;
  let fehlgeschlagen = 0;

  for (const zeile of zeilen) {
    let alteGeloescht = false;
    try {
      const alteKernaussagen = await db
        .select({ id: kernaussagen.id })
        .from(kernaussagen)
        .where(eq(kernaussagen.buchinhaltId, zeile.buchinhaltId));
      const alteIds = alteKernaussagen.map((k) => k.id);

      // ERST die neuen Kernaussagen erzeugen — schlägt der API-Aufruf fehl,
      // ist das alte Buch noch komplett unangetastet.
      const ergebnis = await kernaussagenNeuErstellen(zeile.titel, zeile.autor, zeile.kategorie);

      if (alteIds.length > 0) {
        await db.delete(quizfragen).where(inArray(quizfragen.kernaussageId, alteIds));
        await db.delete(lernkarten).where(inArray(lernkarten.kernaussageId, alteIds));
        await db.delete(kernaussagen).where(inArray(kernaussagen.id, alteIds));
      }
      alteGeloescht = true;

      for (let i = 0; i < ergebnis.kernaussagen.length; i++) {
        const k = ergebnis.kernaussagen[i];
        await db.insert(kernaussagen).values({
          buchinhaltId: zeile.buchinhaltId,
          text: k.text,
          erklaerung: k.erklaerung,
          beispiel: k.beispiel?.trim() || null,
          reihenfolge: i,
        });
      }

      const quizErgebnis = await erstelleQuizfragen(zeile.buchinhaltId, zeile.titel, zeile.autor);

      if (quizErgebnis.quizfragenAnzahl === 0) {
        await db.update(buchinhalte).set({ status: "geprueft" }).where(eq(buchinhalte.id, zeile.buchinhaltId));
        console.warn(
          `WARNUNG ${zeile.titel}: 0 Quizfragen erzeugt — Status auf "geprueft" zurückgesetzt ` +
            `(aus Rotation genommen), bitte manuell prüfen (Buchinhalt ${zeile.buchinhaltId}).`
        );
      } else {
        console.log(
          `OK    ${zeile.titel} (${zeile.kategorie}): ${alteIds.length} -> ${ergebnis.kernaussagen.length} Kernaussagen, ` +
            `${quizErgebnis.quizfragenAnzahl} Quizfragen`
        );
      }
      if (quizErgebnis.uebersprungen.length > 0) {
        console.log(`      übersprungen: ${quizErgebnis.uebersprungen.join("; ")}`);
      }
      erfolgreich++;
    } catch (err) {
      console.error(`FEHLER  ${zeile.titel}:`, err);
      if (alteGeloescht) {
        // Alte Kernaussagen/Lernkarten/Quiz sind schon weg, die
        // Neuerstellung ist aber mitten im Ablauf gescheitert — dieses Buch
        // NICHT mit fehlenden/leeren Lernkarten/Quiz in der "im_vorrat"-
        // Rotation lassen.
        await db.update(buchinhalte).set({ status: "geprueft" }).where(eq(buchinhalte.id, zeile.buchinhaltId));
        console.error(
          `        -> Status auf "geprueft" zurückgesetzt (aus Rotation genommen), bitte manuell nachziehen ` +
            `(Buchinhalt ${zeile.buchinhaltId}).`
        );
      }
      fehlgeschlagen++;
    }

    // Kleine Pause zwischen den Büchern, um Rate-Limits zu schonen.
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
