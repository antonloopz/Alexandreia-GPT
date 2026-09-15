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

"use server";

import { db } from "../../../src/db";
import { konten, quizantworten } from "../../../src/db/schema";

export async function quizantwortenProtokollieren(
  buchinhaltId: string,
  antworten: { quizfrageId: string; richtig: boolean }[]
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
}
