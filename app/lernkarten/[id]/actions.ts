// app/lernkarten/[id]/actions.ts
//
// Server Action: eine Lernkarten-Bewertung speichern. Legt bzw. aktualisiert
// die repetitionselemente-Zeile für (Konto, Kernaussage) — das ist die
// Grundlage für den späteren Wiederholung-Screen (faellige Wiederholungen).

"use server";

import { db } from "../../../src/db";
import { konten, repetitionselemente } from "../../../src/db/schema";
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
}
