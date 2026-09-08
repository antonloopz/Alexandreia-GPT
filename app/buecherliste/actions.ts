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
//   Kandidatenauswahl über vorschlaege(). Läuft synchron im Server Action
//   (1-3 Minuten, echte Claude-API-Aufrufe inkl. Websuche) und leitet bei
//   Erfolg direkt zum fertigen Buch weiter.

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "../../src/db";
import { buecher, wunschlisteneintraege } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { pipelineSchritt } from "../../src/lib/entwurf";
import { erstelleLernkartenUndQuiz } from "../../src/lib/lernkarten";

export async function prioritaetUmschalten(eintragId: string, aktiv: boolean) {
  await db
    .update(wunschlisteneintraege)
    .set({ bald: aktiv })
    .where(eq(wunschlisteneintraege.id, eintragId));
  revalidatePath("/buecherliste");
}

export async function buchJetztAufbereiten(buchId: string) {
  let buchinhaltId: string | null = null;
  let fehler: "verworfen" | "technisch" | null = null;

  try {
    const ergebnis = await pipelineSchritt(buchId);
    if (ergebnis.status === "verworfen") {
      fehler = "verworfen";
    } else {
      const [buch] = await db.select().from(buecher).where(eq(buecher.id, buchId));
      if (!buch) {
        fehler = "technisch";
      } else {
        await erstelleLernkartenUndQuiz(ergebnis.buchinhaltId, buch.titel, buch.autor);
        buchinhaltId = ergebnis.buchinhaltId;
      }
    }
  } catch {
    fehler = "technisch";
  }

  // redirect() wirft intern — bewusst AUSSERHALB des try/catch aufgerufen,
  // sonst würde der eigene catch-Block den Redirect abfangen.
  if (buchinhaltId) {
    redirect(`/lesen/${buchinhaltId}`);
  }
  redirect(`/buecherliste?fehler=${fehler}`);
}
