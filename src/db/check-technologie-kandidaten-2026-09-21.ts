// src/db/check-technologie-kandidaten-2026-09-21.ts
//
// Rein lesendes Diagnose-Skript (Pendenz "Technologie/Technik als 11.
// Hauptkategorie", 09/2026): prüft ALLE vorhandenen Bücher (Wunschliste,
// Vorrat, bereits gelesene) mit der Kategorie-Erkennung aus
// src/lib/kategorieerkennung.ts — inkl. des neuen Abgrenzungshinweises für
// technologie_technik — und listet die Bücher auf, die das Modell jetzt
// der neuen Kategorie zuordnen würde. Dient als Vorschlagsliste: welche
// davon tatsächlich umziehen, entscheidet der Nutzer; die eigentliche
// Umkategorisierung ist ein separater Schritt.
//
// Dieses Skript ändert NICHTS an der Datenbank — nur SELECT-Abfragen plus
// ein kurzer API-Aufruf (Claude, ohne Websuche) pro Buch.
//
// Voraussetzung: das neue Enum ist bereits in der DB (npx drizzle-kit push),
// sonst ist der Code-Stand ohnehin nicht deployt.
//
// Ausführen mit:  npx tsx src/db/check-technologie-kandidaten-2026-09-21.ts

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("./index");
  const { buecher, buchinhalte, gezeigteBuecher } = await import("./schema");
  const { eq } = await import("drizzle-orm");
  const { kategorieErkennen } = await import("../lib/kategorieerkennung");
  const { KATEGORIE_LABEL } = await import("../lib/kategorien");

  const alle = await db
    .select({
      buchId: buecher.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
      status: buchinhalte.status,
      buchinhaltId: buchinhalte.id,
    })
    .from(buecher)
    .leftJoin(buchinhalte, eq(buchinhalte.buchId, buecher.id));

  const gezeigt = new Set(
    (await db.select({ id: gezeigteBuecher.buchinhaltId }).from(gezeigteBuecher)).map((g) => g.id)
  );

  const kandidaten = alle.filter((b) => b.kategorie !== "technologie_technik");
  console.log(`${kandidaten.length} Bücher werden geprüft (dauert etwas) …\n`);

  const treffer: string[] = [];
  let fehler = 0;

  for (const buch of kandidaten) {
    const erkannt = await kategorieErkennen(buch.titel, buch.autor);
    if (erkannt === null) {
      fehler++;
      continue;
    }
    if (erkannt === "technologie_technik") {
      const zustand = !buch.buchinhaltId
        ? "noch nicht aufbereitet"
        : gezeigt.has(buch.buchinhaltId)
          ? "gezeigt/gelesen"
          : `aufbereitet (${buch.status})`;
      treffer.push(
        `- ${buch.titel} — ${buch.autor}  [bisher: ${KATEGORIE_LABEL[buch.kategorie] ?? buch.kategorie}; ${zustand}]`
      );
    }
  }

  if (treffer.length === 0) {
    console.log("Keine Bücher gefunden, die der neuen Kategorie Technologie zugeordnet würden.");
  } else {
    console.log(`${treffer.length} Kandidat(en) für Technologie:\n`);
    console.log(treffer.join("\n"));
  }
  if (fehler > 0) console.log(`\n(${fehler} Buch/Bücher konnten nicht eingeordnet werden, siehe Fehler oben.)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
