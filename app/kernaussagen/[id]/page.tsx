// app/kernaussagen/[id]/page.tsx
//
// Server Component: lädt Buch + alle Kernaussagen, übergibt an die
// client-seitige Schritt-für-Schritt-Ansicht (KernaussagenClient).

import { notFound } from "next/navigation";
import { db } from "../../../src/db";
import { buchinhalte, buecher, kernaussagen, konten, notizen, repetitionselemente } from "../../../src/db/schema";
import { and, eq, asc, isNotNull } from "drizzle-orm";
import { KATEGORIE_FARBE, KATEGORIE_LABEL, KERNAUSSAGEN_LABEL } from "../../../src/lib/kategorien";
import KernaussagenClient from "./KernaussagenClient";

export const dynamic = "force-dynamic";

export default async function KernaussagenSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [buch] = await db
    .select({ titel: buecher.titel, kategorie: buecher.kategorie })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.id, id));

  if (!buch) notFound();

  const liste = await db
    .select({
      id: kernaussagen.id,
      text: kernaussagen.text,
      erklaerung: kernaussagen.erklaerung,
      beispiel: kernaussagen.beispiel,
      wissensstatus: kernaussagen.wissensstatus,
    })
    .from(kernaussagen)
    .where(eq(kernaussagen.buchinhaltId, id))
    .orderBy(asc(kernaussagen.reihenfolge));

  if (liste.length === 0) notFound();

  // Bestehende Hervorhebungen auf DIESEM Screen (09/2026, Pendenz
  // "Hervorhebungen auch auf Kernaussagen erlauben") — analog zum
  // Lesen-Screen (app/lesen/[id]/page.tsx), hier aber zusätzlich mit
  // kernaussageId, da mehrere Kernaussagen sich sonst über dasselbe feld
  // nicht unterscheiden liessen.
  const [konto] = await db.select().from(konten).limit(1);
  const hervorhebungenZeilen = konto
    ? await db
        .select({
          id: notizen.id,
          kernaussageId: notizen.kernaussageId,
          feld: notizen.feld,
          textAuszug: notizen.textAuszug,
          text: notizen.text,
        })
        .from(notizen)
        .where(and(eq(notizen.buchinhaltId, id), eq(notizen.kontoId, konto.id)))
    : [];

  // Welche dieser Hervorhebungen bereits zur Wiederholung hinzugefügt sind
  // (gleiches Muster wie app/lesen/[id]/page.tsx).
  const wiederholteZeilen = konto
    ? await db
        .select({ notizId: repetitionselemente.notizId })
        .from(repetitionselemente)
        .where(and(eq(repetitionselemente.kontoId, konto.id), isNotNull(repetitionselemente.notizId)))
    : [];
  const wiederholtSet = new Set(wiederholteZeilen.map((w) => w.notizId));

  const hervorhebungen = hervorhebungenZeilen.map((h) => ({
    id: h.id,
    kernaussageId: h.kernaussageId,
    feld: h.feld,
    textAuszug: h.textAuszug,
    text: h.text,
    inWiederholung: wiederholtSet.has(h.id),
  }));

  return (
    <KernaussagenClient
      buchinhaltId={id}
      titel={buch.titel}
      akzent={KATEGORIE_FARBE[buch.kategorie] ?? "var(--paper)"}
      kategorieLabel={KATEGORIE_LABEL[buch.kategorie] ?? buch.kategorie}
      kernaussagenLabel={KERNAUSSAGEN_LABEL[buch.kategorie] ?? { einzeln: "Kernaussage", mehrzahl: "Kernaussagen" }}
      kernaussagen={liste}
      hervorhebungen={hervorhebungen}
    />
  );
}
