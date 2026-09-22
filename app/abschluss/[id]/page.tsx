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
//
// Pendenz "Abschlussansicht 'Das bleibt hängen'" (09/2026): zusätzlich
// (1) "Durchgearbeitet" — was in diesem Buch durchlaufen wurde, über die
// vier Teile Zusammenfassung / Kernaussagen / Quiz / Einordnung (ersetzt den
// früheren Einzeiler und die separate Quiz-Kachel), und (2) "Verwandte
// Bücher" über gemeinsame Tags (lib/tags.ts verwandteBuecher) als erster
// Schritt der Querverbindungen, vor der Pendenz "Vernetzung".

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
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { EinordnungUrteil } from "../../../src/db/schema";
import { KATEGORIE_FARBE, KATEGORIE_LABEL } from "../../../src/lib/kategorien";
import { aktuellerStreak } from "../../../src/lib/streak";
import { verwandteBuecher } from "../../../src/lib/tags";
import MenuButton from "../../MenuButton";
import BuchBewertungAuswahl from "./BuchBewertung";
import WiederInLaufButton from "../../WiederInLaufButton";

export const dynamic = "force-dynamic";

const URTEIL_LABEL: Record<EinordnungUrteil, string> = {
  belegt: "heute belegt",
  umstritten: "heute umstritten",
  ueberholt: "heute überholt",
  weiterhin_relevant: "weiterhin relevant",
};

const KARTEN_TITEL_STIL = {
  fontFamily: "Helvetica, Arial, sans-serif",
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: ".06em",
  textTransform: "uppercase" as const,
  color: "rgba(36,35,31,.62)",
};

