// app/buecherliste/actions.ts
//
// Zwei neue Aktionen für die Bücherliste, ergänzend zum bestehenden
// "Jetzt lesen" (nur sichtbar, wenn ein Buch schon produziert ist):
//
// - prioritaetUmschalten: markiert einen Wunschlisten-Eintrag für den
//   nächsten automatischen Cron-Lauf. Nutzt das bestehende "bald"-Feld
//   doppelt — bisher nur Sortier-/Anzeigehinweis, jetzt zusätzlich das
//   Signal, das vorschlaege() (vorschlag.ts) auswertet, um dieses Buch
//   unabhängig von der sonstigen Kategorie-Mindestbestand-Logik als
//   Nächstes zu wählen.
// - buchJetztAufbereiten: sofortige, manuelle Ad-hoc-Produktion EINES
//   gewählten Buchs — dieselbe Pipeline wie im Cron-Job
//   (app/api/cron/produzieren/route.ts), nur ohne die automatische
//   Kandidatenauswahl über vorschlaege(). Lief ursprünglich synchron IN der
//   Server Action (1-3 Minuten, echte Claude-API-Aufrufe inkl. Websuche) und
//   leitete bei Erfolg direkt zum fertigen Buch weiter — das hing die ganze
//   Verarbeitung an die eine offene Verbindung: Tab schliessen oder App
//   wechseln konnte sie abbrechen, und ohne eigenes maxDuration drohte auf
//   Vercel zusätzlich ein Server-seitiges Timeout weit vor den echten 1-3
//   Minuten (09/2026, Pendenz "Jetzt aufbereiten im Hintergrund").
//
//   Jetzt: die Server Action kehrt sofort zurück (kein Warten, kein
//   Timeout-Risiko mehr), die eigentliche Pipeline läuft über next/server
//   after() weiter — GENAU wie schon der Umfang-Nachschlag in
//   buecherliste/page.tsx — und damit unabhängig davon, ob die Seite noch
//   offen ist. Preis dafür: kein automatischer Sprung zur fertigen
//   Leseseite mehr (der Buchinhalt existiert ja erst NACH der Antwort) und
//   kein Live-Fehlerbanner bei Misserfolg — Fehler landen im Server-Log,
//   und ein gescheitertes Buch bleibt einfach unverändert auf der
//   Wunschliste stehen (statt bei Erfolg zu verschwinden).

"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "../../src/db";
import { buecher, wunschlisteneintraege } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { pipelineSchritt } from "../../src/lib/entwurf";
import { erstelleQuizfragen } from "../../src/lib/quiz-generierung";
import { kiDeaktiviert } from "../../src/lib/testmodus";

export async function prioritaetUmschalten(eintragId: string, aktiv: boolean) {
  await db
    .update(wunschlisteneintraege)
    .set({ bald: aktiv })
    .where(eq(wunschlisteneintraege.id, eintragId));
  revalidatePath("/buecherliste");
}

// Entfernt einen Wunschlisten-Eintrag endgültig (09/2026, Pendenz
// "Wunschliste: Einträge bearbeiten/löschen"). Löscht bewusst NUR die
// wunschlisteneintraege-Zeile, nicht das verknüpfte buecher-Datum — das
// Buch selbst bleibt bestehen (z.B. falls es doch schon in Produktion ist
// oder ein anderer Wunschlisten-Eintrag noch darauf verweist).
export async function eintragLoeschen(eintragId: string) {
  await db.delete(wunschlisteneintraege).where(eq(wunschlisteneintraege.id, eintragId));
  revalidatePath("/buecherliste");
}

export async function buchJetztAufbereiten(buchId: string) {
  // Kostenfreie Testumgebung: löst echte Claude-API-Aufrufe aus, deshalb
  // hier zusätzlich serverseitig abgesichert (der Button ist dort zwar
  // schon durch einen Hinweis ersetzt, aber diese Action bleibt technisch
  // aufrufbar). Siehe src/lib/testmodus.ts.
  if (kiDeaktiviert()) {
    console.error(`buchJetztAufbereiten(${buchId}): übersprungen — Testumgebung (NEXT_PUBLIC_KI_DEAKTIVIERT).`);
    return;
  }

  after(async () => {
    try {
      const ergebnis = await pipelineSchritt(buchId);
      if (ergebnis.status === "verworfen") {
        console.error(`buchJetztAufbereiten(${buchId}): Entwurf verworfen (Prüfung nicht bestanden).`);
        return;
      }

      const [buch] = await db.select().from(buecher).where(eq(buecher.id, buchId));
      if (!buch) {
        console.error(`buchJetztAufbereiten(${buchId}): Buch nach erfolgreicher Produktion nicht gefunden.`);
        return;
      }
      await erstelleQuizfragen(ergebnis.buchinhaltId, buch.titel, buch.autor);
    } catch (e) {
      // Landet im Server-Log (Terminal bei "npm run dev", Vercel-Logs in
      // Produktion) — kein Live-Fehlerbanner mehr möglich, da die Antwort an
      // den Browser längst raus ist, bevor dieser Block überhaupt läuft.
      console.error(`buchJetztAufbereiten(${buchId}) fehlgeschlagen:`, e);
    } finally {
      // Erst NACH der eigentlichen Arbeit revalidieren, nicht schon beim
      // sofortigen Rückgabewert der Server Action — sonst würde nichts
      // Neues sichtbar, weil der Buchinhalt zu dem Zeitpunkt noch gar nicht
      // existiert.
      revalidatePath("/buecherliste");
      revalidatePath("/bookshelf");
      revalidatePath("/");
    }
  });
}
