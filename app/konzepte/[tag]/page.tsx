// app/konzepte/[tag]/page.tsx
//
// Konzept-Seite (09/2026, Pendenz "Vernetzung: Bücher über gemeinsame
// Konzepte verknüpfen"): ein Tag als Konzept — die Bücher, die es
// behandeln, die Kernaussagen dazu aus ALLEN diesen Büchern nebeneinander
// (nach Buch gruppiert, mit Wissensstatus — die Aussagen bleiben dem
// jeweiligen Autor zugeschrieben, siehe CLAUDE.md "Inhaltliches
// Grundprinzip") und verwandte Konzepte (Tags, die auf denselben Büchern
// vorkommen). Nur Bücher im Vorrat (sichtbar).
//
// [tag] ist der slug. Ein alter slug, der inzwischen per Konsolidierung
// (src/scripts/tags-konsolidieren.ts) als Alias bei einem anderen Tag
// liegt, leitet auf dessen Seite weiter — Links bleiben so gültig.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../../../src/db";
import {
  buchinhalte,
  buecher,
  buchTags,
  kernaussagen,
  kernaussageTags,
  konten,
  tags,
  type WissensstatusWert,
} from "../../../src/db/schema";
import { KATEGORIE_FARBE, kategorieChipStyle } from "../../../src/lib/kategorien";
import MenuButton from "../../MenuButton";
import ZurueckButton from "../ZurueckButton";
import { LESETEXT_KLEINER, leseVariablen } from "../../../src/lib/lesemodus";
import { ladeLesemodus } from "../../../src/lib/lesemodus-laden";

export const dynamic = "force-dynamic";

const WISSENSSTATUS_LABEL: Record<WissensstatusWert, string> = {
  belegt: "Belegt",
  umstritten: "Umstritten",
  ueberholt: "Überholt",
  unklar: "Forschungslage unklar",
};

const ABSCHNITT_TITEL = {
  fontFamily: "Helvetica, Arial, sans-serif",
  fontWeight: 600,
  fontSize: 13,
  letterSpacing: ".06em",
  textTransform: "uppercase" as const,
  color: "rgba(36,35,31,.5)",
};

const KARTE = {
  boxSizing: "border-box" as const,
  padding: "12px 16px",
  borderRadius: 14,
  background: "linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.05)), var(--paper)",
};

