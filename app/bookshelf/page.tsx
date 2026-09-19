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
// Coverbild wird angezeigt, sobald vorhanden (lib/buchinfos.ts schlägt es
// im Hintergrund nach) — Kategorie-farbiges Icon bleibt der Platzhalter,
// solange (noch) kein Cover vorliegt.
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
import { after } from "next/server";
import { db } from "../../src/db";
import { buchinhalte, buecher, gezeigteBuecher, konten } from "../../src/db/schema";
import { and, eq } from "drizzle-orm";
import { KATEGORIE_FARBE, KATEGORIE_LABEL, kategorieChipStyle } from "../../src/lib/kategorien";
import { KategorieIcon } from "../../src/lib/kategorieIcons";
import { relativesDatum, umfangZeileAusText } from "../../src/lib/darstellung";
import MenuButton from "../MenuButton";
import SchliessenButton from "../SchliessenButton";
import BibliothekSuche from "./BibliothekSuche";
import { sicherstelleBuchinfos } from "../../src/lib/buchinfos";

export const dynamic = "force-dynamic";

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

function BuchCover({ kategorie, coverUrl }: { kategorie: string; coverUrl: string | null }) {
  if (coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverUrl}
        alt=""
        style={{ width: 32, height: 46, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "rgba(36,35,31,.08)" }}
      />
    );
  }
  return <BuchIcon kategorie={kategorie} />;
}

