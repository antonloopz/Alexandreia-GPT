// src/app/page.tsx — Home ("Buch heute")
//
// Server Component: ermittelt beim Aufruf das Buch heute (naechstesBuchFuerHeute
// legt dabei ggf. die gezeigteBuecher-Zeile für heute an — siehe src/lib/tagesbuch.ts)
// und rendert es im Master-Layout aus dem Design Canvas.
//
// Bewusst als dynamische Route markiert: die Auswahl hängt vom aktuellen
// Datum ab und hat einen Nebeneffekt (DB-Insert) — darf nicht statisch
// gecacht werden.

import Link from "next/link";
import { db } from "../src/db";
import { konten } from "../src/db/schema";
import {
  naechstesBuchFuerHeute,
  bereiteBuecher,
  heuteAbgeschlosseneBuecher,
} from "../src/lib/tagesbuch";
import { relativesDatum, umfangZeileAusWortanzahl } from "../src/lib/darstellung";
import { KATEGORIE_FARBE, KATEGORIE_LABEL } from "../src/lib/kategorien";
import MenuButton from "./MenuButton";
import StatusBarColor from "./StatusBarColor";

export const dynamic = "force-dynamic";

// Eine "Heute geschafft"-Karte — für das offizielle Buch heute UND für
// jedes weitere heute abgeschlossene Buch (siehe weitereHeuteAbgeschlossen
// unten, Bug-Fix 09/2026). Jede Karte nutzt ihre EIGENE Kategorie für das
// Label, nicht die des Buchs heute — kann bei mehreren Büchern abweichen.
function GeschafftKarte({
  titel,
  kategorie,
  buchinhaltId,
}: {
  titel: string;
  kategorie: string;
  buchinhaltId: string;
}) {
  const kategorieLabel = KATEGORIE_LABEL[kategorie] ?? kategorie;
  return (
    <div
      style={{
        boxSizing: "border-box",
        padding: "16px 18px",
        borderRadius: 16,
        background: "#24231F",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: "rgba(251,250,247,.14)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FBFAF7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
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
          Heute geschafft — {kategorieLabel}
        </span>
        <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 18, color: "#FBFAF7" }}>
          {titel}
        </span>
      </div>
      <Link href={`/lesen/${buchinhaltId}`} aria-label="Nochmal ansehen">
        <span style={{ color: "rgba(251,250,247,.7)", fontSize: 20 }}>›</span>
      </Link>
    </div>
  );
}

