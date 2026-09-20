// src/db/recover-stuck-buchinhalt-2026-09-20.ts
//
// Einmaliges Reparatur-Skript für genau das eine, konkret bekannte
// feststeckende Buch, das per check-stuck-buchinhalte-2026-09-20.ts (rein
// lesendes Diagnose-Skript, siehe dort) heute gefunden wurde: "Solve for
// Happy" von Mo Gawdat, buchinhaltId 0060b763-b7dc-491e-8b00-1c00a15bbec4.
// Es hing bei buchinhalte.status = "geprueft" fest, weil ein Claude-Call
// in erstelleLernkartenUndQuiz() (siehe lib/lernkarten.ts) mit 0
// Lernkarten und/oder 0 Quizfragen zurückkam, ohne dass ein Fehler
// geworfen wurde.
//
// Im Gegensatz zum Diagnose-Skript ändert dieses hier tatsächlich Daten:
// erstelleLernkartenUndQuiz() (jetzt mit eingebautem automatischem Retry,
// siehe dort) macht einen echten Claude-API-Call — das hat also reale
// Kosten und ist NICHT rein lesend.
//
// Sicherheitsprüfung: bevor irgendetwas passiert, wird der aktuelle Status
// des Buchinhalts geprüft. Steht er bereits auf "im_vorrat" (z.B. weil
// jemand das manuell erledigt hat, oder ein früherer Lauf dieses Skripts
// schon erfolgreich war), bricht das Skript sofort ab, OHNE
// erstelleLernkartenUndQuiz() erneut aufzurufen — es gibt keinen
// Unique-Constraint, der doppelte Lernkarten/Quizfragen verhindern würde,
// ein erneuter Aufruf würde also Duplikate anlegen.
//
// Ausführen mit:  npx tsx src/db/recover-stuck-buchinhalt-2026-09-20.ts

import { config } from "dotenv";
config({ path: ".env.local" });

const BUCHINHALT_ID = "0060b763-b7dc-491e-8b00-1c00a15bbec4";
const TITEL = "Solve for Happy";
const AUTOR = "Mo Gawdat";

async function main() {
  const { db } = await import("./index");
  const { buchinhalte } = await import("./schema");
  const { eq } = await import("drizzle-orm");
  const { erstelleQuizfragen } = await import("../lib/quiz-generierung");

  const vorher = await db
    .select({ status: buchinhalte.status })
    .from(buchinhalte)
    .where(eq(buchinhalte.id, BUCHINHALT_ID));

  if (vorher.length === 0) {
    console.log(`Kein Buchinhalt mit id ${BUCHINHALT_ID} gefunden — nichts zu tun.`);
    return;
  }

  console.log(`Aktueller Status von "${TITEL}" (${BUCHINHALT_ID}): "${vorher[0].status}"`);

  if (vorher[0].status === "im_vorrat") {
    console.log(
      'Buchinhalt steht bereits auf "im_vorrat" — vermutlich schon manuell repariert oder ein ' +
        "früherer Lauf dieses Skripts war schon erfolgreich. Breche ab, OHNE erneut " +
        "erstelleLernkartenUndQuiz() aufzurufen (sonst Gefahr doppelter Lernkarten/Quizfragen)."
    );
    return;
  }

  console.log("Rufe erstelleQuizfragen() auf (mit eingebautem automatischem Retry) — hiess zum Zeitpunkt dieses Skripts noch erstelleLernkartenUndQuiz(), seither umbenannt...");
  const ergebnis = await erstelleQuizfragen(BUCHINHALT_ID, TITEL, AUTOR);

  console.log(`Quizfragen erstellt: ${ergebnis.quizfragenAnzahl}`);
  if (ergebnis.uebersprungen.length > 0) {
    console.log("Übersprungen:");
    for (const eintrag of ergebnis.uebersprungen) {
      console.log(`  - ${eintrag}`);
    }
  }

  const nachher = await db
    .select({ status: buchinhalte.status })
    .from(buchinhalte)
    .where(eq(buchinhalte.id, BUCHINHALT_ID));

  if (nachher[0]?.status === "im_vorrat") {
    console.log("Buch erfolgreich aus dem Stau befreit — Status jetzt 'im_vorrat'");
  } else {
    console.log(
      "Auch nach eingebautem Retry weiterhin 0 Karten/Fragen — Buch bleibt bei 'geprueft', bitte manuell prüfen"
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
