// app/wiederholung/page.tsx
//
// Erster sekundärer Screen: Liste aller fälligen Wiederholungen (über alle
// Bücher hinweg), neutrale Papierfarbe (nicht an ein Buch/eine Kategorie
// gebunden). Jede Zeile ist ein fälliges repetitionselement — Lernkarte und
// Quizfrage einer Kernaussage teilen sich einen Zeitplan (siehe Konzept),
// als Vorschau wird deshalb einheitlich die zugehörige Lernkarte gezeigt
// (nicht abwechselnd Lernkarte/Quiz wie im ursprünglichen Mockup, das keine
// echte Datenquelle dafür hatte). Zeilen und der Kreisbutton starten
// dieselbe Sitzung (/wiederholung/sitzung), die alle fälligen Karten der
// Reihe nach abfragt.

import Link from "next/link";
import { db } from "../../src/db";
import {
  buchinhalte,
  buecher,
  kernaussagen,
  konten,
  lernkarten,
  repetitionselemente,
} from "../../src/db/schema";
import { and, asc, eq, gt, lte, sql } from "drizzle-orm";
import MenuButton from "../MenuButton";
import SchliessenButton from "../SchliessenButton";

export const dynamic = "force-dynamic";

export default async function WiederholungSeite() {
  const [konto] = await db.select().from(konten).limit(1);
  const heute = new Date();

  if (!konto) {
    return (
      <main style={{ padding: 24, fontFamily: "Helvetica, Arial, sans-serif" }}>
        Kein Konto gefunden — <code>npx tsx src/db/seed.ts</code> ausführen.
      </main>
    );
  }

  const faellig = await db
    .select({
      kernaussageId: repetitionselemente.kernaussageId,
      naechsteFaelligkeit: repetitionselemente.naechsteFaelligkeit,
      buchinhaltId: buchinhalte.id,
      titel: buecher.titel,
      lernkarteFrage: lernkarten.frage,
    })
    .from(repetitionselemente)
    .innerJoin(kernaussagen, eq(repetitionselemente.kernaussageId, kernaussagen.id))
    .innerJoin(buchinhalte, eq(kernaussagen.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .leftJoin(lernkarten, eq(lernkarten.kernaussageId, kernaussagen.id))
    .where(and(eq(repetitionselemente.kontoId, konto.id), lte(repetitionselemente.naechsteFaelligkeit, heute)))
    .orderBy(asc(repetitionselemente.naechsteFaelligkeit));

  // Pro Kernaussage nur eine Zeile (falls mehrere Lernkarten existieren,
  // zählt nur die erste als Vorschau).
  const gesehen = new Set<string>();
  const zeilen = faellig.filter((z) => {
    if (gesehen.has(z.kernaussageId)) return false;
    gesehen.add(z.kernaussageId);
    return true;
  });

  const buecherAnzahl = new Set(zeilen.map((z) => z.buchinhaltId)).size;

  let naechsteFaelligkeit: Date | null = null;
  if (zeilen.length === 0) {
    const [naechste] = await db
      .select({ datum: repetitionselemente.naechsteFaelligkeit })
      .from(repetitionselemente)
      .where(and(eq(repetitionselemente.kontoId, konto.id), gt(repetitionselemente.naechsteFaelligkeit, heute)))
      .orderBy(asc(repetitionselemente.naechsteFaelligkeit))
      .limit(1);
    naechsteFaelligkeit = naechste?.datum ?? null;
  }

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
          <SchliessenButton />
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Wiederholung</span>
        </div>
      </div>
      <MenuButton />

      {/* Oberster Bereich (Header) bleibt beim Scrollen fixiert, analog den
          Buttons auf den Lese-Seiten (09/2026, Pendenz "Dropdown-Seiten:
          oberster Bereich nicht scrollbar") — nur dieser Wrapper scrollt. */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 20, overflowY: "auto" }}>
        <span
          style={{
            fontFamily: "Helvetica, Arial, sans-serif",
            fontWeight: 600,
            fontSize: 13,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: "rgba(36,35,31,.62)",
          }}
        >
          {zeilen.length} fällig{zeilen.length > 0 ? `, aus ${buecherAnzahl} Buch${buecherAnzahl === 1 ? "" : "büchern"}` : ""}
        </span>

        {zeilen.length === 0 ? (
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
              <circle cx="12" cy="12" r="9" />
              <path d="M7.5 12.5l3 3 6-6.5" />
            </svg>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 250 }}>
              <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 19 }}>Alles nachgeholt</span>
              <span style={{ fontSize: 16, lineHeight: 1.5, color: "rgba(36,35,31,.65)" }}>
                {naechsteFaelligkeit
                  ? `Keine Wiederholung fällig. Die nächste Karte wird am ${new Intl.DateTimeFormat("de-DE", {
                      day: "numeric",
                      month: "long",
                    }).format(naechsteFaelligkeit)} fällig.`
                  : "Keine Wiederholung fällig. Sobald Lernkarten erstellt sind, erscheinen hier ihre Termine."}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {zeilen.map((zeile) => (
              <Link
                key={zeile.kernaussageId}
                href="/wiederholung/sitzung"
                style={{
                  boxSizing: "border-box",
                  padding: "14px 16px",
                  borderRadius: 14,
                  background: "linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.05)), var(--paper)",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  textDecoration: "none",
                  color: "#24231F",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <rect x="4.5" y="7" width="13" height="9" rx="1.5" transform="rotate(-6 11 11.5)" />
                  <rect x="6.5" y="8.5" width="13" height="9" rx="1.5" />
                </svg>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontFamily: "Helvetica, Arial, sans-serif",
                      fontWeight: 600,
                      fontSize: 13,
                      letterSpacing: ".04em",
                      textTransform: "uppercase",
                      color: "rgba(36,35,31,.55)",
                    }}
                  >
                    {zeile.titel} · Lernkarte
                  </span>
                  <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 16 }}>
                    {zeile.lernkarteFrage ?? "—"}
                  </span>
                </div>
                <span style={{ color: "rgba(36,35,31,.5)", fontSize: 18 }}>›</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {zeilen.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
          <Link href="/wiederholung/sitzung" aria-label="Sitzung starten">
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "#24231F",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FBFAF7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.5 5.5 16 12l-6.5 6.5" />
              </svg>
            </div>
          </Link>
        </div>
      )}
    </main>
  );
}
