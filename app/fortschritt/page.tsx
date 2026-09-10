// app/fortschritt/page.tsx
//
// Vierter sekundärer Screen: reine Statistik-Ansicht, kein Aktionsbutton.
// Streak = längste je erreichte Tage-Folge (src/lib/streak.ts, nicht die
// aktuelle wie auf Home/Abschluss). "Bücher gelesen" = Anzahl
// gezeigteBuecher-Zeilen dieses Kontos mit gesetztem abgeschlossenAm (siehe
// app/abschluss/[id]/page.tsx) — NICHT mehr wie zuvor "datumGezeigt !=
// heute" (Bug, 09/2026): seit Bookshelf können an einem Tag mehrere Bücher
// geöffnet/abgeschlossen werden (gepinntes Buch + beliebig viele
// "Bereit"-Bücher), weshalb diese Bedingung alle heute abgeschlossenen
// Bücher fälschlich NICHT mitzählte — und umgekehrt ein an einem früheren
// Tag nur GEZEIGTES, aber nie fertig gelesenes Buch fälschlich MITZÄHLTE.
// Quiz-Trefferquote summiert gezeigteBuecher.quizRichtigAnzahl/
// quizGesamtAnzahl über alle Bücher dieses Kontos (siehe
// app/abschluss/[id]/page.tsx, wo beide einmalig pro Buch gesetzt werden) —
// "–" nur, solange noch kein einziges Quiz abgeschlossen wurde.
// Wochen-Balken zählt repetitionselemente.aktualisiertAm pro Wochentag
// dieser Woche — da nur der letzte Bewertungszeitpunkt gespeichert wird
// (keine Historie), unterzählt das, wenn eine Karte mehrfach in derselben
// Woche bewertet wird.

import { db } from "../../src/db";
import { buchinhalte, buecher, gezeigteBuecher, konten, repetitionselemente } from "../../src/db/schema";
import { and, eq, gte, isNotNull, lt } from "drizzle-orm";
import { laengsterStreak } from "../../src/lib/streak";
import MenuButton from "../MenuButton";
import SchliessenButton from "../SchliessenButton";

export const dynamic = "force-dynamic";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function montagDieserWoche(heute: Date): Date {
  const tag = heute.getDay();
  const differenz = tag === 0 ? -6 : 1 - tag;
  const montag = new Date(heute);
  montag.setDate(heute.getDate() + differenz);
  montag.setHours(0, 0, 0, 0);
  return montag;
}

export default async function FortschrittSeite() {
  const [konto] = await db.select().from(konten).limit(1);

  if (!konto) {
    return (
      <main style={{ padding: 24, fontFamily: "Helvetica, Arial, sans-serif" }}>
        Kein Konto gefunden — <code>npx tsx src/db/seed.ts</code> ausführen.
      </main>
    );
  }

  const heute = new Date();

  const gezeigteDaten = await db
    .select({ datum: gezeigteBuecher.datumGezeigt })
    .from(gezeigteBuecher)
    .where(eq(gezeigteBuecher.kontoId, konto.id));

  const streak = laengsterStreak(gezeigteDaten.map((d) => d.datum));

  const buecherGelesen = await db
    .select({ id: gezeigteBuecher.id })
    .from(gezeigteBuecher)
    .innerJoin(buchinhalte, eq(gezeigteBuecher.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(and(eq(gezeigteBuecher.kontoId, konto.id), isNotNull(gezeigteBuecher.abgeschlossenAm)));

  const quizErgebnisse = await db
    .select({ richtig: gezeigteBuecher.quizRichtigAnzahl, gesamt: gezeigteBuecher.quizGesamtAnzahl })
    .from(gezeigteBuecher)
    .where(eq(gezeigteBuecher.kontoId, konto.id));

  const quizGesamtSumme = quizErgebnisse.reduce((summe, e) => summe + (e.gesamt ?? 0), 0);
  const quizRichtigSumme = quizErgebnisse.reduce((summe, e) => summe + (e.richtig ?? 0), 0);
  const quizTrefferquote =
    quizGesamtSumme > 0 ? `${Math.round((quizRichtigSumme / quizGesamtSumme) * 100)}%` : "–";

  const montag = montagDieserWoche(heute);
  const naechsterMontag = new Date(montag);
  naechsterMontag.setDate(montag.getDate() + 7);

  const bewertungenDieseWoche = await db
    .select({ zeitpunkt: repetitionselemente.aktualisiertAm })
    .from(repetitionselemente)
    .where(
      and(
        eq(repetitionselemente.kontoId, konto.id),
        gte(repetitionselemente.aktualisiertAm, montag),
        lt(repetitionselemente.aktualisiertAm, naechsterMontag)
      )
    );

  const zaehlerProTag = new Array(7).fill(0);
  for (const { zeitpunkt } of bewertungenDieseWoche) {
    const differenzTage = Math.floor((zeitpunkt.getTime() - montag.getTime()) / 86400000);
    if (differenzTage >= 0 && differenzTage < 7) zaehlerProTag[differenzTage]++;
  }
  const maxProTag = Math.max(1, ...zaehlerProTag);
  const heuteIndex = Math.floor((heute.getTime() - montag.getTime()) / 86400000);

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
        gap: 24,
        color: "var(--ink)",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SchliessenButton />
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 20 }}>Fortschritt</span>
        </div>
      </div>
      <MenuButton />

      {/* Oberster Bereich (Header) bleibt beim Scrollen fixiert, analog den
          Buttons auf den Lese-Seiten (09/2026, Pendenz "Dropdown-Seiten:
          oberster Bereich nicht scrollbar") — nur dieser Wrapper scrollt. */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 24, overflowY: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 34 }}>{streak} Tage</span>
          <span style={{ fontSize: 13.5, color: "rgba(36,35,31,.65)" }}>Streak — dein bisher längster Lauf</span>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div
            style={{
              flex: 1,
              boxSizing: "border-box",
              padding: "12px 14px",
              borderRadius: 14,
              background: "linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.05)), var(--paper)",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17 }}>{buecherGelesen.length}</span>
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 11, color: "rgba(36,35,31,.65)" }}>
              Bücher gelesen
            </span>
          </div>
          <div
            style={{
              flex: 1,
              boxSizing: "border-box",
              padding: "12px 14px",
              borderRadius: 14,
              background: "linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.05)), var(--paper)",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17 }}>{quizTrefferquote}</span>
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 11, color: "rgba(36,35,31,.65)" }}>
              Quiz-Trefferquote
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span
            style={{
              fontFamily: "Helvetica, Arial, sans-serif",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "rgba(36,35,31,.6)",
            }}
          >
            Diese Woche · Wiederholungen
          </span>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 110, borderBottom: "1.5px solid #24231F" }}>
            {zaehlerProTag.map((anzahl, i) => {
              const istZukunft = i > heuteIndex;
              if (istZukunft) {
                return (
                  <div
                    key={i}
                    style={{
                      width: 24,
                      height: 14,
                      background: "none",
                      border: "1.5px solid #24231F",
                      borderRadius: "4px 4px 0 0",
                      boxSizing: "border-box",
                    }}
                  />
                );
              }
              const hoehe = anzahl === 0 ? 6 : Math.max(20, Math.round((anzahl / maxProTag) * 100));
              return <div key={i} style={{ width: 24, height: hoehe, background: "#24231F", borderRadius: "4px 4px 0 0" }} />;
            })}
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {WOCHENTAGE.map((tag) => (
              <span key={tag} style={{ width: 24, textAlign: "center", fontFamily: "Helvetica, Arial, sans-serif", fontSize: 10.5, color: "rgba(36,35,31,.6)" }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