function Haken({ an }: { an: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: an ? 1 : 0.3 }}>
      {an ? <path d="M5 12.5 10 17.5 19 7" /> : <line x1="7" y1="12" x2="17" y2="12" />}
    </svg>
  );
}

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
    .select({
      buchId: buecher.id,
      titel: buecher.titel,
      kategorie: buecher.kategorie,
      bleibtHaengen: buchinhalte.bleibtHaengen,
      einordnung: buchinhalte.einordnung,
    })
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
          wiederImLaufSeit: gezeigteBuecher.wiederImLaufSeit,
          durchgaenge: gezeigteBuecher.durchgaenge,
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
  //
  // Erneuter Durchgang (09/2026, Buch wieder in den Lauf aufgenommen,
  // wiederImLaufSeit gesetzt): hier gilt der isNull-Guard nicht — beim
  // Abschluss werden Zeitpunkt und Quiz-Ergebnis mit dem neuen Durchgang
  // überschrieben, das Buch verlässt den Lauf wieder und der Zähler
  // durchgaenge steigt. Nur mit frischem ?richtig= (also direkt aus dem
  // Quiz): ein blosser Besuch, z.B. über "Bewerten" in der Bibliothek,
  // schliesst den neuen Durchgang NICHT ab.
  let imLauf = bestehendeZeile?.wiederImLaufSeit != null;
  let durchgaenge = bestehendeZeile?.durchgaenge ?? 1;
  if (konto && imLauf && richtig !== undefined) {
    await db
      .update(gezeigteBuecher)
      .set({
        abgeschlossenAm: new Date(),
        quizRichtigAnzahl: richtigAnzahl,
        quizGesamtAnzahl: quizfragenAnzahl,
        wiederImLaufSeit: null,
        erneutGezeigtAm: sql`coalesce(${gezeigteBuecher.erneutGezeigtAm}, current_date)`,
        durchgaenge: sql`${gezeigteBuecher.durchgaenge} + 1`,
      })
      .where(
        and(
          eq(gezeigteBuecher.kontoId, konto.id),
          eq(gezeigteBuecher.buchinhaltId, id),
          isNotNull(gezeigteBuecher.wiederImLaufSeit)
        )
      );
    imLauf = false;
    durchgaenge += 1;
  } else if (konto) {
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
      .select({ datum: gezeigteBuecher.datumGezeigt, erneut: gezeigteBuecher.erneutGezeigtAm })
      .from(gezeigteBuecher)
      .where(eq(gezeigteBuecher.kontoId, konto.id));
    // Der Beginn eines erneuten Durchgangs zählt als Lesetag mit (09/2026).
    streak = aktuellerStreak(gezeigteDaten.flatMap((d) => (d.erneut ? [d.datum, d.erneut] : [d.datum])));
  }

  const akzent = KATEGORIE_FARBE[buch.kategorie] ?? "var(--paper)";
  const kategorieLabel = KATEGORIE_LABEL[buch.kategorie] ?? buch.kategorie;
  const kartenHintergrund = `linear-gradient(rgba(0,0,0,.07),rgba(0,0,0,.07)), ${akzent}`;
  const verwandte = await verwandteBuecher(buch.buchId);

  // Einordnung: Urteil "heute" falls vorhanden, sonst nur "vorhanden" —
  // ältere Bücher ohne Einordnung zeigen einen Strich statt eines Hakens.
  const einordnungWert = !buch.einordnung
    ? "nicht vorhanden"
    : buch.einordnung.heute
      ? URTEIL_LABEL[buch.einordnung.heute.urteil] ?? buch.einordnung.heute.urteil
      : "gelesen";
  const durchgearbeitet: { label: string; wert: string; an: boolean }[] = [
    { label: "Zusammenfassung", wert: "gelesen", an: true },
    { label: "Kernaussagen", wert: String(kernaussagenAnzahl), an: kernaussagenAnzahl > 0 },
    { label: "Quiz", wert: `${richtigAnzahl} / ${quizfragenAnzahl} richtig`, an: quizfragenAnzahl > 0 },
    { label: "Einordnung", wert: einordnungWert, an: Boolean(buch.einordnung) },
    // Erst ab dem zweiten Durchgang (Buch war wieder im Lauf, 09/2026).
    ...(durchgaenge > 1 ? [{ label: "Durchgänge", wert: String(durchgaenge), an: true }] : []),
  ];

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
        </div>

        <div
          style={{
            boxSizing: "border-box",
            width: "100%",
            maxWidth: 420,
            padding: "14px 16px",
            borderRadius: 14,
            background: kartenHintergrund,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            textAlign: "left",
          }}
        >
          <span style={KARTEN_TITEL_STIL}>Durchgearbeitet</span>
          {durchgearbeitet.map((schritt) => (
            <div key={schritt.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Haken an={schritt.an} />
              <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 600, fontSize: 15.5, flex: 1 }}>
                {schritt.label}
              </span>
              <span style={{ fontSize: 15, color: "rgba(36,35,31,.7)", textAlign: "right" }}>{schritt.wert}</span>
            </div>
          ))}
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
              background: kartenHintergrund,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              textAlign: "left",
            }}
          >
            <span style={KARTEN_TITEL_STIL}>Das bleibt hängen</span>
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

        {verwandte.length > 0 && (
          <div
            style={{
              boxSizing: "border-box",
              width: "100%",
              maxWidth: 420,
              padding: "14px 16px",
              borderRadius: 14,
              background: kartenHintergrund,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              textAlign: "left",
            }}
          >
            <span style={KARTEN_TITEL_STIL}>Verwandte Bücher</span>
            {verwandte.map((v) => (
              <Link key={v.buchinhaltId} href={`/lesen/${v.buchinhaltId}`} style={{ color: "inherit", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: KATEGORIE_FARBE[v.kategorie] ?? "#ccc", flexShrink: 0, alignSelf: "flex-start", marginTop: 7 }} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 16 }}>{v.titel}</span>
                  <span style={{ fontSize: 14, color: "rgba(36,35,31,.65)" }}>{v.autor}</span>
                  <span style={{ fontSize: 13.5, color: "rgba(36,35,31,.55)" }}>
                    {v.gemeinsameTags.map((t) => `#${t.name}`).join("  ")}
                  </span>
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M9.5 5.5 16 12l-6.5 6.5" />
                </svg>
              </Link>
            ))}
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

        {/* Quiz-Ergebnis steht jetzt in "Durchgearbeitet" oben. */}
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

      {/* "Wieder in den Lauf" (09/2026) links, Weiter-Pfeil rechts — nur mit
          gezeigte_buecher-Zeile (sonst gibt es nichts umzuwidmen). */}
      <div style={{ display: "flex", justifyContent: bestehendeZeile ? "space-between" : "flex-end", alignItems: "center" }}>
        {bestehendeZeile && <WiederInLaufButton buchinhaltId={id} imLauf={imLauf} />}
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