export default async function KonzeptSeite({ params }: { params: Promise<{ tag: string }> }) {
  const { tag: tagRoh } = await params;
  const tagSlug = decodeURIComponent(tagRoh);

  let [tag] = await db.select({ id: tags.id, name: tags.name, slug: tags.slug }).from(tags).where(eq(tags.slug, tagSlug));
  if (!tag) {
    [tag] = await db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(tags)
      .where(sql`${tags.aliase} @> ${JSON.stringify([tagSlug])}::jsonb`);
    if (tag) redirect(`/konzepte/${encodeURIComponent(tag.slug)}`);
    notFound();
  }

  const buecherZeilen = await db
    .selectDistinct({
      buchId: buecher.id,
      buchinhaltId: buchinhalte.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
    })
    .from(buchTags)
    .innerJoin(buecher, eq(buchTags.buchId, buecher.id))
    .innerJoin(buchinhalte, and(eq(buchinhalte.buchId, buecher.id), eq(buchinhalte.status, "im_vorrat")))
    .where(eq(buchTags.tagId, tag.id))
    .orderBy(asc(buecher.titel));

  const aussagen = await db
    .select({
      id: kernaussagen.id,
      text: kernaussagen.text,
      erklaerung: kernaussagen.erklaerung,
      wissensstatus: kernaussagen.wissensstatus,
      reihenfolge: kernaussagen.reihenfolge,
      buchinhaltId: buchinhalte.id,
    })
    .from(kernaussageTags)
    .innerJoin(kernaussagen, eq(kernaussageTags.kernaussageId, kernaussagen.id))
    .innerJoin(buchinhalte, and(eq(kernaussagen.buchinhaltId, buchinhalte.id), eq(buchinhalte.status, "im_vorrat")))
    .where(eq(kernaussageTags.tagId, tag.id))
    .orderBy(asc(kernaussagen.reihenfolge));

  const buchIds = buecherZeilen.map((b) => b.buchId);
  const verwandteZeilen = buchIds.length
    ? await db
        .select({ slug: tags.slug, name: tags.name, buchId: buchTags.buchId })
        .from(buchTags)
        .innerJoin(tags, eq(buchTags.tagId, tags.id))
        .where(and(inArray(buchTags.buchId, buchIds), ne(buchTags.tagId, tag.id)))
    : [];
  const verwandtZaehler = new Map<string, { name: string; anzahl: number }>();
  for (const z of verwandteZeilen) {
    const e = verwandtZaehler.get(z.slug) ?? { name: z.name, anzahl: 0 };
    e.anzahl++;
    verwandtZaehler.set(z.slug, e);
  }
  const verwandteKonzepte = [...verwandtZaehler.entries()]
    .sort(([, a], [, b]) => b.anzahl - a.anzahl || a.name.localeCompare(b.name, "de"))
    .slice(0, 10);

  const [konto] = await db.select({ id: konten.id }).from(konten).limit(1);
  const lesemodus = await ladeLesemodus(konto?.id);

  // Kernaussagen nach Buch gruppiert, in der Reihenfolge der Bücherliste.
  const gruppen = buecherZeilen
    .map((b) => ({ buch: b, aussagen: aussagen.filter((a) => a.buchinhaltId === b.buchinhaltId) }))
    .filter((g) => g.aussagen.length > 0);

  return (
    <main
      style={{
        width: "100%",
        height: "calc(100dvh - env(safe-area-inset-top, 0px))",
        boxSizing: "border-box",
        padding: 16,
        background: "var(--paper)",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        color: "var(--ink)",
        overflow: "hidden",
        ...leseVariablen(lesemodus),
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ZurueckButton fallback="/konzepte" />
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Konzept</span>
        </div>
        <MenuButton inline />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 22, overflowY: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 28, lineHeight: 1.15 }}>
            #{tag.name}
          </span>
          <span style={{ fontSize: 15, color: "rgba(36,35,31,.6)" }}>
            {buecherZeilen.length === 1 ? "1 Buch" : `${buecherZeilen.length} Bücher`} ·{" "}
            {aussagen.length === 1 ? "1 Kernaussage" : `${aussagen.length} Kernaussagen`}
          </span>
        </div>

        {buecherZeilen.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={ABSCHNITT_TITEL}>Bücher</span>
            {buecherZeilen.map((b) => (
              <Link key={b.buchinhaltId} href={`/lesen/${b.buchinhaltId}`} style={{ ...KARTE, color: "inherit", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: KATEGORIE_FARBE[b.kategorie] ?? "#ccc", flexShrink: 0 }} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 16 }}>{b.titel}</span>
                  <span style={{ fontSize: 14, color: "rgba(36,35,31,.65)" }}>{b.autor}</span>
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M9.5 5.5 16 12l-6.5 6.5" />
                </svg>
              </Link>
            ))}
          </div>
        )}

        {gruppen.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <span style={ABSCHNITT_TITEL}>Kernaussagen dazu</span>
            {gruppen.map(({ buch, aussagen: liste }) => (
              <div key={buch.buchinhaltId} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Link href={`/kernaussagen/${buch.buchinhaltId}`} style={{ color: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: KATEGORIE_FARBE[buch.kategorie] ?? "#ccc", flexShrink: 0 }} />
                  <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 15 }}>
                    {buch.autor} — {buch.titel}
                  </span>
                </Link>
                {liste.map((a) => (
                  <div key={a.id} style={{ ...KARTE, display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: "calc(var(--lese-groesse, 17px) - 1px)", lineHeight: 1.35 }}>{a.text}</span>
                    <span style={{ ...LESETEXT_KLEINER, color: "rgba(36,35,31,.8)" }}>{a.erklaerung}</span>
                    {a.wissensstatus && (
                      <span style={{ fontSize: 13.5, color: "rgba(36,35,31,.6)" }}>
                        Forschung heute: <strong>{WISSENSSTATUS_LABEL[a.wissensstatus.status] ?? a.wissensstatus.status}</strong>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {verwandteKonzepte.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={ABSCHNITT_TITEL}>Verwandte Konzepte</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {verwandteKonzepte.map(([slug, k]) => (
                <Link key={slug} href={`/konzepte/${encodeURIComponent(slug)}`}>
                  <span style={kategorieChipStyle(false)}>
                    <span>#{k.name}</span>
                    <span style={{ opacity: 0.6, fontWeight: 700 }}>{k.anzahl}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <Link href="/konzepte" style={{ fontSize: 15, fontWeight: 600, color: "#24231F" }}>
          Alle Konzepte →
        </Link>
      </div>
    </main>
  );
}
