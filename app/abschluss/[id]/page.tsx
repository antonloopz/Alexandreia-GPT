// app/abschluss/[id]/page.tsx
//
// Server Component: Abschluss-Screen nach Zusammenfassung, Kernaussagen
// und Quiz. Quiz-Ergebnis kommt als Query-Parameter (?richtig=N) von
// QuizClient und wird hier — zusammen mit abgeschlossenAm — einmalig in
// gezeigteBuecher.quizRichtigAnzahl/quizGesamtAnzahl geschrieben, damit
// Fortschritt daraus die Quiz-Trefferquote berechnen kann. "Wiederholungen
// geplant" ist eine echte Zählung der repetitionselemente-Zeilen, die die
// Quiz-Bewertung gerade angelegt hat (09/2026: vorher die separate
// Lernkarten-Bewertung, inzwischen entfernt — siehe
// app/quiz/[id]/actions.ts). "N Tage Streak" nutzt jetzt dieselbe echte
// Streak-Berechnung wie Home (src/lib/streak.ts).

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "../../../src/db";
import {
  buchinhalte,
  buecher,
  gezeigteBuecher,
  kernaussagen,
  konten,
  quizfragen,
  repetitionselemente,
} from "../../../src/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { KATEGORIE_FARBE, KATEGORIE_LABEL } from "../../../src/lib/kategorien";
import { aktuellerStreak } from "../../../src/lib/streak";
import MenuButton from "../../MenuButton";
import BuchBewertungAuswahl from "./BuchBewertung";

export const dynamic = "force-dynamic";