export default async function BookshelfSeite({
  searchParams,
}: {
  searchParams: Promise<{ kategorie?: string; suche?: string }>;
}) {
  const { kategorie: kategorieFilter, suche } = await searchParams;
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
      coverUrl: buecher.coverUrl,
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
      erstelltAm: buchinhalte.erstelltAm,
      buchId: buecher.id,
      verlag: buecher.verlag,
      erscheinungsjahr: buecher.erscheinungsjahr,
      coverUrl: buecher.coverUrl,
      buchinfosGeprueftAm: buecher.buchinfosGeprueftAm,
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

  // Absoluter Bestand pro Kategorie (gelesen + ungelesen zusammen), für
  // die Bibliothek-Filter-Chips (09/2026, Pendenz "Bibliothek: Zahlangabe
  // pro Kategorie", Nachschärfung zur Wunschliste — siehe
  // wunschlisteBestandProKategorie() in vorschlag.ts, das dortige
  // Bestand/Aufbereitet bezieht sich seitdem NUR noch auf die Wunschliste
  // selbst). Bewusst simpel: eine einzige Zahl, direkt aus alleImVorrat
  // oben abgeleitet (inkl. dem heutigen gepinnten Buch) — die Bibliothek
  // hat ihre Gelesen/Bereit-Aufteilung schon weiter unten, dafür braucht
  // der Chip keine zweite Zahl.
  const bestandProKategorie = new Map<string, number>();
  for (const buch of alleImVorrat) {
    bestandProKategorie.set(buch.kategorie, (bestandProKategorie.get(buch.kategorie) ?? 0) + 1);
  }

  // Buchinfos (Cover, Verlag, Erscheinungsjahr) für alle Bücher im Vorrat
  // nachschlagen — analog Wunschliste (app/buecherliste/page.tsx), läuft
  // NACH dem Response im Hintergrund (Next.js after()), damit der
  // Seitenaufbau nicht auf Open-Library-Anfragen wartet. alleImVorrat
  // deckt auch das gepinnte "heutige Buch" mit ab (das ist ja selbst ein
  // im_vorrat-Eintrag), ein separater Lauf dafür ist nicht nötig.
  after(async () => {
    await Promise.all(
      alleImVorrat.map(async (buch) => {
        if (!buch.buchId) return;
        await sicherstelleBuchinfos(buch.buchId, buch.titel, buch.autor, buch.buchinfosGeprueftAm);
      })
    );
  });

  const uebrigeNachKategorie = !kategorieFilter ? uebrige : uebrige.filter((b) => b.kategorie === kategorieFilter);

  // Suchfunktion (09/2026, Pendenz "Bibliothek: Suchfunktion") — reiner
  // Teilstring-Abgleich auf Titel/Autor, case-insensitiv, wirkt zusätzlich
  // zum Kategorie-Filter (beide zusammen, nicht alternativ). Das gepinnte
  // heutige Buch bleibt wie beim Kategorie-Filter davon unberührt.
  const sucheNormalisiert = (suche ?? "").trim().toLowerCase();
  const uebrigeGefiltert = !sucheNormalisiert
    ? uebrigeNachKategorie
    : uebrigeNachKategorie.filter(
        (b) => b.titel.toLowerCase().includes(sucheNormalisiert) || b.autor.toLowerCase().includes(sucheNormalisiert)
      );
  const filterAktiv = Boolean(kategorieFilter) || Boolean(sucheNormalisiert);

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
      <style>{`
        .bookshelf-abschnitt summary { list-style: none; }
        .bookshelf-abschnitt summary::-webkit-details-marker { display: none; }
        .bookshelf-abschnitt summary svg { transition: transform .15s ease; }
        .bookshelf-abschnitt[open] > summary svg { transform: rotate(90deg); }
      `}</style>

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
        {filterAktiv
          ? `${gefilterteAnzahl} von ${gesamtAnzahl}`
          : gesamtAnzahl === 1
            ? "1 Buch fertig"
            : `${gesamtAnzahl} Bücher fertig`}
      </span>

      {gesamtAnzahl > 0 && <BibliothekSuche initial={suche ?? ""} />}

      {kategorienVorhanden.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Link href="/bookshelf">
            <span style={kategorieChipStyle(!kategorieFilter)}>Alle</span>
          </Link>
          {kategorienVorhanden.map((k) => (
            <Link key={k} href={`/bookshelf?kategorie=${encodeURIComponent(k)}`}>
              <span style={kategorieChipStyle(kategorieFilter === k, KATEGORIE_FARBE[k])}>
                <span>{KATEGORIE_LABEL[k] ?? k}</span>
                <span style={{ opacity: 0.6, fontWeight: 700 }}>{bestandProKategorie.get(k) ?? 0}</span>
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
              {heutigesBuch.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heutigesBuch.coverUrl}
                  alt=""
                  style={{ width: 44, height: 64, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                />
              )}
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

          {filterAktiv && bereit.length === 0 && gelesen.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", padding: "20px 0" }}>
              <span style={{ fontSize: 16, color: "rgba(36,35,31,.65)" }}>
                {sucheNormalisiert ? `Keine Treffer für „${suche}“.` : "Keine Bücher in dieser Kategorie."}
              </span>
              <Link href="/bookshelf">
                <span style={{ fontSize: 15, fontWeight: 600, color: "#24231F" }}>Alle anzeigen</span>
              </Link>
            </div>
          )}

          {bereit.length > 0 && (
            <details className="bookshelf-abschnitt" open>
              <summary
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontWeight: 600,
                  fontSize: 13,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "rgba(36,35,31,.5)",
                  padding: "4px 0",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5.5 15.5 12 9 18.5" />
                </svg>
                Bereit ({bereit.length})
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
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
                  <BuchCover kategorie={buch.kategorie} coverUrl={buch.coverUrl} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17 }}>{buch.titel}</span>
                    <span style={{ fontSize: 14.5, color: "rgba(36,35,31,.65)" }}>
                      {buch.autor} · hinzugefügt {relativesDatum(buch.erstelltAm)}
                    </span>
                    {umfangZeileAusText(buch.umfang, buch.zusammenfassung) && (
                      <span style={{ fontSize: 13.5, color: "rgba(36,35,31,.5)" }}>
                        {umfangZeileAusText(buch.umfang, buch.zusammenfassung)}
                      </span>
                    )}
                    {(buch.verlag || buch.erscheinungsjahr) && (
                      <span style={{ fontSize: 13.5, color: "rgba(36,35,31,.5)" }}>
                        {[buch.verlag, buch.erscheinungsjahr].filter(Boolean).join(" · ")}
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
            </details>
          )}

          {gelesen.length > 0 && (
            <details className="bookshelf-abschnitt" open>
              <summary
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontWeight: 600,
                  fontSize: 13,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "rgba(36,35,31,.5)",
                  padding: "4px 0",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5.5 15.5 12 9 18.5" />
                </svg>
                Gelesen ({gelesen.length})
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
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
                  <BuchCover kategorie={buch.kategorie} coverUrl={buch.coverUrl} />
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
                    {(buch.verlag || buch.erscheinungsjahr) && (
                      <span style={{ fontSize: 13.5, color: "rgba(36,35,31,.5)" }}>
                        {[buch.verlag, buch.erscheinungsjahr].filter(Boolean).join(" · ")}
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
            </details>
          )}
        </div>
      )}
      </div>
    </main>
  );
}
