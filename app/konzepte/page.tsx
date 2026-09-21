// app/konzepte/page.tsx
//
// Konzept-Übersicht (09/2026, Pendenz "Vernetzung: Bücher über gemeinsame
// Konzepte verknüpfen"): alle Tags (= Konzepte, siehe lib/tags.ts) nach
// Anzahl Bücher, darunter die Buchtitel. Erreichbar über "Alle Konzepte"
// in der Bibliothek (Entscheid 21.09.2026: kein eigener Menüpunkt). Zählt
// nur Bücher im Vorrat (sichtbar), Tags ohne ein solches Buch fehlen.

import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "../../src/db";
import { buchinhalte, buecher, buchTags, tags } from "../../src/db/schema";
import MenuButton from "../MenuButton";
import ZurueckButton from "./ZurueckButton";

export const dynamic = "force-dynamic";

export default async function KonzepteSeite() {
  const zeilen = await db
    .selectDistinct({ slug: tags.slug, name: tags.name, buchId: buecher.id, titel: buecher.titel })
    .from(buchTags)
    .innerJoin(tags, eq(buchTags.tagId, tags.id))
    .innerJoin(buecher, eq(buchTags.buchId, buecher.id))
    .innerJoin(buchinhalte, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.status, "im_vorrat"))
    .orderBy(asc(buecher.titel));

  const proTag = new Map<string, { name: string; titel: string[] }>();
  for (const z of zeilen) {
    const eintrag = proTag.get(z.slug) ?? { name: z.name, titel: [] };
    if (!eintrag.titel.includes(z.titel)) eintrag.titel.push(z.titel);
    proTag.set(z.slug, eintrag);
  }
  const konzepte = [...proTag.entries()].sort(
    ([, a], [, b]) => b.titel.length - a.titel.length || a.name.localeCompare(b.name, "de")
  );
  const verbindende = konzepte.filter(([, k]) => k.titel.length >= 2);
  const einzelne = konzepte.filter(([, k]) => k.titel.length < 2);

  const zeile = (slug: string, k: { name: string; titel: string[] }) => (
    <Link
      key={slug}
      href={`/konzepte/${encodeURIComponent(slug)}`}
      style={{
        color: "inherit",
        boxSizing: "border-box",
        padding: "12px 16px",
        borderRadius: 14,
        background: "linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.05)), var(--paper)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 16.5 }}>#{k.name}</span>
        <span style={{ fontSize: 13.5, color: "rgba(36,35,31,.55)" }}>{k.titel.join(" · ")}</span>
      </span>
      <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 15, color: "rgba(36,35,31,.55)" }}>
        {k.titel.length}
      </span>
    </Link>
  );

  const abschnittTitel = {
    fontFamily: "Helvetica, Arial, sans-serif",
    fontWeight: 600,
    fontSize: 13,
    letterSpacing: ".06em",
    textTransform: "uppercase" as const,
    color: "rgba(36,35,31,.5)",
  };

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
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ZurueckButton fallback="/bookshelf" />
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Konzepte</span>
        </div>
        <MenuButton inline />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
        {konzepte.length === 0 ? (
          <span style={{ fontSize: 16, lineHeight: 1.5, color: "rgba(36,35,31,.65)" }}>
            Noch keine Konzepte — sie entstehen automatisch, sobald Bücher aufbereitet werden.
          </span>
        ) : (
          <>
            {verbindende.length > 0 && <span style={abschnittTitel}>Verbinden mehrere Bücher ({verbindende.length})</span>}
            {verbindende.map(([slug, k]) => zeile(slug, k))}
            {einzelne.length > 0 && (
              <span style={{ ...abschnittTitel, marginTop: verbindende.length ? 12 : 0 }}>Bisher ein Buch ({einzelne.length})</span>
            )}
            {einzelne.map(([slug, k]) => zeile(slug, k))}
          </>
        )}
      </div>
    </main>
  );
}