export default async function AbschlussSeite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ richtig?: string }>;
}) {
  const { id } = await params;
  const { richtig } = await searchParams;

  const [buch] = await db
    .select({ titel: buecher.titel, kategorie: buecher.kategorie, bleibtHaengen: buchinhalte.bleibtHaengen })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.id, id));

  if (!buch) notFound();

  const [konto] = await db.select().from(konten).limit(1);

  // Bereits gespeichertes Ergebnis dieser Zeile — Grundlage für den
  // Anzeige-Fallback unten (Bug 09/2026: bisher wurde bei einem Besuch
  // OHNE frischen ?richtig=-Parameter, z.B. Direktlink oder erneuter
  // Aufruf nach bereits abgeschlossenem Quiz, immer "0 von N" angezeigt,
  // obwohl das echte Ergebnis längst gespeichert war).
  const [bestehendeZeile] = konto
    ? await db
        .select({
          abgeschlossenAm: gezeigteBuecher.abgeschlossenAm,
          quizRichtigAnzahl: gezeigteBuecher.quizRichtigAnzahl,
          // Buch-Feedback (09/2026, Buch-Bewertung Phase 1) — Startwerte für
          // BuchBewertung.tsx unten, damit ein erneuter Besuch die
          // bisherige Bewertung zeigt und ändern lässt.
          buchBewertung: gezeigteBuecher.buchBewertung,
          imOriginalLesen: gezeigteBuecher.imOriginalLesen,
          aufbereitungSchwach: gezeigteBuecher.aufbereitungSchwach,
        })
        .from(gezeigteBuecher)
        .where(and(eq(gezeigteBuecher.kontoId, konto.id), eq(gezeigteBuecher.buchinhaltId, id)))
    : [];

  const [{ n: kernaussagenAnzahl }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(kernaussagen)
    .where(eq(kernaussagen.buchinhaltId, id));

  const [{ n: quizfragenAnzahl }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(quizfragen)
    .innerJoin(kernaussagen, eq(quizfragen.kernaussageId, kernaussagen.id))
    .where(eq(kernaussagen.buchinhaltId, id));

  // Frischer Abschluss (von QuizClient mit ?richtig=N verlinkt): Wert aus
  // der URL. Sonst (siehe bestehendeZeile oben): das schon gespeicherte
  // Ergebnis, statt fälschlich 0 anzuzeigen.
  const richtigAnzahl =
    richtig !== undefined ? Number(richtig) : bestehendeZeile?.quizRichtigAnzahl ?? 0;

  // Markiert die gezeigteBuecher-Zeile dieses Buchs als abgeschlossen und
  // schreibt das Quiz-Ergebnis fest — Home nutzt abgeschlossenAm
  // (tagesbuch.ts), um nach dem Durcharbeiten nicht mehr den vollen
  // Detail-Block zu zeigen; Fortschritt nutzt quizRichtigAnzahl/
  // quizGesamtAnzahl für die Quiz-Trefferquote. isNull-Guard: nur beim
  // ersten Mal setzen, ein erneuter Abschluss-Besuch überschreibt weder
  // den Zeitpunkt noch das schon gespeicherte Ergebnis. Betrifft nur die
  // offizielle Tagesbuch-Zeile (falls id keiner entspricht, z.B. bei einem
  // zusätzlich gelesenen "Bereit"-Buch, ändert sich nichts).
  if (konto) {
    await db
      .update(gezeigteBuecher)
      .set({
        abgeschlossenAm: new Date(),
        quizRichtigAnzahl: richtigAnzahl,
        quizGesamtAnzahl: quizfragenAnzahl,
      })
      .where(
        and(
          eq(gezeigteBuecher.kontoId, konto.id),
          eq(gezeigteBuecher.buchinhaltId, id),
          isNull(gezeigteBuecher.abgeschlossenAm)
        )
      );
  }

  let geplanteWiederholungen = 0;
  if (konto) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(repetitionselemente)
      .innerJoin(kernaussagen, eq(repetitionselemente.kernaussageId, kernaussagen.id))
      .where(sql`${kernaussagen.buchinhaltId} = ${id} and ${repetitionselemente.kontoId} = ${konto.id}`);
    geplanteWiederholungen = n;
  }

  let streak = 0;
  if (konto) {
    const gezeigteDaten = await db
      .select({ datum: gezeigteBuecher.datumGezeigt })
      .from(gezeigteBuecher)
      .where(eq(gezeigteBuecher.kontoId, konto.id));
    streak = aktuellerStreak(gezeigteDaten.map((d) => d.datum));
  }

  const akzent = KATEGORIE_FARBE[buch.kategorie] ?? "var(--paper)";
  const kategorieLabel = KATEGORIE_LABEL[buch.kategorie] ?? buch.kategorie;

  return (
    <main
      style={{
        width: "100%",
        // Fix wie bei Home/Lesen/Kernaussagen/Quiz (09/2026): body
        // hat env(safe-area-inset-top) als eigenes padding-top, das zu
        // minHeight:100dvh addiert wurde -> ganze Seite musste gescrollt
        // werden, um den unteren Button zu sehen.
        height: "calc(100dvh - env(safe-area-inset-top, 0px))",
        boxSizing: "border-box",
        padding: 16,
        background: akzent,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        color: "var(--ink)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Abschluss</span>
        <MenuButton inline />
      </div>

      {/* minHeight/overflowY + "safe center" (09/2026, Buch-Bewertung):
          mit dem Feedback-Block darunter reicht die Höhe auf kleinen
          Displays evtl. nicht mehr — dann scrollt nur dieser Bereich, statt
          oben abgeschnitten zu werden. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          justifyContent: "safe center",
          alignItems: "center",
          gap: 22,
          textAlign: "center",
        }}
      >
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
          {buch.titel} — {kategorieLabel}
        </span>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 34, lineHeight: 1.15 }}>
            Geschafft
          </span>
          <span style={{ fontSize: 17, lineHeight: 1.5, color: "rgba(36,35,31,.75)", maxWidth: 280 }}>
            Zusammenfassung, {kernaussagenAnzahl} Kernaussage{kernaussagenAnzahl === 1 ? "" : "n"} und Quiz
            abgeschlossen.
          </span>
        </div>
        {/* "Das bleibt hängen" (09/2026, Pendenz "Abschlussansicht") — die 3
            wichtigsten Ideen + 1 offene Frage, in der Pipeline mit erzeugt.
            Ältere Bücher haben das (noch) nicht, dann fehlt der Block. */}
        {buch.bleibtHaengen && (
          <div
            style={{
              boxSizing: "border-box",
              width: "100%",
              maxWidth: 420,
              padding: "14px 16px",
              borderRadius: 14,
              background: `linear-gradient(rgba(0,0,0,.07),rgba(0,0,0,.07)), ${akzent}`,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              textAlign: "left",
            }}
          >
            <span
              style={{
                fontFamily: "Helvetica, Arial, sans-serif",
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "rgba(36,35,31,.62)",
              }}
            >
              Das bleibt hängen
            </span>
            <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              {buch.bleibtHaengen.ideen.map((idee, i) => (
                <li key={i} style={{ fontSize: 16, lineHeight: 1.5 }}>
                  {idee}
                </li>
              ))}
            </ol>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
              <span
                style={{
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "rgba(36,35,31,.55)",
                }}
              >
                Offene Frage
              </span>
              <span style={{ fontSize: 16, lineHeight: 1.5, fontStyle: "italic" }}>{buch.bleibtHaengen.offeneFrage}</span>
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            borderRadius: 999,
            background: `linear-gradient(rgba(0,0,0,.07),rgba(0,0,0,.07)), ${akzent}`,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4.5h12v15l-6-4-6 4Z" />
          </svg>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 18 }}>
            {streak} Tage Streak
          </span>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div
            style={{
              boxSizing: "border-box",
              padding: "12px 16px",
              borderRadius: 14,
              background: `linear-gradient(rgba(0,0,0,.07),rgba(0,0,0,.07)), ${akzent}`,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17 }}>
              {richtigAnzahl} / {quizfragenAnzahl}
            </span>
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 13, color: "rgba(36,35,31,.65)" }}>
              im Quiz richtig
            </span>
          </div>
          <div
            style={{
              boxSizing: "border-box",
              padding: "12px 16px",
              borderRadius: 14,
              background: `linear-gradient(rgba(0,0,0,.07),rgba(0,0,0,.07)), ${akzent}`,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17 }}>
              {geplanteWiederholungen}
            </span>
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 13, color: "rgba(36,35,31,.65)" }}>
              Wiederholungen geplant
            </span>
          </div>
        </div>
      </div>

      {/* Nur wenn es eine gezeigte_buecher-Zeile gibt — ohne sie gäbe es
          nichts zu speichern (siehe actions.ts). */}
      {bestehendeZeile && (
        <BuchBewertungAuswahl
          buchinhaltId={id}
          akzent={akzent}
          initial={{
            buchBewertung: bestehendeZeile.buchBewertung,
            imOriginalLesen: bestehendeZeile.imOriginalLesen,
            aufbereitungSchwach: bestehendeZeile.aufbereitungSchwach,
          }}
        />
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Link href="/" aria-label="Zurück zu Home">
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
    </main>
  );
}
