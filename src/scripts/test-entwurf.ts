// src/scripts/test-entwurf.ts
//
// Lässt die komplette Produktion für EIN Buch durchlaufen — alle drei
// Stufen genau wie die täglichen Crons (siehe src/lib/fertigstellung.ts):
// Stufe 1 = Entwurf, Stufe 2 = Prüfung + Korrektur, Stufe 3 = Synthese,
// Wissensstatus, Quiz — und misst die Zeit PRO STUFE. Kostet echte
// API-Aufrufe (Claude Sonnet 5 + Web-Suche); das Buch landet bei Erfolg
// regulär im Vorrat.
//
// 09/2026: jede Stufe läuft auf Vercel Hobby als eigener Aufruf mit
// höchstens 300 s (maxDuration) — beide Zeiten müssen einzeln deutlich
// darunter liegen.
//
// Ausführen mit:                     npx tsx src/scripts/test-entwurf.ts
//   (nimmt den ersten Vorschlag-Kandidaten, wie der Cron)
// Bestimmtes, noch nicht
// aufbereitetes Buch (exakter Titel): npx tsx src/scripts/test-entwurf.ts --titel="Chip War"
// Ein Buch, das nach einem Fehler in
// Stufe 2 oder 3 stecken blieb, ab
// seiner aktuellen Stufe fortsetzen:  npx tsx src/scripts/test-entwurf.ts --fortsetzen="Chip War"

import { config } from "dotenv";
config({ path: ".env.local" });

function sekunden(startMs: number): string {
  return `${((Date.now() - startMs) / 1000).toFixed(0)} s`;
}

