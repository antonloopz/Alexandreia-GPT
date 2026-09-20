// src/db/dedupe-gezeigte-buecher-2026-09-20.ts
//
// Einmaliges Reparatur-Skript (Bug-Fix 09/2026, Race Condition in
// sicherstelleGezeigt() — siehe schema.ts bei gezeigteBuecher): der frühere
// SELECT-dann-INSERT-Ablauf konnte bei zwei nahezu gleichzeitigen Aufrufen
// zwei Zeilen fürs selbe (kontoId, buchinhaltId) anlegen. Bevor der neue
// unique-Constraint "gezeigte_buecher_konto_buchinhalt_key" per
// `npx drizzle-kit push` angewendet werden kann, müssen diese Duplikate
// bereinigt werden.
//
// Auswahl, welche Zeile pro Duplikat-Gruppe behalten wird:
//   (a) Falls mindestens eine Zeile abgeschlossenAm gesetzt hat (also
//       tatsächlich fertig gelesen/durchgearbeitet wurde), wird NIE eine
//       solche Zeile verworfen — Fortschritt/Quiz-Daten gehen nicht
//       verloren. Gibt es mehrere abgeschlossene Duplikate (sollte
//       eigentlich nicht vorkommen, da Abschluss erst nach dem Zeigen
//       passiert), wird die mit dem FRÜHESTEN abgeschlossenAm behalten und
//       eine Warnung ausgegeben, da das ein echter Grenzfall ist, der
//       manuell geprüft werden sollte.
//   (b) Sonst wird die Zeile mit dem frühesten datumGezeigt behalten,
//       bei Gleichstand die mit der (lexikographisch) kleinsten id als
//       stabilem, deterministischem Tie-Break — die Tabelle hat kein
//       erstelltAm-Feld, und die id (uuid, defaultRandom()) trägt keine
//       zeitliche Ordnung, dient hier also nur dazu, dass wiederholte
//       Läufe immer dieselbe Zeile behalten.
//
// Idempotent: ein zweiter Lauf findet keine Duplikate mehr und tut nichts.
//
// Ausführen mit:  npx tsx src/db/dedupe-gezeigte-buecher-2026-09-20.ts

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("./index");
  const { gezeigteBuecher } = await import("./schema");
  const { inArray } = await import("drizzle-orm");

  const alle = await db
    .select({
      id: gezeigteBuecher.id,
      kontoId: gezeigteBuecher.kontoId,
      buchinhaltId: gezeigteBuecher.buchinhaltId,
      datumGezeigt: gezeigteBuecher.datumGezeigt,
      abgeschlossenAm: gezeigteBuecher.abgeschlossenAm,
    })
    .from(gezeigteBuecher);

  // Gruppieren nach (kontoId, buchinhaltId).
  const gruppen = new Map<string, typeof alle>();
  for (const zeile of alle) {
    const schluessel = `${zeile.kontoId}:${zeile.buchinhaltId}`;
    const gruppe = gruppen.get(schluessel);
    if (gruppe) {
      gruppe.push(zeile);
    } else {
      gruppen.set(schluessel, [zeile]);
    }
  }

  const duplikatGruppen = [...gruppen.entries()].filter(([, zeilen]) => zeilen.length > 1);

  if (duplikatGruppen.length === 0) {
    console.log("Keine Duplikate gefunden — nichts zu bereinigen.");
    return;
  }

  console.log(`${duplikatGruppen.length} Duplikat-Gruppe(n) gefunden:`);

  const zuLoeschendeIds: string[] = [];

  for (const [schluessel, zeilen] of duplikatGruppen) {
    const [kontoId, buchinhaltId] = schluessel.split(":");

    const abgeschlossene = zeilen.filter((z) => z.abgeschlossenAm !== null);

    let behalten: (typeof zeilen)[number];
    if (abgeschlossene.length > 0) {
      abgeschlossene.sort((a, b) => a.abgeschlossenAm!.getTime() - b.abgeschlossenAm!.getTime());
      behalten = abgeschlossene[0];
      if (abgeschlossene.length > 1) {
        console.warn(
          `  WARNUNG: konto=${kontoId} buchinhalt=${buchinhaltId} hat ${abgeschlossene.length} ` +
            `ABGESCHLOSSENE Duplikate — behalte die mit dem frühesten abgeschlossenAm (id=${behalten.id}). ` +
            `Bitte manuell prüfen, ob dabei Quiz-Daten verloren gehen.`
        );
      }
    } else {
      const sortiert = [...zeilen].sort((a, b) => {
        const datumDiff = a.datumGezeigt.getTime() - b.datumGezeigt.getTime();
        if (datumDiff !== 0) return datumDiff;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      behalten = sortiert[0];
    }

    const zuLoeschen = zeilen.filter((z) => z.id !== behalten.id);
    zuLoeschendeIds.push(...zuLoeschen.map((z) => z.id));

    console.log(
      `  - konto=${kontoId} buchinhalt=${buchinhaltId}: ${zeilen.length} Zeilen, ` +
        `behalte id=${behalten.id}, lösche ${zuLoeschen.length} Zeile(n) (${zuLoeschen
          .map((z) => z.id)
          .join(", ")})`
    );
  }

  if (zuLoeschendeIds.length > 0) {
    await db.delete(gezeigteBuecher).where(inArray(gezeigteBuecher.id, zuLoeschendeIds));
  }

  console.log(
    `Fertig: ${zuLoeschendeIds.length} doppelte Zeile(n) aus ${duplikatGruppen.length} Gruppe(n) gelöscht.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
