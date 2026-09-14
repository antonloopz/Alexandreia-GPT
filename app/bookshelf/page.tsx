// app/bookshelf/page.tsx
//
// Ersetzt den bisherigen "Archiv"-Screen. Zeigt ALLE fertig produzierten
// Bücher ("im_vorrat"), nicht nur die schon gezeigten — Archiv kannte nur
// die Historie, aber weil die Content-Pipeline oft schneller produziert als
// ein Buch pro Tag gezeigt wird, wartet meist noch einiges an fertigen,
// noch nie gezeigten Büchern im Vorrat. Drei Bereiche: heutiges Buch
// (gepinnt), "Gelesen" (abgeschlossenAm gesetzt — wirklich fertig gelesen,
// nicht nur schon mal geöffnet, siehe statusProBuchinhalt unten, Bug-Fix
// 09/2026), "Bereit" (noch nie geöffnet ODER geöffnet, aber Quiz nicht
// abgeschlossen — beides direkt (weiter-)lesbar über "Jetzt lesen").
// Bewusst kein Coverbild (dafür gibt's aktuell keine Datenquelle) —
// Kategorie-farbiges Icon als Platzhalter, wie zuvor in Archiv.
//
// "Gelesen"-Bücher bleiben bewusst genauso aufrufbar wie "Bereit"-Bücher
// (09/2026, Pendenz "Bibliothek: gelesene Bücher weiterhin aufrufbar, ohne
// den Gelesen-Zähler zu beeinflussen") — ein zweites Öffnen/erneutes Quiz
// ist dafür schon von sich aus unschädlich: sicherstelleGezeigt() (siehe
// app/lesen/[id]/page.tsx) legt nur beim ALLERERSTEN Öffnen eine Zeile an,
// und app/abschluss/[id]/page.tsx schreibt abgeschlossenAm/
// quizRichtigAnzahl nur, wenn abgeschlossenAm noch null ist (isNull-Guard)
// — ein erneuter Durchlauf überschreibt also weder Datum noch Ergebnis, und
// Fortschritts Zähler ("Bücher gelesen", Trefferquote) bleiben unverändert.
//
// Kategorie-Filter (09/2026, Pendenz "Bibliothek: auch hier nach
// Kategorien filtern") — gleiches Muster wie in der Wunschliste
// (app/buecherliste/page.tsx): reiner ?kategorie=-Query-Parameter statt
// Client-State, Chips nur für Kategorien, die unter "Bereit"/"Gelesen"
// TATSÄCHLICH vorkommen. Das heutige (gepinnte) Buch bleibt bewusst IMMER
// sichtbar, unabhängig vom Filter — es ist ja nicht Teil der gefilterten
// Liste, sondern der aktuelle Lesefortschritt.

import Link from "next/link";
import { db } from "../../src/db";
import { buchinhalte, buecher, gezeigteBuecher, konten } from "../../src/db/schema";
import { and, eq } from "drizzle-orm";
import { KATEGORIE_FARBE, KATEGORIE_LABEL } from "../../src/lib/kategorien";
import { KategorieIcon } from "../../src/lib/kategorieIcons";
import { umfangZeileAusText } from "../../src/lib/darstellung";
import MenuButton from "../MenuButton";
import SchliessenButton from "../SchliessenButton";

export const dynamic = "force-dynamic";

// Kurzhelfer für die Kategorie-Chips, identisch zu app/buecherliste/page.tsx
// (KATEGORIE_FARBE liefert volle Hex-Farben, für den abgeschwächten
// "inaktiv"-Zustand der Chips wird davon eine transparente Variante
// gebraucht).
function hexZuRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function kategorieChipStyle(aktiv: boolean, farbe?: string) {
  return {
    display: "inline-flex" as const,
    alignItems: "center" as const,
    gap: 6,
    padding: "6px 12px",
    borderRadius: 999,
    fontFamily: "Helvetica, Arial, sans-serif",
    fontWeight: 600,
    fontSize: 14.5,
    background: farbe ? hexZuRgba(farbe, aktiv ? 0.9 : 0.16) : aktiv ? "#24231F" : "rgba(36,35,31,.08)",
    color: farbe ? "rgba(36,35,31,.85)" : aktiv ? "#FBFAF7" : "rgba(36,35,31,.75)",
  };
}

function BuchIcon({ kategorie }: { kategorie: string }) {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 10,
        background: KATEGORIE_FARBE[kategorie] ?? "#ccc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <KategorieIcon kategorie={kategorie} size={16} strokeWidth={1.6} />
    </div>
  );
}

