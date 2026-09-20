// src/lib/bewertung-speichern.ts
//
// Der eigentliche Schreibvorgang einer Kernaussage-Bewertung: legt bzw.
// aktualisiert die repetitionselemente-Zeile für (Konto, Kernaussage) und
// protokolliert die Bewertung zusätzlich in bewertungsereignisse. Zuvor
// direkt in app/wiederholung/actions.ts, 09/2026 hierher gezogen, weil
// inzwischen zwei Aufrufer existieren, die das Konto unterschiedlich
// auflösen.
//
// Bewusst KEIN "use server"-Modul: die Funktion bekommt die kontoId bereits
// aufgelöst übergeben und darf deshalb gerade nicht als Server Action von
// aussen aufrufbar sein. Die Server Action bewertungSpeichern
// (app/wiederholung/actions.ts) löst das Konto pro Aufruf auf und delegiert
// hierher; die Quiz-Action (app/quiz/[id]/actions.ts) löst das Konto EINMAL
// pro Request auf und ruft diese Funktion dann je Kernaussage auf, statt bei
// jeder einzelnen Bewertung erneut die konten-Zeile zu selektieren.

import { db } from "../db";
import { bewertungsereignisse, repetitionselemente } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { naechsteStufe, faelligkeitFuer, type Bewertung } from "./wiederholung";

export async function kernaussageBewertungSpeichern(
  kontoId: string,
  kernaussageId: string,
  bewertung: Bewertung
) {
  const [bestehend] = await db
    .select()
    .from(repetitionselemente)
    .where(
      and(
        eq(repetitionselemente.kontoId, kontoId),
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
      kontoId,
      kernaussageId,
      naechsteFaelligkeit: faelligkeit,
      intervallstufe: neueStufe,
      letzteBewertung: bewertung,
    });
  }

  await db.insert(bewertungsereignisse).values({ kontoId, kernaussageId, bewertung });
}
