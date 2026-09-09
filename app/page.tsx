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
import { konten, gezeigteBuecher } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { naechstesBuchFuerHeute, faelligeWiederholungenAnzahl, bereiteBuecher } from "../src/lib/tagesbuch";
import { KATEGORIE_FARBE, KATEGORIE_LABEL } from "../src/lib/kategorien";
import { aktuellerStreak } from "../src/lib/streak";
import MenuButton from "./MenuButton";
import StatusBarColor from "./StatusBarColor";

export const dynamic = "force-dynamic";

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

  if (!buch) {
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
          gap: 12,
        }}
      >
        <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 20 }}>
          Noch kein Buch bereit
        </span>
        <span style={{ fontSize: 14, color: "rgba(36,35,31,.7)" }}>
          Es ist noch kein Buchinhalt mit Status &quot;im_vorrat&quot;. Erst die Pipeline
          (Vorschlag → Entwurf → Prüfung → Lernkarten/Quiz) für mindestens ein Buch
          durchlaufen lassen.
        </span>
      </main>
    );
  }

  const gezeigteDaten = await db
    .select({ datum: gezeigteBuecher.datumGezeigt })
    .from(gezeigteBuecher)
    .where(eq(gezeigteBuecher.kontoId, konto.id));
  const streak = aktuellerStreak(gezeigteDaten.map((d) => d.datum));

  const faellig = await faelligeWiederholungenAnzahl(konto.id);
  const akzent = KATEGORIE_FARBE[buch.kategorie] ?? "var(--paper)";
  const kategorieLabel = KATEGORIE_LABEL[buch.kategorie] ?? buch.kategorie;
  const weitereBuecher = buch.abgeschlossen ? await bereiteBuecher(konto.id, 3) : [];

  return (
    <main
      style={{
        width: "100%",
        minHeight: "100dvh",
        boxSizing: "border-box",
        padding: 16,
        background: akzent,
        display: "flex",
        flexDirection: "column",
        gap: 26,
        color: "var(--ink)",
      }}
    >
      <StatusBarColor farbe={akzent} />
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 999,
              background: `linear-gradient(rgba(0,0,0,.07),rgba(0,0,0,.07)), ${akzent}`,
            }}
          >
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 13 }}>
              {streak}
            </span>
          </div>
          <MenuButton />
        </div>
      </div>

      {buch.abgeschlossen ? (
        <>
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
                  fontSize: 11,
                  letterSpacing: ".04em",
                  textTransform: "uppercase",
                  color: "rgba(251,250,247,.65)",
                }}
              >
                Heute geschafft — {kategorieLabel}
              </span>
              <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 16, color: "#FBFAF7" }}>
                {buch.titel}
              </span>
            </div>
            <Link href={`/lesen/${buch.buchinhaltId}`} aria-label="Nochmal ansehen">
              <span style={{ color: "rgba(251,250,247,.7)", fontSize: 18 }}>›</span>
            </Link>
          </div>

          {weitereBuecher.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                      <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 15 }}>
                        {wb.titel}
                      </span>
                      <span style={{ fontSize: 12.5, color: "rgba(36,35,31,.65)" }}>{wb.autor}</span>
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
            <span style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(36,35,31,.65)" }}>
              Kein weiteres Buch bereit — bald kommt automatisch Nachschub.
            </span>
          )}

          <div style={{ flex: 1 }} />

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
              <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 14 }}>
                Alle Bücher in der Bibliothek
              </span>
              <span style={{ color: "rgba(36,35,31,.6)", fontSize: 16 }}>›</span>
            </div>
          </Link>
        </>
      ) : (
        <>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span
                style={{
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontWeight: 600,
                  fontSize: 12,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "rgba(36,35,31,.62)",
                }}
              >
                Dein Buch heute — {kategorieLabel}
              </span>
              <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 34, lineHeight: 1.1 }}>
                {buch.titel}
              </span>
              <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 14, color: "rgba(36,35,31,.7)" }}>
                {buch.autor}
              </span>
              <span style={{ fontSize: 15, lineHeight: 1.5 }}>{buch.teaser}</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Link href={`/lesen/${buch.buchinhaltId}`} aria-label="Buch heute starten">
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
        </>
      )}

      <Link href="/wiederholung">
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4.5" y="7" width="13" height="9" rx="1.5" transform="rotate(-6 11 11.5)" />
              <rect x="6.5" y="8.5" width="13" height="9" rx="1.5" />
            </svg>
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 14 }}>
              {faellig} fällige Wiederholung{faellig === 1 ? "" : "en"}
            </span>
          </div>
          <span style={{ color: "rgba(36,35,31,.6)", fontSize: 16 }}>›</span>
        </div>
      </Link>

      {!buch.abgeschlossen && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <NavKreis href={`/lesen/${buch.buchinhaltId}`} akzent={akzent}>
            <path d="M12 6.5c-1.8-1.3-4.2-1.8-6.5-1.3v11c2.3-.5 4.7 0 6.5 1.3 1.8-1.3 4.2-1.8 6.5-1.3v-11c-2.3-.5-4.7 0-6.5 1.3Z" />
            <path d="M12 6.5v11" />
          </NavKreis>
          <NavKreis href={`/kernaussagen/${buch.buchinhaltId}`} akzent={akzent}>
            <path d="M6 4.5h12v15l-6-4-6 4Z" />
          </NavKreis>
          <NavKreis href={`/lernkarten/${buch.buchinhaltId}`} akzent={akzent}>
            <rect x="4.5" y="7" width="13" height="9" rx="1.5" transform="rotate(-6 11 11.5)" />
            <rect x="6.5" y="8.5" width="13" height="9" rx="1.5" />
          </NavKreis>
          <NavKreis href={`/quiz/${buch.buchinhaltId}`} akzent={akzent}>
            <circle cx="12" cy="12" r="8" />
            <path d="M8.5 12.3l2.3 2.3 4.7-5" />
          </NavKreis>
        </div>
      )}
    </main>
  );
}

// Wie im Design-Canvas-Mockup: alle vier Kreise gleich, "leer" mit
// Kategoriefarbe als Hintergrund — keine Unterscheidung nach aktivem
// Schritt und ohne Text-Label (Ablösung der früheren AktionsSchritt-Variante
// mit Label + schwarz gefülltem "aktiven" Kreis).
function NavKreis({
  href,
  akzent,
  children,
}: {
  href: string;
  akzent: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: akzent,
          border: "3px solid #24231F",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {children}
        </svg>
      </div>
    </Link>
  );
}
