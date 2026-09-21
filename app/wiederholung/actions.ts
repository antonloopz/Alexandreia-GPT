// app/wiederholung/actions.ts
//
// Server Actions: eine Wiederholungs-Bewertung speichern. Legt bzw.
// aktualisiert die repetitionselemente-Zeile für (Konto, Kernaussage) bzw.
// (Konto, Notiz) — das ist die Grundlage für den Wiederholung-Screen
// (fällige Wiederholungen).
//
// Ursprünglich in app/lernkarten/[id]/actions.ts (09/2026 hierher
// verschoben, als die Lernkarten-Bewertung durch die binäre Quiz-Antwort
// ersetzt wurde — siehe app/quiz/[id]/actions.ts). Beide Funktionen hier
// waren schon vorher unabhängig von der lernkarten-Tabelle (nur
// repetitionselemente/bewertungsereignisse), deshalb reine Verschiebung
// ohne Logikänderung. Aufrufer: app/wiederholung/sitzung/SitzungClient.tsx
// (manuelle 3-Wege-Bewertung im Wiederholung-Screen) UND
// app/quiz/[id]/actions.ts (automatische 2-Wege-Bewertung aus dem
// Quiz-Ergebnis).
//
// Protokolliert zusätzlich JEDE Bewertung als eigenes Ereignis in
// bewertungsereignisse (09/2026, Pendenz "Event-Log für Bewertungen/Quiz-
// Antworten (Fortschritt-Fix)") — rein additiv, ändert nichts an der
// bestehenden SRS-Logik oben. Fortschritt.tsx nutzt das Event-Log für die
// Wochen-Balken statt repetitionselemente.aktualisiertAm, das nur den
// LETZTEN Bewertungszeitpunkt trägt und mehrfach in derselben Woche
// bewertete Karten deshalb untererfasste.
//
// 09/2026: der Schreibvorgang für Kernaussage-Bewertungen selbst steht
// inzwischen in src/lib/bewertung-speichern.ts, damit die Quiz-Action das
// Konto einmal pro Request auflösen kann statt einmal pro Bewertung; hier
// bleibt nur noch die Konto-Auflösung. Der Hervorhebungs-Pfad unten ist
// davon unberührt.

"use server";

import { db } from "../../src/db";
import { bewertungsereignisse, konten, repetitionselemente } from "../../src/db/schema";
import { and, eq } from "drizzle-orm";
import { naechsteStufe, faelligkeitFuer, type Bewertung } from "../../src/lib/wiederholung";
import { kernaussageBewertungSpeichern } from "../../src/lib/bewertung-speichern";

// Löst das (einzige) Konto auf und delegiert den eigentlichen Schreibvorgang
// an kernaussageBewertungSpeichern (src/lib/bewertung-speichern.ts). Die
// exportierte Signatur bleibt unverändert — Aufrufer ist SitzungClient. Wer
// in einem Request MEHRERE Kernaussagen bewertet (die Quiz-Action), löst das
// Konto dort einmal selbst auf und ruft den Helper direkt auf, statt pro
// Bewertung erneut die konten-Zeile zu selektieren.
export async function bewertungSpeichern(kernaussageId: string, bewertung: Bewertung) {
  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) return;

  await kernaussageBewertungSpeichern(konto.id, kernaussageId, bewertung);
}

// Analog zu bewertungSpeichern, aber für eine vom Nutzer selbst zur
// Wiederholung hinzugefügte Hervorhebung/Notiz (repetitionselemente.notizId
// statt .kernaussageId) — Pendenz "Notizen/Hervorhebungen optional in die
// Wiederholung aufnehmen", 09/2026. Die Wiederholung-Sitzung (SitzungClient)
// ruft je nach Kartentyp die eine oder die andere Funktion auf; die
// eigentliche Intervall-Logik (naechsteStufe/faelligkeitFuer) ist identisch.
export async function hervorhebungBewertungSpeichern(notizId: string, bewertung: Bewertung) {
  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) return;

  const [bestehend] = await db
    .select()
    .from(repetitionselemente)
    .where(
      and(
        eq(repetitionselemente.kontoId, konto.id),
        eq(repetitionselemente.notizId, notizId)
      )
    );

  const aktuelleStufe = bestehend?.intervallstufe ?? 0;
  const neueStufe = naechsteStufe(bewertung, aktuelleStufe);
  const faelligkeit = faelligkeitFuer(neueStufe);

  // Upsert über den unique-Constraint (kontoId, notizId) — siehe
  // kernaussageBewertungSpeichern (lib/bewertung-speichern.ts).
  await db
    .insert(repetitionselemente)
    .values({
      kontoId: konto.id,
      notizId,
      naechsteFaelligkeit: faelligkeit,
      intervallstufe: neueStufe,
      letzteBewertung: bewertung,
    })
    .onConflictDoUpdate({
      target: [repetitionselemente.kontoId, repetitionselemente.notizId],
      set: {
        intervallstufe: neueStufe,
        naechsteFaelligkeit: faelligkeit,
        letzteBewertung: bewertung,
        aktualisiertAm: new Date(),
      },
    });

  await db.insert(bewertungsereignisse).values({ kontoId: konto.id, notizId, bewertung });
}
