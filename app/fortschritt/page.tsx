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
//
// Quiz-Trefferquote UND Wochen-Balken kommen jetzt aus den beiden Event-
// Log-Tabellen quizantworten/bewertungsereignisse statt aus den früheren
// Aggregat-/Zeitstempel-Feldern (09/2026, Pendenz "Event-Log für
// Bewertungen/Quiz-Antworten (Fortschritt-Fix)"): die Trefferquote zählte
// bisher nur gezeigteBuecher.quizRichtigAnzahl/quizGesamtAnzahl — ein
// Aggregat, das je Buch nur EINMAL (beim ersten Abschluss-Besuch) gesetzt
// wurde und wiederholte Quiz-Durchläufe nicht erfasste; die Wochen-Balken
// zählten repetitionselemente.aktualisiertAm, das pro Karte nur den
// LETZTEN Bewertungszeitpunkt trägt und eine mehrfach in derselben Woche
// bewertete Karte deshalb untererfasste. Beide Event-Log-Tabellen
// protokollieren stattdessen JEDE einzelne Antwort/Bewertung als eigene,
// unveränderliche Zeile (siehe app/quiz/[id]/actions.ts und
// app/lernkarten/[id]/actions.ts).

import { db } from "../../src/db";
import {
  bewertungsereignisse,
  buchinhalte,
  buecher,
  gezeigteBuecher,
  konten,
  quizantworten,
} from "../../src/db/schema";
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

  const quizAntwortenZeilen = await db
    .select({ richtig: quizantworten.richtig })
    .from(quizantworten)
    .where(eq(quizantworten.kontoId, konto.id));

  const quizGesamtSumme = quizAntwortenZeilen.length;
  const quizRichtigSumme = quizAntwortenZeilen.filter((z) => z.richtig).length;
  const quizTrefferquote =
    quizGesamtSumme > 0 ? `${Math.round((quizRichtigSumme / quizGesamtSumme) * 100)}%` : "–";

  const montag = montagDieserWoche(heute);
  const naechsterMontag = new Date(montag);
  naechsterMontag.setDate(montag.getDate() + 7);

  const bewertungenDieseWoche = await db
    .select({ zeitpunkt: bewertungsereignisse.erstelltAm })
    .from(bewertungsereignisse)
    .where(
      and(
        eq(bewertungsereignisse.kontoId, konto.id),
        gte(bewertungsereignisse.erstelltAm, montag),
        lt(bewertungsereignisse.erstelltAm, naechsterMontag)
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
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Fortschritt</span>
        </div>
      </div>
      <MenuButton />

      {/* Oberster Bereich (Header) bleibt beim Scrollen fixiert, analog den
          Buttons auf den Lese-Seiten (09/2026, Pendenz "Dropdown-Seiten:
          oberster Bereich nicht scrollbar") — nur dieser Wrapper scrollt. */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 24, overflowY: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 36 }}>{streak} Tage</span>
          <span style={{ fontSize: 15.5, color: "rgba(36,35,31,.65)" }}>Streak — dein bisher längster Lauf</span>
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
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 19 }}>{buecherGelesen.length}</span>
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 13, color: "rgba(36,35,31,.65)" }}>
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
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 19 }}>{quizTrefferquote}</span>
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 13, color: "rgba(36,35,31,.65)" }}>
              Quiz-Trefferquote
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span
            style={{
              fontFamily: "Helvetica, Arial, sans-serif",
              fontWeight: 700,
              fontSize: 14,
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
              <span key={tag} style={{ width: 24, textAlign: "center", fontFamily: "Helvetica, Arial, sans-serif", fontSize: 12.5, color: "rgba(36,35,31,.6)" }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
