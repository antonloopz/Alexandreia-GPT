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
// Kernaussagen eingefügt. Danach erstelleLernkartenUndQuiz() erneut
// aufrufen — leitet aus den NEUEN Kernaussagen frische Lernkarten/
// Quizfragen ab und setzt den Buchinhalt-Status zurück auf "im_vorrat".
// Schlägt irgendetwas NACH dem Löschen fehl (Netzwerkfehler, 0 Lernkarten/
// Quizfragen erzeugt), wird der Buchinhalt-Status auf "geprueft"
// zurückgesetzt — damit ein unvollständiges Buch NIE über Home/Vorschlag
// ausgespielt werden kann, sondern erst nach einem manuellen Nachziehen.
//
// Kostet zwei echte API-Aufrufe PRO Buch (Kernaussagen + Lernkarten/Quiz).
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
  const { buchinhalte, buecher, gezeigteBuecher, kernaussagen, lernkarten, quizfragen } = await import(
    "../db/schema"
  );
  const { eq, inArray } = await import("drizzle-orm");
  const { kernaussagenNeuErstellen } = await import("../lib/entwurf");
  const { erstelleLernkartenUndQuiz } = await import("../lib/lernkarten");

  // Sicherheitsfilter: NUR Bücher, die noch NIE gezeigt/geöffnet wurden —
  // an allem anderen hängen schon (potenziell) Lernkarten-Wiederholungen,
  // Notizen/Hervorhebungen oder Quiz-Antworten, die durch das Ersetzen
  // verloren gingen bzw. die Datenbank beim Löschen blockieren würde.
  const gezeigtIds = new Set(
    (await db.select({ buchinhaltId: gezeigteBuecher.buchinhaltId }).from(gezeigteBuecher)).map(
      (r) => r.buchinhaltId
    )
  );

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

  zeilen = zeilen.filter((z) => !gezeigtIds.has(z.buchinhaltId));

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
          reihenfolge: i,
        });
      }

      const lernkartenErgebnis = await erstelleLernkartenUndQuiz(zeile.buchinhaltId, zeile.titel, zeile.autor);

      if (lernkartenErgebnis.lernkartenAnzahl === 0 || lernkartenErgebnis.quizfragenAnzahl === 0) {
        await db.update(buchinhalte).set({ status: "geprueft" }).where(eq(buchinhalte.id, zeile.buchinhaltId));
        console.warn(
          `WARNUNG ${zeile.titel}: 0 Lernkarten/Quizfragen erzeugt — Status auf "geprueft" zurückgesetzt ` +
            `(aus Rotation genommen), bitte manuell prüfen (Buchinhalt ${zeile.buchinhaltId}).`
        );
      } else {
        console.log(
          `OK    ${zeile.titel} (${zeile.kategorie}): ${alteIds.length} -> ${ergebnis.kernaussagen.length} Kernaussagen, ` +
            `${lernkartenErgebnis.lernkartenAnzahl} Lernkarten, ${lernkartenErgebnis.quizfragenAnzahl} Quizfragen`
        );
      }
      if (lernkartenErgebnis.uebersprungen.length > 0) {
        console.log(`      übersprungen: ${lernkartenErgebnis.uebersprungen.join("; ")}`);
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
