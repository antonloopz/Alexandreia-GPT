// app/lernkarten/[id]/page.tsx
//
// Server Component: lädt Buch + alle Lernkarten (über kernaussagen verknüpft,
// in Kernaussagen-Reihenfolge), übergibt an die client-seitige
// Schritt-für-Schritt-Ansicht (LernkartenClient).

import { notFound } from "next/navigation";
import { db } from "../../../src/db";
import { buchinhalte, buecher, kernaussagen, lernkarten } from "../../../src/db/schema";
import { eq, asc } from "drizzle-orm";
import { KATEGORIE_FARBE, KATEGORIE_LABEL } from "../../../src/lib/kategorien";
import LernkartenClient from "./LernkartenClient";

export const dynamic = "force-dynamic";

export default async function LernkartenSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [buch] = await db
    .select({ titel: buecher.titel, kategorie: buecher.kategorie })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.id, id));

  if (!buch) notFound();

  const liste = await db
    .select({
      id: lernkarten.id,
      kernaussageId: lernkarten.kernaussageId,
      frage: lernkarten.frage,
      antwort: lernkarten.antwort,
    })
    .from(lernkarten)
    .innerJoin(kernaussagen, eq(lernkarten.kernaussageId, kernaussagen.id))
    .where(eq(kernaussagen.buchinhaltId, id))
    .orderBy(asc(kernaussagen.reihenfolge));

  if (liste.length === 0) notFound();

  return (
    <LernkartenClient
      buchinhaltId={id}
      titel={buch.titel}
      akzent={KATEGORIE_FARBE[buch.kategorie] ?? "var(--paper)"}
      kategorieLabel={KATEGORIE_LABEL[buch.kategorie] ?? buch.kategorie}
      lernkarten={liste}
    />
  );
}
