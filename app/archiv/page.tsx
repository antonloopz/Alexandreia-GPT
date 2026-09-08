// app/archiv/page.tsx
//
// Dritter sekundärer Screen: reine Browse-Liste, kein Aktionsbutton (wie im
// Mockup). "Gelesen" = jedes Buch, das schon einmal als gezeigteBuecher-
// Zeile für dieses Konto angelegt wurde — ausser dem heutigen (das läuft
// noch/ist nicht "abgeschlossen", erscheint stattdessen oben in der
// Bücherliste). Sortiert nach Anzeigedatum absteigend, neuestes zuerst.

import Link from "next/link";
import { db } from "../../src/db";
import { buchinhalte, buecher, gezeigteBuecher, konten } from "../../src/db/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import { KATEGORIE_FARBE } from "../../src/lib/kategorien";
import MenuButton from "../MenuButton";

export const dynamic = "force-dynamic";

export default async function ArchivSeite() {
  const [konto] = await db.select().from(konten).limit(1);

  if (!konto) {
    return (
      <main style={{ padding: 24, fontFamily: "Helvetica, Arial, sans-serif" }}>
        Kein Konto gefunden — <code>npx tsx src/db/seed.ts</code> ausführen.
      </main>
    );
  }

  const heute = new Date();

  const eintraege = await db
    .select({
      id: gezeigteBuecher.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
      datumGezeigt: gezeigteBuecher.datumGezeigt,
    })
    .from(gezeigteBuecher)
    .innerJoin(buchinhalte, eq(gezeigteBuecher.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(and(eq(gezeigteBuecher.kontoId, konto.id), ne(gezeigteBuecher.datumGezeigt, heute)))
    .orderBy(desc(gezeigteBuecher.datumGezeigt));

  return (
    <main
      style={{
        width: "100%",
        minHeight: "100dvh",
        boxSizing: "border-box",
        padding: 16,
        background: "var(--paper)",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        color: "var(--ink)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" aria-label="Schliessen">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </Link>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 20 }}>Archiv</span>
        </div>
        <MenuButton />
      </div>

      <span
        style={{
          fontFamily: "Helvetica, Arial, sans-serif",
          fontWeight: 600,
          fontSize: 11,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "rgba(36,35,31,.62)",
        }}
      >
        {eintraege.length === 1 ? "1 gelesenes Buch" : `${eintraege.length} gelesene Bücher`}
      </span>

      {eintraege.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            textAlign: "center",
          }}
        >
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
            <rect x="4.5" y="8.5" width="15" height="11" rx="1.5" />
            <path d="M4.5 8.5V6a1.5 1.5 0 0 1 1.5-1.5h12A1.5 1.5 0 0 1 19.5 6v2.5" />
            <line x1="10" y1="13" x2="14" y2="13" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 250 }}>
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17 }}>Noch nichts gelesen</span>
            <span style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(36,35,31,.65)" }}>
              Dein erstes abgeschlossenes Buch erscheint hier.
            </span>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
          {eintraege.map((zeile) => (
            <div
              key={zeile.id}
              style={{
                boxSizing: "border-box",
                padding: "14px 16px",
                borderRadius: 14,
                background: "linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.05)), var(--paper)",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: KATEGORIE_FARBE[zeile.kategorie] ?? "#ccc",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 6.5c-1.8-1.3-4.2-1.8-6.5-1.3v11c2.3-.5 4.7 0 6.5 1.3 1.8-1.3 4.2-1.8 6.5-1.3v-11c-2.3-.5-4.7 0-6.5 1.3Z" />
                  <path d="M12 6.5v11" />
                </svg>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 15 }}>{zeile.titel}</span>
                <span style={{ fontSize: 12.5, color: "rgba(36,35,31,.65)" }}>
                  {zeile.autor} · gelesen{" "}
                  {new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" }).format(zeile.datumGezeigt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
