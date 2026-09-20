// app/quiz/[id]/actions.ts
//
// Server Action: protokolliert JEDE einzelne Quiz-Antwort als eigenes
// Ereignis (09/2026, Pendenz "Event-Log für Bewertungen/Quiz-Antworten
// (Fortschritt-Fix)") — Fortschritt.tsx berechnet die Quiz-Trefferquote
// daraus statt aus dem alten, nur einmalig pro Buch gesetzten Aggregat
// (gezeigteBuecher.quizRichtigAnzahl/quizGesamtAnzahl, die für Abschluss.tsx
// unverändert weiterbestehen). Wird von QuizClient aufgerufen, sobald alle
// Fragen beantwortet sind — bewusst EIN Bulk-Insert statt eines Aufrufs pro
// einzelner Antwort, um keine Server-Roundtrips während des Quiz-Durchlaufs
// selbst zu brauchen.
//
// 09/2026: mit Abschaffung der Lernkarten (eigener 3-Wege-Bewertungsschritt
// nach den Kernaussagen) treibt jetzt das Quiz-Ergebnis selbst die
// Wiederholung-Planung an (repetitionselemente) — zusätzlich zum reinen
// quizantworten-Log oben, additiv, ohne dass daran etwas geändert wird.

"use server";

import { db } from "../../../src/db";
import { konten, quizantworten } from "../../../src/db/schema";
import { kernaussageBewertungSpeichern } from "../../../src/lib/bewertung-speichern";
import type { Bewertung } from "../../../src/lib/wiederholung";

export async function quizantwortenProtokollieren(
  buchinhaltId: string,
  antworten: { quizfrageId: string; kernaussageId: string; richtig: boolean }[]
) {
  if (antworten.length === 0) return;

  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) return;

  await db.insert(quizantworten).values(
    antworten.map((a) => ({
      kontoId: konto.id,
      buchinhaltId,
      quizfrageId: a.quizfrageId,
      richtig: a.richtig,
    }))
  );

  // Das Quiz-Ergebnis speist zusätzlich die Wiederholung-Planung: richtig
  // beantwortet -> "gewusst" (Intervall wächst), falsch beantwortet ->
  // "nicht_gewusst" (Intervall fällt auf Stufe 0 zurück) — das ersetzt die
  // frühere, eigenständige Lernkarten-Bewertung. "unsicher" kommt hier
  // bewusst NICHT vor: eine binäre Quiz-Antwort deckt nur 2 der 3 Stufen ab,
  // "unsicher" bleibt der manuellen Selbsteinschätzung im
  // Wiederholung-Screen (SitzungClient) vorbehalten.
  //
  // Gewertet wird dabei je KERNAUSSAGE, nicht je Antwort: zu einer
  // Kernaussage dürfen mehrere Quizfragen gehören (so ist der
  // Generierungs-Prompt in src/lib/quiz-generierung.ts ausdrücklich
  // formuliert). Ohne die Zusammenfassung unten würde jede weitere richtige
  // Antwort zur selben Kernaussage die Intervallstufe in derselben Sitzung
  // ein weiteres Mal anheben (drei richtige Antworten: Stufe 0 -> 3, also
  // erst in 16 statt in 1 Tag fällig), und bei gemischten Antworten hinge
  // das Ergebnis an der Reihenfolge. Regel: EINE falsche Antwort genügt, um
  // die ganze Kernaussage als "nicht_gewusst" zu werten, sonst "gewusst".
  const bewertungProKernaussage = new Map<string, Bewertung>();
  for (const antwort of antworten) {
    const bisher = bewertungProKernaussage.get(antwort.kernaussageId);
    if (bisher === "nicht_gewusst") continue;
    bewertungProKernaussage.set(
      antwort.kernaussageId,
      antwort.richtig ? "gewusst" : "nicht_gewusst"
    );
  }

  // Konto oben bereits aufgelöst — deshalb hier der interne Helper statt der
  // Server Action bewertungSpeichern, die pro Aufruf erneut selektieren würde.
  for (const [kernaussageId, bewertung] of bewertungProKernaussage) {
    await kernaussageBewertungSpeichern(konto.id, kernaussageId, bewertung);
  }
}
