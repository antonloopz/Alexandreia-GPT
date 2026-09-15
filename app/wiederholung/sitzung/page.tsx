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
  notizen,
  repetitionselemente,
} from "../../../src/db/schema";
import { and, asc, eq, lte } from "drizzle-orm";
import SitzungClient, { type Karte } from "./SitzungClient";

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

  const faelligLernkarten = await db
    .select({
      kernaussageId: repetitionselemente.kernaussageId,
      naechsteFaelligkeit: repetitionselemente.naechsteFaelligkeit,
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
  const lernkartenGefiltert = faelligLernkarten.filter((k) => {
    // kernaussageId ist hier wegen des innerJoin auf kernaussagen immer
    // gesetzt — nur die Spalte selbst ist wegen des neuen notizId-Zweigs
    // (siehe Schema) jetzt allgemein nullable.
    const kernaussageId = k.kernaussageId as string;
    if (gesehen.has(kernaussageId)) return false;
    gesehen.add(kernaussageId);
    return true;
  });

  // Fällige, vom Nutzer selbst zur Wiederholung hinzugefügte Hervorhebungen
  // (repetitionselemente.notizId) — Pendenz "Notizen/Hervorhebungen
  // optional in die Wiederholung aufnehmen", 09/2026. Werden als eigener
  // Kartentyp ("hervorhebung") in dieselbe Sitzung gemischt wie die
  // klassischen Lernkarten (SitzungClient unterscheidet beim Rendern und
  // beim Speichern der Bewertung).
  const faelligHervorhebungen = await db
    .select({
      notizId: repetitionselemente.notizId,
      naechsteFaelligkeit: repetitionselemente.naechsteFaelligkeit,
      titel: buecher.titel,
      textAuszug: notizen.textAuszug,
      text: notizen.text,
    })
    .from(repetitionselemente)
    .innerJoin(notizen, eq(repetitionselemente.notizId, notizen.id))
    .innerJoin(buchinhalte, eq(notizen.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(
      and(
        eq(repetitionselemente.kontoId, konto.id),
        lte(repetitionselemente.naechsteFaelligkeit, heute),
        buchinhaltId ? eq(buchinhalte.id, buchinhaltId) : undefined
      )
    )
    .orderBy(asc(repetitionselemente.naechsteFaelligkeit));

  // Beide Kartentypen vereint, chronologisch nach Fälligkeit gemischt.
  // (naechsteFaelligkeit nur für die Sortierung mitgeführt, nicht Teil von
  // Karte selbst — SitzungClient braucht sie nicht.)
  type KarteMitDatum = Karte & { naechsteFaelligkeit: Date };
  const kartenMitDatum: KarteMitDatum[] = [
    ...lernkartenGefiltert.map((k) => ({
      typ: "lernkarte" as const,
      kernaussageId: k.kernaussageId as string,
      titel: k.titel,
      frage: k.frage,
      antwort: k.antwort,
      naechsteFaelligkeit: k.naechsteFaelligkeit,
    })),
    ...faelligHervorhebungen.map((h) => ({
      typ: "hervorhebung" as const,
      notizId: h.notizId as string,
      titel: h.titel,
      textAuszug: h.textAuszug as string,
      text: h.text,
      naechsteFaelligkeit: h.naechsteFaelligkeit,
    })),
  ].sort((a, b) => a.naechsteFaelligkeit.getTime() - b.naechsteFaelligkeit.getTime());

  if (kartenMitDatum.length === 0) redirect("/wiederholung");

  const karten: Karte[] = kartenMitDatum.map((karte) =>
    karte.typ === "lernkarte"
      ? { typ: "lernkarte", kernaussageId: karte.kernaussageId, titel: karte.titel, frage: karte.frage, antwort: karte.antwort }
      : { typ: "hervorhebung", notizId: karte.notizId, titel: karte.titel, textAuszug: karte.textAuszug, text: karte.text }
  );

  return <SitzungClient karten={karten} />;
}