async function main() {
  const titelArg = process.argv.find((a) => a.startsWith("--titel="));
  const titel = titelArg ? titelArg.slice("--titel=".length).trim() : undefined;
  const fortsetzenArg = process.argv.find((a) => a.startsWith("--fortsetzen="));
  const fortsetzenTitel = fortsetzenArg ? fortsetzenArg.slice("--fortsetzen=".length).trim() : undefined;

  const { db } = await import("../db");
  const { buchinhalte, buecher, kernaussagen, konten } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  const { vorschlaege } = await import("../lib/vorschlag");
  const { pipelineSchritt } = await import("../lib/entwurf");
  const { fertigstellen, pruefen } = await import("../lib/fertigstellung");

  let buch: { buchId: string; titel: string; autor: string; kategorie: string } | undefined;
  let fortsetzen: { buchinhaltId: string; status: string } | undefined;

  if (fortsetzenTitel) {
    const [treffer] = await db
      .select({
        buchId: buecher.id,
        titel: buecher.titel,
        autor: buecher.autor,
        kategorie: buecher.kategorie,
        buchinhaltId: buchinhalte.id,
        status: buchinhalte.status,
      })
      .from(buecher)
      .innerJoin(buchinhalte, eq(buchinhalte.buchId, buecher.id))
      .where(eq(buecher.titel, fortsetzenTitel));
    if (!treffer) throw new Error(`Kein aufbereiteter Buchinhalt für "${fortsetzenTitel}" gefunden.`);
    if (treffer.status === "im_vorrat") throw new Error(`"${fortsetzenTitel}" ist bereits fertig (im_vorrat).`);
    buch = treffer;
    fortsetzen = { buchinhaltId: treffer.buchinhaltId, status: treffer.status };
  } else if (titel) {
    const [treffer] = await db
      .select({ buchId: buecher.id, titel: buecher.titel, autor: buecher.autor, kategorie: buecher.kategorie })
      .from(buecher)
      .where(eq(buecher.titel, titel));
    if (!treffer) throw new Error(`Kein Buch mit dem Titel "${titel}" gefunden.`);
    const [vorhanden] = await db.select({ id: buchinhalte.id }).from(buchinhalte).where(eq(buchinhalte.buchId, treffer.buchId));
    if (vorhanden) throw new Error(`"${titel}" ist bereits aufbereitet (Buchinhalt ${vorhanden.id}).`);
    buch = treffer;
  } else {
    const [konto] = await db.select().from(konten).limit(1);
    if (!konto) throw new Error("Kein Konto gefunden — zuerst `npx tsx src/db/seed.ts` ausführen.");
    const [kandidat] = await vorschlaege(konto.id, 1);
    if (!kandidat) {
      console.log("Kein offener Vorschlag-Kandidat mehr.");
      return;
    }
    buch = kandidat;
  }

  console.log(`Produziere: ${buch.titel} (${buch.autor}) — Kategorie ${buch.kategorie}\n`);

  let ergebnis: { buchinhaltId: string };
  if (fortsetzen) {
    ergebnis = { buchinhaltId: fortsetzen.buchinhaltId };
    console.log(`Fortsetzen ab Status "${fortsetzen.status}" (Buchinhalt ${fortsetzen.buchinhaltId})`);
  } else {
    const stufe1Start = Date.now();
    ergebnis = await pipelineSchritt(buch.buchId);
    console.log(`STUFE 1 (Entwurf):                        ${sekunden(stufe1Start)}  (Limit: 300 s)`);
  }

  // Stufe 2 — wie im Cron höchstens zwei Durchgänge (erneut_pruefen).
  // Beim Fortsetzen eines bereits geprüften Buchs übersprungen.
  for (let durchgang = 1; durchgang <= 2 && fortsetzen?.status !== "geprueft"; durchgang++) {
    const stufe2Start = Date.now();
    const pruefung = await pruefen(ergebnis.buchinhaltId);
    console.log(`STUFE 2 (Prüfung + Korrektur), Durchgang ${durchgang}: ${sekunden(stufe2Start)}  (Limit: 300 s)`);
    if (pruefung.status === "verworfen") {
      console.log("\nEntwurf VERWORFEN — schwere Fehler:");
      for (const p of pruefung.probleme) console.log(`  - ${p}`);
      console.log("\nEntwurf wurde gelöscht; das Buch ist wieder frei.");
      return;
    }
    console.log(`  ${pruefung.korrekturenAngewendet} Korrektur(en) angewendet`);
    for (const h of pruefung.hinweise) console.log(`  Hinweis: ${h}`);
    if (pruefung.status === "geprueft") break;
  }

  const stufe3Start = Date.now();
  const fertig = await fertigstellen(ergebnis.buchinhaltId);
  console.log(`STUFE 3 (Synthese + Wissensstatus + Quiz): ${sekunden(stufe3Start)}  (Limit: 300 s)\n`);
  for (const h of fertig.hinweise) console.log(`  Hinweis: ${h}`);

  const [inhalt] = await db
    .select({
      einordnung: buchinhalte.einordnung,
      bleibtHaengen: buchinhalte.bleibtHaengen,
      pruefprotokoll: buchinhalte.pruefprotokoll,
    })
    .from(buchinhalte)
    .where(eq(buchinhalte.id, ergebnis.buchinhaltId));
  const ka = await db
    .select({ beispiel: kernaussagen.beispiel, wissensstatus: kernaussagen.wissensstatus })
    .from(kernaussagen)
    .where(eq(kernaussagen.buchinhaltId, ergebnis.buchinhaltId));

  console.log(`Buchinhalt ${ergebnis.buchinhaltId}`);
  console.log(`- ${ka.length} Kernaussagen, davon ${ka.filter((k) => k.beispiel).length} mit Beispiel`);
  const ws = ka.map((k) => k.wissensstatus?.status).filter(Boolean);
  console.log(`- Wissensstatus: ${ws.length}/${ka.length}${ws.length ? ` (${ws.join(", ")})` : ""}`);
  console.log(`- Tags: ${fertig.tags.length ? fertig.tags.join(", ") : "–"}`);
  console.log(`- ${fertig.quizfragenAnzahl} Quizfragen, Status: ${fertig.status}`);
  const e = inhalt?.einordnung;
  console.log(
    `- Einordnung: ${e ? `${e.umfang}, heute: ${e.heute ? `${e.heute.urteil} (${e.heute.quellen.length} Quelle(n))` : "–"}` : "keine"}`
  );
  console.log(`- Das bleibt hängen: ${inhalt?.bleibtHaengen ? `${inhalt.bleibtHaengen.ideen.length} Ideen + Frage` : "fehlt"}`);

  const korrekturen = inhalt?.pruefprotokoll?.korrekturen ?? [];
  if (korrekturen.length > 0) {
    console.log(`\nKorrekturen der Prüfung (${korrekturen.length}):`);
    for (const k of korrekturen) {
      console.log(`  [${k.angewendet ? "✓" : "✗"}] ${k.feld}: "${k.alt.slice(0, 70)}" → "${k.neu.slice(0, 70)}"`);
      if (k.grund) console.log(`      ${k.grund}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