export default async function BookshelfSeite({
  searchParams,
}: {
  searchParams: Promise<{ kategorie?: string }>;
}) {
  const { kategorie: kategorieFilter } = await searchParams;
  const [konto] = await db.select().from(konten).limit(1);

  if (!konto) {
    return (
      <main style={{ padding: 24, fontFamily: "Helvetica, Arial, sans-serif" }}>
        Kein Konto gefunden — <code>npx tsx src/db/seed.ts</code> ausführen.
      </main>
    );
  }

  const heute = new Date();

  const [heutigesBuch] = await db
    .select({
      buchinhaltId: buchinhalte.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
      umfang: buecher.umfang,
      zusammenfassung: buchinhalte.zusammenfassung,
    })
    .from(gezeigteBuecher)
    .innerJoin(buchinhalte, eq(gezeigteBuecher.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(and(eq(gezeigteBuecher.kontoId, konto.id), eq(gezeigteBuecher.datumGezeigt, heute)));

  const alleImVorrat = await db
    .select({
      buchinhaltId: buchinhalte.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
      umfang: buecher.umfang,
      zusammenfassung: buchinhalte.zusammenfassung,
    })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.status, "im_vorrat"));

  const gezeigtRows = await db
    .select({
      buchinhaltId: gezeigteBuecher.buchinhaltId,
      datumGezeigt: gezeigteBuecher.datumGezeigt,
      abgeschlossenAm: gezeigteBuecher.abgeschlossenAm,
    })
    .from(gezeigteBuecher)
    .where(eq(gezeigteBuecher.kontoId, konto.id));

  // Pro Buchinhalt gibt es je Konto höchstens eine Zeile (sicherstelleGezeigt
  // in tagesbuch.ts ist idempotent) — ob sie abgeschlossenAm trägt,
  // entscheidet allein über "Gelesen" vs. "Bereit" (Bug-Fix 09/2026: vorher
  // zählte schon das reine Öffnen als "gelesen", auch ohne abgeschlossenes
  // Quiz — und ohne Weiterlesen-Link liess sich ein so "gelesenes", aber nie
  // fertig gelesenes Buch danach gar nicht mehr öffnen).
  const statusProBuchinhalt = new Map<string, { datumGezeigt: Date; abgeschlossenAm: Date | null }>();
  for (const zeile of gezeigtRows) {
    if (zeile.buchinhaltId === heutigesBuch?.buchinhaltId) continue; // separat gepinnt
    statusProBuchinhalt.set(zeile.buchinhaltId, {
      datumGezeigt: zeile.datumGezeigt,
      abgeschlossenAm: zeile.abgeschlossenAm,
    });
  }

  const uebrige = alleImVorrat.filter((b) => b.buchinhaltId !== heutigesBuch?.buchinhaltId);

  // Nur Kategorien als Chip anzeigen, die unter den "übrigen" (nicht dem
  // gepinnten heutigen Buch) Büchern tatsächlich vorkommen — sonst stünden
  // bei einer kleinen Bibliothek meist leere Filter-Chips da.
  const kategorienVorhanden = Object.keys(KATEGORIE_LABEL).filter((k) => uebrige.some((b) => b.kategorie === k));

  const uebrigeGefiltert = !kategorieFilter ? uebrige : uebrige.filter((b) => b.kategorie === kategorieFilter);

  const gelesen = uebrigeGefiltert
    .filter((b) => statusProBuchinhalt.get(b.buchinhaltId)?.abgeschlossenAm != null)
    .sort(
      (a, b) =>
        statusProBuchinhalt.get(b.buchinhaltId)!.abgeschlossenAm!.getTime() -
        statusProBuchinhalt.get(a.buchinhaltId)!.abgeschlossenAm!.getTime()
    );

  const bereit = uebrigeGefiltert
    .filter((b) => statusProBuchinhalt.get(b.buchinhaltId)?.abgeschlossenAm == null)
    .sort((a, b) => a.titel.localeCompare(b.titel));

  const gesamtAnzahl = alleImVorrat.length;
  const gefilterteAnzahl = (heutigesBuch ? 1 : 0) + bereit.length + gelesen.length;

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
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Bibliothek</span>
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
        {kategorieFilter
          ? `${gefilterteAnzahl} von ${gesamtAnzahl}`
          : gesamtAnzahl === 1
            ? "1 Buch fertig"
            : `${gesamtAnzahl} Bücher fertig`}
      </span>

      {kategorienVorhanden.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Link href="/bookshelf">
            <span style={kategorieChipStyle(!kategorieFilter)}>Alle</span>
          </Link>
          {kategorienVorhanden.map((k) => (
            <Link key={k} href={`/bookshelf?kategorie=${encodeURIComponent(k)}`}>
              <span style={kategorieChipStyle(kategorieFilter === k, KATEGORIE_FARBE[k])}>
                {KATEGORIE_LABEL[k] ?? k}
              </span>
            </Link>
          ))}
        </div>
      )}

      {gesamtAnzahl === 0 ? (
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
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 19 }}>Noch keine Bücher fertig</span>
            <span style={{ fontSize: 16, lineHeight: 1.5, color: "rgba(36,35,31,.65)" }}>
              Sobald die Pipeline das erste Buch produziert hat, erscheint es hier.
            </span>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {heutigesBuch && (
            <div
              style={{
                boxSizing: "border-box",
                padding: "14px 16px",
                borderRadius: 14,
                background: "#24231F",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                <span
                  style={{
                    fontFamily: "Helvetica, Arial, sans-serif",
                    fontWeight: 600,
                    fontSize: 13,
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                    color: "rgba(251,250,247,.65)",
                  }}
                >
                  Heute · {KATEGORIE_LABEL[heutigesBuch.kategorie] ?? heutigesBuch.kategorie}
                </span>
                <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17, color: "#FBFAF7" }}>
                  {heutigesBuch.titel}
                </span>
                <span style={{ fontSize: 14.5, color: "rgba(251,250,247,.75)" }}>{heutigesBuch.autor}</span>
                {umfangZeileAusText(heutigesBuch.umfang, heutigesBuch.zusammenfassung) && (
                  <span style={{ fontSize: 13.5, color: "rgba(251,250,247,.55)" }}>
                    {umfangZeileAusText(heutigesBuch.umfang, heutigesBuch.zusammenfassung)}
                  </span>
                )}
              </div>
            </div>
          )}

          {kategorieFilter && bereit.length === 0 && gelesen.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", padding: "20px 0" }}>
              <span style={{ fontSize: 16, color: "rgba(36,35,31,.65)" }}>Keine Bücher in dieser Kategorie.</span>
              <Link href="/bookshelf">
                <span style={{ fontSize: 15, fontWeight: 600, color: "#24231F" }}>Alle anzeigen</span>
              </Link>
            </div>
          )}

          {bereit.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span
                style={{
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontWeight: 600,
                  fontSize: 13,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "rgba(36,35,31,.5)",
                }}
              >
                Bereit ({bereit.length})
              </span>
              {bereit.map((buch) => (
                <div
                  key={buch.buchinhaltId}
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
                  <BuchIcon kategorie={buch.kategorie} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17 }}>{buch.titel}</span>
                    <span style={{ fontSize: 14.5, color: "rgba(36,35,31,.65)" }}>{buch.autor}</span>
                    {umfangZeileAusText(buch.umfang, buch.zusammenfassung) && (
                      <span style={{ fontSize: 13.5, color: "rgba(36,35,31,.5)" }}>
                        {umfangZeileAusText(buch.umfang, buch.zusammenfassung)}
                      </span>
                    )}
                  </div>
                  <Link href={`/lesen/${buch.buchinhaltId}`} aria-label="Jetzt lesen">
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#24231F", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={KATEGORIE_FARBE[buch.kategorie] ?? "#FBFAF7"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.5 5.5 16 12l-6.5 6.5" />
                      </svg>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          )}

          {gelesen.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span
                style={{
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontWeight: 600,
                  fontSize: 13,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "rgba(36,35,31,.5)",
                }}
              >
                Gelesen ({gelesen.length})
              </span>
              {gelesen.map((buch) => (
                <div
                  key={buch.buchinhaltId}
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
                  <BuchIcon kategorie={buch.kategorie} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17 }}>{buch.titel}</span>
                    <span style={{ fontSize: 14.5, color: "rgba(36,35,31,.65)" }}>
                      {buch.autor} · gelesen{" "}
                      {new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" }).format(
                        statusProBuchinhalt.get(buch.buchinhaltId)!.abgeschlossenAm!
                      )}
                    </span>
                    {umfangZeileAusText(buch.umfang, buch.zusammenfassung) && (
                      <span style={{ fontSize: 13.5, color: "rgba(36,35,31,.5)" }}>
                        {umfangZeileAusText(buch.umfang, buch.zusammenfassung)}
                      </span>
                    )}
                  </div>
                  <Link href={`/lesen/${buch.buchinhaltId}`} aria-label="Nochmal lesen">
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(36,35,31,.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.5 5.5 16 12l-6.5 6.5" />
                      </svg>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </main>
  );
}
