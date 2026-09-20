// app/wiederholung/page.tsx
//
// Erster sekundärer Screen: Liste aller fälligen Wiederholungen, neutrale
// Papierfarbe (nicht an ein Buch/eine Kategorie gebunden).
//
// 09/2026, Nutzer-Feedback: pro Buch nur EINE Zeile statt einer Zeile pro
// fälliger Lernkarte (bei mehreren fälligen Karten eines Buchs wirkte die
// Liste überladen/redundant, da eh dieselbe Buchzeile mehrfach erschien).
// Jede Zeile zeigt jetzt Buchtitel + Anzahl fälliger Karten dieses Buchs
// und startet eine auf dieses Buch beschränkte Sitzung
// (/wiederholung/sitzung?buchinhaltId=...). Der runde Button unten bleibt
// die bücherübergreifende Sitzung über alle fälligen Karten hinweg.

import Link from "next/link";
import { db } from "../../src/db";
import {
  buchinhalte,
  buecher,
  kernaussagen,
  konten,
  notizen,
  repetitionselemente,
} from "../../src/db/schema";
import { and, asc, eq, gt, lte } from "drizzle-orm";
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

  // Eine repetitionselemente-Zeile verweist eindeutig auf genau eine
  // Kernaussage (kein Fan-out mehr wie zu Lernkarten-Zeiten, kein Dedup
  // nötig).
  const kernaussagenZeilen = await db
    .select({
      kernaussageId: repetitionselemente.kernaussageId,
      naechsteFaelligkeit: repetitionselemente.naechsteFaelligkeit,
      buchinhaltId: buchinhalte.id,
      titel: buecher.titel,
    })
    .from(repetitionselemente)
    .innerJoin(kernaussagen, eq(repetitionselemente.kernaussageId, kernaussagen.id))
    .innerJoin(buchinhalte, eq(kernaussagen.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(and(eq(repetitionselemente.kontoId, konto.id), lte(repetitionselemente.naechsteFaelligkeit, heute)))
    .orderBy(asc(repetitionselemente.naechsteFaelligkeit));

  // Fällige, vom Nutzer selbst zur Wiederholung hinzugefügte Hervorhebungen
  // (repetitionselemente.notizId statt .kernaussageId) — Pendenz "Notizen/
  // Hervorhebungen optional in die Wiederholung aufnehmen", 09/2026. Kein
  // Dedup-Schritt nötig: pro notizId existiert höchstens eine
  // repetitionselemente-Zeile (siehe wiederholungHinzufuegen), also kein
  // Fan-out wie bei mehreren Lernkarten pro Kernaussage.
  const hervorhebungenZeilen = await db
    .select({
      notizId: repetitionselemente.notizId,
      naechsteFaelligkeit: repetitionselemente.naechsteFaelligkeit,
      buchinhaltId: buchinhalte.id,
      titel: buecher.titel,
    })
    .from(repetitionselemente)
    .innerJoin(notizen, eq(repetitionselemente.notizId, notizen.id))
    .innerJoin(buchinhalte, eq(notizen.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(and(eq(repetitionselemente.kontoId, konto.id), lte(repetitionselemente.naechsteFaelligkeit, heute)))
    .orderBy(asc(repetitionselemente.naechsteFaelligkeit));

  // Beide Quellen vereint, chronologisch nach Fälligkeit — "zeilen" zählt
  // jetzt fällige Kernaussagen UND fällige Hervorhebungen zusammen.
  const zeilen = [...kernaussagenZeilen, ...hervorhebungenZeilen].sort(
    (a, b) => a.naechsteFaelligkeit.getTime() - b.naechsteFaelligkeit.getTime()
  );

  // Pro Buch gruppieren — eine Zeile je Buch statt je Karte. Reihenfolge
  // bleibt die der ersten fälligen Karte des Buchs (zeilen ist bereits
  // nach naechsteFaelligkeit sortiert), damit das dringendste Buch oben
  // steht.
  type BuchGruppe = { buchinhaltId: string; titel: string; anzahl: number };
  const buchGruppen: BuchGruppe[] = [];
  const buchGruppenIndex = new Map<string, number>();
  for (const zeile of zeilen) {
    const index = buchGruppenIndex.get(zeile.buchinhaltId);
    if (index === undefined) {
      buchGruppenIndex.set(zeile.buchinhaltId, buchGruppen.length);
      buchGruppen.push({ buchinhaltId: zeile.buchinhaltId, titel: zeile.titel, anzahl: 1 });
    } else {
      buchGruppen[index].anzahl++;
    }
  }

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
          {zeilen.length} fällig{buchGruppen.length > 0 ? `, aus ${buchGruppen.length} Buch${buchGruppen.length === 1 ? "" : "büchern"}` : ""}
        </span>

        {buchGruppen.length === 0 ? (
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
                  : "Keine Wiederholung fällig. Sobald eine Quizfrage beantwortet oder eine Hervorhebung zur Wiederholung hinzugefügt wurde, erscheinen hier ihre Termine."}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {buchGruppen.map((gruppe) => (
              <Link
                key={gruppe.buchinhaltId}
                href={`/wiederholung/sitzung?buchinhaltId=${gruppe.buchinhaltId}`}
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
                    {gruppe.anzahl} Karte{gruppe.anzahl === 1 ? "" : "n"} fällig
                  </span>
                  <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 16 }}>
                    {gruppe.titel}
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
          <Link href="/wiederholung/sitzung" aria-label="Alle Bücher jetzt üben">
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