export default async function Home() {
  const [konto] = await db.select().from(konten).limit(1);

  if (!konto) {
    return (
      <main style={{ padding: 24, fontFamily: "Helvetica, Arial, sans-serif" }}>
        Kein Konto gefunden — <code>npx tsx src/db/seed.ts</code> ausführen.
      </main>
    );
  }

  const buch = await naechstesBuchFuerHeute(konto.id);

  // Bug-Fix 09/2026: naechstesBuchFuerHeute() schliesst jedes Buch aus, das
  // diesem Konto schon EINMAL gezeigt wurde — unabhängig davon, ob es fertig
  // gelesen ist (siehe tagesbuch.ts, bewusst so für die "ein neues Buch pro
  // Tag"-Rotation). Öffnet man mehrere "Bereit"-Bücher direkt aus der
  // Bibliothek, ohne sie sofort fertig zu lesen, bleibt irgendwann KEIN
  // frischer Kandidat mehr übrig — obwohl weiterhin lesbare, nicht
  // abgeschlossene Bücher existieren. Home zeigte in diesem Fall bisher
  // fälschlich die "komplett leer"-Meldung (als gäbe es überhaupt keinen
  // Buchinhalt mit Status "im_vorrat") UND hatte dabei kein Menü — eine
  // Sackgasse ohne jede Navigation. Jetzt: erst prüfen, ob es angefangene/
  // ungelesene "Bereit"-Bücher zum Weiterlesen gibt, und nur wenn wirklich
  // GAR NICHTS vorrätig ist, die ursprüngliche Meldung zeigen.
  if (!buch) {
    const bereitZumWeiterlesen = await bereiteBuecher(konto.id, 20);
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
        }}
      >
        <MenuButton />

        {bereitZumWeiterlesen.length > 0 ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>
                Noch kein neues Buch heute
              </span>
              <span style={{ fontSize: 16, color: "rgba(36,35,31,.7)" }}>
                Alle aktuell vorrätigen Bücher wurden schon mal geöffnet — hier
                kannst du eines davon weiterlesen, bis automatisch Nachschub da ist.
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {bereitZumWeiterlesen.map((wb) => (
                <Link key={wb.buchinhaltId} href={`/lesen/${wb.buchinhaltId}`}>
                  <div
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
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: KATEGORIE_FARBE[wb.kategorie] ?? "#ccc",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 16 }}>
                        {wb.titel}
                      </span>
                      <span style={{ fontSize: 14.5, color: "rgba(36,35,31,.65)" }}>
                        {wb.autor} · hinzugefügt {relativesDatum(wb.erstelltAm)}
                      </span>
                    </div>
                    <span style={{ color: "rgba(36,35,31,.5)", fontSize: 18 }}>›</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <>
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>
              Noch kein Buch bereit
            </span>
            <span style={{ fontSize: 16, color: "rgba(36,35,31,.7)" }}>
              Es ist noch kein Buchinhalt mit Status &quot;im_vorrat&quot;. Erst die Pipeline
              (Vorschlag → Entwurf → Prüfung → Lernkarten/Quiz) für mindestens ein Buch
              durchlaufen lassen.
            </span>
          </>
        )}
      </main>
    );
  }

  const akzent = KATEGORIE_FARBE[buch.kategorie] ?? "var(--paper)";
  const kategorieLabel = KATEGORIE_LABEL[buch.kategorie] ?? buch.kategorie;
  const weitereBuecher = buch.abgeschlossen ? await bereiteBuecher(konto.id, 3) : [];
  // Alle ZUSÄTZLICH heute abgeschlossenen Bücher (Bug-Fix 09/2026: "Heute
  // geschafft" zeigte bisher nur das eine offizielle Buch heute, siehe
  // heuteAbgeschlosseneBuecher in tagesbuch.ts).
  const weitereHeuteAbgeschlossen = buch.abgeschlossen
    ? await heuteAbgeschlosseneBuecher(konto.id, buch.buchinhaltId)
    : [];
  return (
    <main
      style={{
        width: "100%",
        height: "calc(100dvh - env(safe-area-inset-top, 0px))",
        boxSizing: "border-box",
        padding: 16,
        paddingBottom: 32,
        background: akzent,
        display: "flex",
        flexDirection: "column",
        gap: 26,
        color: "var(--ink)",
        overflow: "hidden",
      }}
    >
      <StatusBarColor farbe={akzent} />
      {/* Nur noch der Menü-Trigger (drei Balken, kein Pillen-Hintergrund) —
          Bibliothek/Wunschliste/Wiederholung/Fortschritt/Einstellungen sind
          jetzt ausschliesslich über das Dropdown-Overlay erreichbar
          (09/2026, Pendenz "Buttons entfernen, nur über Dropdownmenü
          aufrufbar"). Gleiche Komponente wie auf allen Unterseiten. */}
      <MenuButton />

      {buch.abgeschlossen ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <GeschafftKarte titel={buch.titel} kategorie={buch.kategorie} buchinhaltId={buch.buchinhaltId} />
            {weitereHeuteAbgeschlossen.map((wb) => (
              <GeschafftKarte key={wb.buchinhaltId} titel={wb.titel} kategorie={wb.kategorie} buchinhaltId={wb.buchinhaltId} />
            ))}
          </div>

          {weitereBuecher.length > 0 ? (
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
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
                Weiterlesen
              </span>
              {weitereBuecher.map((wb) => (
                <Link key={wb.buchinhaltId} href={`/lesen/${wb.buchinhaltId}`}>
                  <div
                    style={{
                      boxSizing: "border-box",
                      padding: "14px 16px",
                      borderRadius: 14,
                      background: `linear-gradient(rgba(0,0,0,.07),rgba(0,0,0,.07)), ${akzent}`,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17 }}>
                        {wb.titel}
                      </span>
                      <span style={{ fontSize: 14.5, color: "rgba(36,35,31,.65)" }}>
                        {wb.autor} · hinzugefügt {relativesDatum(wb.erstelltAm)}
                      </span>
                    </div>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#24231F", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FBFAF7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.5 5.5 16 12l-6.5 6.5" />
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0 }}>
              <span style={{ fontSize: 16, lineHeight: 1.5, color: "rgba(36,35,31,.65)" }}>
                Kein weiteres Buch bereit — bald kommt automatisch Nachschub.
              </span>
            </div>
          )}

          <Link href="/bookshelf">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderRadius: 14,
                background: `linear-gradient(rgba(0,0,0,.07),rgba(0,0,0,.07)), ${akzent}`,
              }}
            >
              <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 16 }}>
                Alle Bücher in der Bibliothek
              </span>
              <span style={{ color: "rgba(36,35,31,.6)", fontSize: 18 }}>›</span>
            </div>
          </Link>
        </>
      ) : (
        <>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span
                style={{
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontWeight: 600,
                  fontSize: 14,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "rgba(36,35,31,.62)",
                }}
              >
                {kategorieLabel}
              </span>
              <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 24, lineHeight: 1.1 }}>
                {buch.titel}
              </span>
              <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 16, color: "rgba(36,35,31,.7)" }}>
                {buch.autor}
              </span>
              {umfangZeileAusWortanzahl(buch.umfang, buch.wortanzahl) && (
                <span style={{ fontSize: 14.5, color: "rgba(36,35,31,.55)" }}>
                  {umfangZeileAusWortanzahl(buch.umfang, buch.wortanzahl)}
                </span>
              )}
              {/* Kurze Begründung "Warum dieses Buch heute" (09/2026,
                  Pendenz "Home: kurze Begründung ... anzeigen") — erklärt
                  die Kategorie-Rotation aus tagesbuch.ts in einem Satz,
                  damit die Auswahl nicht willkürlich wirkt. */}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: "rgba(36,35,31,.6)",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5" />
                  <circle cx="12" cy="16" r="0.5" fill="currentColor" />
                </svg>
                {buch.begruendung}
              </span>
              <span style={{ fontSize: 18, lineHeight: 1.5 }}>{buch.teaser}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Link href={`/lesen/${buch.buchinhaltId}`} aria-label="Buch heute starten">
                <div
                  style={{
                    width: 56,
                    height: 32,
                    borderRadius: 999,
                    background: "#24231F",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={akzent} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.5 5.5 16 12l-6.5 6.5" />
                  </svg>
                </div>
              </Link>
            </div>

          </div>
        </>
      )}

    </main>
  );
}
