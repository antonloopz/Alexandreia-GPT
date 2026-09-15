// app/lernkarten/[id]/actions.ts
//
// Server Action: eine Lernkarten-Bewertung speichern. Legt bzw. aktualisiert
// die repetitionselemente-Zeile für (Konto, Kernaussage) — das ist die
// Grundlage für den späteren Wiederholung-Screen (faellige Wiederholungen).
//
// Protokolliert zusätzlich JEDE Bewertung als eigenes Ereignis in
// bewertungsereignisse (09/2026, Pendenz "Event-Log für Bewertungen/Quiz-
// Antworten (Fortschritt-Fix)") — rein additiv, ändert nichts an der
// bestehenden SRS-Logik oben. Fortschritt.tsx nutzt das Event-Log für die
// Wochen-Balken statt repetitionselemente.aktualisiertAm, das nur den
// LETZTEN Bewertungszeitpunkt trägt und mehrfach in derselben Woche
// bewertete Karten deshalb untererfasste.

"use server";

import { db } from "../../../src/db";
import { bewertungsereignisse, konten, repetitionselemente } from "../../../src/db/schema";
import { and, eq } from "drizzle-orm";
import { naechsteStufe, faelligkeitFuer, type Bewertung } from "../../../src/lib/wiederholung";

export async function bewertungSpeichern(kernaussageId: string, bewertung: Bewertung) {
  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) return;

  const [bestehend] = await db
    .select()
    .from(repetitionselemente)
    .where(
      and(
        eq(repetitionselemente.kontoId, konto.id),
        eq(repetitionselemente.kernaussageId, kernaussageId)
      )
    );

  const aktuelleStufe = bestehend?.intervallstufe ?? 0;
  const neueStufe = naechsteStufe(bewertung, aktuelleStufe);
  const faelligkeit = faelligkeitFuer(neueStufe);

  if (bestehend) {
    await db
      .update(repetitionselemente)
      .set({
        intervallstufe: neueStufe,
        naechsteFaelligkeit: faelligkeit,
        letzteBewertung: bewertung,
        aktualisiertAm: new Date(),
      })
      .where(eq(repetitionselemente.id, bestehend.id));
  } else {
    await db.insert(repetitionselemente).values({
      kontoId: konto.id,
      kernaussageId,
      naechsteFaelligkeit: faelligkeit,
      intervallstufe: neueStufe,
      letzteBewertung: bewertung,
    });
  }

  await db.insert(bewertungsereignisse).values({ kontoId: konto.id, kernaussageId, bewertung });
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

  if (bestehend) {
    await db
      .update(repetitionselemente)
      .set({
        intervallstufe: neueStufe,
        naechsteFaelligkeit: faelligkeit,
        letzteBewertung: bewertung,
        aktualisiertAm: new Date(),
      })
      .where(eq(repetitionselemente.id, bestehend.id));
  } else {
    await db.insert(repetitionselemente).values({
      kontoId: konto.id,
      notizId,
      naechsteFaelligkeit: faelligkeit,
      intervallstufe: neueStufe,
      letzteBewertung: bewertung,
    });
  }

  await db.insert(bewertungsereignisse).values({ kontoId: konto.id, notizId, bewertung });
}
