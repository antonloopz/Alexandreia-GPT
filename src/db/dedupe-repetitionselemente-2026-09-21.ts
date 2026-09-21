// src/db/dedupe-repetitionselemente-2026-09-21.ts
//
// Diagnose- und Reparatur-Skript (Pendenz "Unique-Constraint auf
// repetitionselemente (kontoId, kernaussageId)", 09/2026) — gleiche
// Fehlerklasse wie dedupe-gezeigte-buecher-2026-09-20.ts: das "Upsert" in
// der Bewertungs-Logik war ein SELECT-dann-INSERT/UPDATE und konnte bei
// zwei fast gleichzeitigen Aufrufen zwei Zeilen für dieselbe Kernaussage
// bzw. Notiz anlegen. Bevor die neuen unique-Constraints
// "repetitionselemente_konto_kernaussage_key" / "..._konto_notiz_key" per
// `npx drizzle-kit push` angewendet werden können, dürfen keine Duplikate
// mehr existieren.
//
// Standard: NUR anzeigen. Mit --bereinigen werden pro Duplikat-Gruppe alle
// Zeilen bis auf eine gelöscht. Behalten wird die zuletzt aktualisierte
// (aktualisiertAm) — sie trägt den aktuellen Wiederholungsstand; bei
// Gleichstand die mit der höheren Intervallstufe, dann die kleinste id
// (stabiler Tie-Break, damit wiederholte Läufe dieselbe Zeile behalten).
// bewertungsereignisse (das Protokoll) bleibt unberührt.
//
// Idempotent: ein zweiter Lauf findet keine Duplikate mehr.
//
// Anzeigen:    npx tsx src/db/dedupe-repetitionselemente-2026-09-21.ts
// Bereinigen:  npx tsx src/db/dedupe-repetitionselemente-2026-09-21.ts --bereinigen

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const bereinigen = process.argv.includes("--bereinigen");
  const { db } = await import("./index");
  const { repetitionselemente } = await import("./schema");
  const { inArray } = await import("drizzle-orm");

  const alle = await db
    .select({
      id: repetitionselemente.id,
      kontoId: repetitionselemente.kontoId,
      kernaussageId: repetitionselemente.kernaussageId,
      notizId: repetitionselemente.notizId,
      intervallstufe: repetitionselemente.intervallstufe,
      aktualisiertAm: repetitionselemente.aktualisiertAm,
    })
    .from(repetitionselemente);

  type Zeile = (typeof alle)[number];
  const gruppen = new Map<string, Zeile[]>();
  for (const z of alle) {
    // Genau eines von kernaussageId/notizId ist gesetzt (siehe schema.ts).
    const ziel = z.kernaussageId ? `k:${z.kernaussageId}` : z.notizId ? `n:${z.notizId}` : null;
    if (!ziel) continue;
    const schluessel = `${z.kontoId}|${ziel}`;
    gruppen.set(schluessel, [...(gruppen.get(schluessel) ?? []), z]);
  }

  const duplikate = [...gruppen.entries()].filter(([, zeilen]) => zeilen.length > 1);
  console.log(`${alle.length} Zeilen, ${gruppen.size} Wiederholungs-Elemente, ${duplikate.length} mit Duplikaten.`);
  if (duplikate.length === 0) return;

  const zuLoeschen: string[] = [];
  for (const [schluessel, zeilen] of duplikate) {
    const sortiert = [...zeilen].sort(
      (a, b) =>
        b.aktualisiertAm.getTime() - a.aktualisiertAm.getTime() ||
        b.intervallstufe - a.intervallstufe ||
        a.id.localeCompare(b.id)
    );
    const [behalten, ...rest] = sortiert;
    console.log(
      `- ${schluessel.split("|")[1]}: ${zeilen.length} Zeilen — behalte Stufe ${behalten.intervallstufe} ` +
        `(${behalten.aktualisiertAm.toISOString()}), lösche ${rest.map((r) => `Stufe ${r.intervallstufe}`).join(", ")}`
    );
    zuLoeschen.push(...rest.map((r) => r.id));
  }

  if (!bereinigen) {
    console.log(`\nNur Anzeige — ${zuLoeschen.length} Zeile(n) würden gelöscht. Mit --bereinigen ausführen.`);
    return;
  }
  await db.delete(repetitionselemente).where(inArray(repetitionselemente.id, zuLoeschen));
  console.log(`\n${zuLoeschen.length} Zeile(n) gelöscht.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
