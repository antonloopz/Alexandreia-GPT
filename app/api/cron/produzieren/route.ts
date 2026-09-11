// app/api/cron/produzieren/route.ts
//
// Automatisiert, was bisher nur über die lokalen Testskripte (tsx
// src/scripts/test-*.ts) von Hand angestossen wurde: einmal täglich per
// Vercel Cron Job die Pipeline Vorschlag → Entwurf → Prüfung → Lernkarten/
// Quiz für GENAU EIN Buch durchlaufen lassen (Kostenkontrolle — jeder Lauf
// kostet echte Claude-API-Aufrufe inkl. Websuche). vorschlaege() liefert
// dabei automatisch die Kategorie mit dem grössten Nachholbedarf; ist keine
// Kategorie unter dem Mindestbestand, passiert nichts.
//
// Absicherung nach Vercel-Doku: CRON_SECRET als Bearer-Token, das Vercel bei
// eigenen Cron-Aufrufen automatisch mitschickt (siehe vercel.json).
// maxDuration = 300 ist auf Hobby bereits das Maximum, reicht für einen
// Buch-Durchlauf (Entwurf+Prüfung+Lernkarten sind zusammen meist unter 2-3
// Minuten) komfortabel.
//
// Bewusst kein Lock gegen doppelte Cron-Auslieferung (laut Vercel-Doku
// selten, aber möglich): im schlimmsten Fall entsteht für ein Buch zweimal
// ein Buchinhalt — bei einem Einzelnutzer-Hobbyprojekt kein Problem, das
// eine eigene Infrastruktur (z.B. Redis-Lock) rechtfertigen würde.

import { NextRequest } from "next/server";
import { db } from "../../../../src/db";
import { konten } from "../../../../src/db/schema";
import { vorschlaege } from "../../../../src/lib/vorschlag";
import { pipelineSchritt } from "../../../../src/lib/entwurf";
import { erstelleLernkartenUndQuiz } from "../../../../src/lib/lernkarten";
import { kiDeaktiviert } from "../../../../src/lib/testmodus";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Kostenfreie Testumgebung: dieser Lauf löst echte Claude-API-Kosten aus
  // (Kernauftrag dieses Kommentarblocks oben — "Kostenkontrolle"). Läuft
  // auf einem Vercel-Preview-Deployment ohnehin kein Cron automatisch,
  // dieser Schalter ist die zusätzliche Absicherung für den Fall, dass die
  // Route trotzdem manuell mit dem CRON_SECRET aufgerufen wird. Siehe
  // src/lib/testmodus.ts.
  if (kiDeaktiviert()) {
    return Response.json({ status: "testumgebung_deaktiviert" });
  }

  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) {
    return Response.json({ status: "kein_konto" });
  }

  const kandidaten = await vorschlaege(konto.id, 1);
  if (kandidaten.length === 0) {
    return Response.json({
      status: "kein_bedarf",
      info: "Alle Kategorien haben den Mindestbestand erreicht.",
    });
  }

  const kandidat = kandidaten[0];

  const ergebnis = await pipelineSchritt(kandidat.buchId);

  if (ergebnis.status === "verworfen") {
    return Response.json({
      status: "verworfen",
      buch: `${kandidat.titel} (${kandidat.autor})`,
      kategorie: kandidat.kategorie,
      probleme: ergebnis.probleme,
    });
  }

  const lernkartenErgebnis = await erstelleLernkartenUndQuiz(
    ergebnis.buchinhaltId,
    kandidat.titel,
    kandidat.autor
  );

  return Response.json({
    status: "produziert",
    buch: `${kandidat.titel} (${kandidat.autor})`,
    kategorie: kandidat.kategorie,
    buchinhaltId: ergebnis.buchinhaltId,
    kernaussagenAnzahl: ergebnis.anzahlKernaussagen,
    lernkartenAnzahl: lernkartenErgebnis.lernkartenAnzahl,
    quizfragenAnzahl: lernkartenErgebnis.quizfragenAnzahl,
    uebersprungen: lernkartenErgebnis.uebersprungen,
  });
}
