// app/api/cron/produzieren/route.ts
//
// Automatisiert, was bisher nur über die lokalen Testskripte (tsx
// src/scripts/test-*.ts) von Hand angestossen wurde: einmal täglich per
// Vercel Cron Job die Pipeline Vorschlag → Entwurf → Prüfung → Lernkarten/
// Quiz für GENAU EIN Buch durchlaufen lassen (Kostenkontrolle — jeder Lauf
// kostet echte Claude-API-Aufrufe inkl. Websuche). vorschlaege() liefert
// dabei automatisch Kandidaten für alle Kategorien mit Nachholbedarf
// (knappste zuerst); produziert wird der erste davon, der bereits bestätigt
// ist (siehe Kommentar weiter unten) — ist keine Kategorie unter dem
// Mindestbestand, passiert nichts.
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
import { ALLE_KATEGORIEN, vorschlaege } from "../../../../src/lib/vorschlag";
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

  // anzahl = ALLE_KATEGORIEN.length statt 1 (09/2026, Bugfix): vorher wurde
  // nur der EINE Kandidat der knappsten Kategorie angefragt — war der
  // zufällig ein unbestätigter KI-Vorschlag, brach der ganze Cron-Lauf ab,
  // selbst wenn eine ANDERE knappe Kategorie längst einen bestätigten
  // Wunschlisten-Kandidaten bereit hatte (manche Tage wurde dadurch gar
  // nichts produziert, obwohl es möglich gewesen wäre). vorschlaege()
  // liefert höchstens einen Kandidaten pro Kategorie (siehe dort), daher
  // deckt die Kategorie-Gesamtzahl im ungünstigsten Fall (alle Kategorien
  // knapp) jede einzelne ab.
  const kandidaten = await vorschlaege(konto.id, ALLE_KATEGORIEN.length);
  if (kandidaten.length === 0) {
    return Response.json({
      status: "kein_bedarf",
      info: "Alle Kategorien haben den Mindestbestand erreicht.",
    });
  }

  // Über alle angefragten Kandidaten (knappste Kategorie zuerst) den ersten
  // bereits bestätigten nehmen — nicht mehr nur den allerersten prüfen,
  // siehe Kommentar oben.
  const kandidat = kandidaten.find((k) => k.quelle === "eigene_liste");

  // KI-Vorschläge (Klassiker/Geheimtipp/Synergie) warten auf die
  // Bestätigung des Nutzers (09/2026, Pendenz "Wunschliste: Markierung ob
  // Vorschlag von Claude oder Eintrag vom Nutzer") — sie landen zwar schon
  // als Karte auf der Wunschliste (siehe recherche.ts), werden aber vom
  // Cron NICHT automatisch produziert. Erst ein Klick auf "Aufbereiten"
  // (oder "bald"-Priorisierung) auf der Wunschliste selbst löst
  // pipelineSchritt() für so einen Kandidaten aus. Nur "eigene_liste"
  // (selbst hinzugefügt oder manuell "bald" vorgemerkt) läuft hier weiter
  // automatisch durch. Sind ALLE angefragten Kandidaten unbestätigt (keine
  // knappe Kategorie hat einen eigene_liste-Kandidaten), werden sie hier
  // komplett aufgelistet statt nur der eine der knappsten Kategorie — sonst
  // bräuchte man für die Fehlersuche in den Vercel-Logs eine zweite Anfrage.
  if (!kandidat) {
    return Response.json({
      status: "wartet_auf_bestaetigung",
      kandidaten: kandidaten.map((k) => ({
        buch: `${k.titel} (${k.autor})`,
        kategorie: k.kategorie,
        quelle: k.quelle,
      })),
      info: "Alle knappen Kategorien haben nur unbestätigte KI-Vorschläge auf der Wunschliste bereit — wartet auf Bestätigung (\"Aufbereiten\" oder \"bald\").",
    });
  }

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

  // uebersprungeneVorschlaege: wie viele der angefragten Kandidaten NICHT
  // produziert wurden (unbestätigte KI-Vorschläge anderer knapper
  // Kategorien, die dieser Lauf übersprungen hat) — rein informativ für die
  // Vercel-Logs, ändert am Produktionsergebnis nichts.
  return Response.json({
    status: "produziert",
    buch: `${kandidat.titel} (${kandidat.autor})`,
    kategorie: kandidat.kategorie,
    buchinhaltId: ergebnis.buchinhaltId,
    kernaussagenAnzahl: ergebnis.anzahlKernaussagen,
    lernkartenAnzahl: lernkartenErgebnis.lernkartenAnzahl,
    quizfragenAnzahl: lernkartenErgebnis.quizfragenAnzahl,
    uebersprungen: lernkartenErgebnis.uebersprungen,
    ...(kandidaten.length > 1 ? { uebersprungeneVorschlaege: kandidaten.length - 1 } : {}),
  });
}
