// app/wiederholung/sitzung/page.tsx
//
// Server Component: lädt fällige repetitionselemente mit ihrer Lernkarte,
// übergibt an die client-seitige Schritt-für-Schritt-Sitzung. Kein eigenes
// Mockup — orientiert sich am Lernkarten-Screen (gleiche Frage/Antwort-
// Karte + 3 Bewertungs-Chips), da es sich fachlich um dieselbe Interaktion
// handelt.
//
// 09/2026: optionaler ?buchinhaltId=... Query-Parameter beschränkt die
// Sitzung auf ein einzelnes Buch (von den neuen Pro-Buch-Zeilen in
// app/wiederholung/page.tsx aus verlinkt) — ohne Parameter bleibt es wie
// bisher bücherübergreifend über alle fälligen Karten (Button unten auf
// derselben Seite).

import { redirect } from "next/navigation";
import { db } from "../../../src/db";
import {
  buchinhalte,
  buecher,
  kernaussagen,
  konten,
  lernkarten,
  repetitionselemente,
} from "../../../src/db/schema";
import { and, asc, eq, lte } from "drizzle-orm";
import SitzungClient from "./SitzungClient";

export const dynamic = "force-dynamic";

export default async function WiederholungSitzungSeite({
  searchParams,
}: {
  searchParams: Promise<{ buchinhaltId?: string }>;
}) {
  const { buchinhaltId } = await searchParams;
  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) redirect("/wiederholung");

  const heute = new Date();

  const faellig = await db
    .select({
      kernaussageId: repetitionselemente.kernaussageId,
      titel: buecher.titel,
      frage: lernkarten.frage,
      antwort: lernkarten.antwort,
    })
    .from(repetitionselemente)
    .innerJoin(kernaussagen, eq(repetitionselemente.kernaussageId, kernaussagen.id))
    .innerJoin(buchinhalte, eq(kernaussagen.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .innerJoin(lernkarten, eq(lernkarten.kernaussageId, kernaussagen.id))
    .where(
      and(
        eq(repetitionselemente.kontoId, konto.id),
        lte(repetitionselemente.naechsteFaelligkeit, heute),
        buchinhaltId ? eq(buchinhalte.id, buchinhaltId) : undefined
      )
    )
    .orderBy(asc(repetitionselemente.naechsteFaelligkeit));

  // Pro Kernaussage nur eine Karte (falls mehrere Lernkarten existieren,
  // wird nur die erste abgefragt).
  const gesehen = new Set<string>();
  const karten = faellig.filter((k) => {
    if (gesehen.has(k.kernaussageId)) return false;
    gesehen.add(k.kernaussageId);
    return true;
  });

  if (karten.length === 0) redirect("/wiederholung");

  return <SitzungClient karten={karten} />;
}
