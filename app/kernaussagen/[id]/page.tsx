// app/kernaussagen/[id]/page.tsx
//
// Server Component: lädt Buch + alle Kernaussagen, übergibt an die
// client-seitige Schritt-für-Schritt-Ansicht (KernaussagenClient).

import { notFound } from "next/navigation";
import { db } from "../../../src/db";
import { buchinhalte, buecher, kernaussagen } from "../../../src/db/schema";
import { eq, asc } from "drizzle-orm";
import { KATEGORIE_FARBE, KATEGORIE_LABEL } from "../../../src/lib/kategorien";
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
    .select({ text: kernaussagen.text, erklaerung: kernaussagen.erklaerung })
    .from(kernaussagen)
    .where(eq(kernaussagen.buchinhaltId, id))
    .orderBy(asc(kernaussagen.reihenfolge));

  if (liste.length === 0) notFound();

  return (
    <KernaussagenClient
      buchinhaltId={id}
      titel={buch.titel}
      akzent={KATEGORIE_FARBE[buch.kategorie] ?? "var(--paper)"}
      kategorieLabel={KATEGORIE_LABEL[buch.kategorie] ?? buch.kategorie}
      kernaussagen={liste}
    />
  );
}
