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
import { naechstesBuchFuerHeute, faelligeWiederholungenAnzahl } from "../src/lib/tagesbuch";
import { KATEGORIE_FARBE, KATEGORIE_LABEL } from "../src/lib/kategorien";
import { aktuellerStreak } from "../src/lib/streak";
import MenuButton from "./MenuButton";

export const dynamic = "force-dynamic";

function begruessung(): string {
  const stunde = new Date().getHours();
  if (stunde < 11) return "Guten Morgen";
  if (stunde < 18) return "Guten Tag";
  return "Guten Abend";
}

function heutigesDatum(): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>
            {begruessung()}, Toni
          </span>
          <span
            style={{
              fontFamily: "Helvetica, Arial, sans-serif",
              fontSize: 12,
              letterSpacing: ".05em",
              textTransform: "uppercase",
              color: "rgba(36,35,31,.62)",
            }}
          >
            {heutigesDatum()}
          </span>
        </div>
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

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <AktionsSchritt href={`/lesen/${buch.buchinhaltId}`} aktiv label="Zusammenfassung" akzent={akzent}>
          <path d="M12 6.5c-1.8-1.3-4.2-1.8-6.5-1.3v11c2.3-.5 4.7 0 6.5 1.3 1.8-1.3 4.2-1.8 6.5-1.3v-11c-2.3-.5-4.7 0-6.5 1.3Z" />
          <path d="M12 6.5v11" />
        </AktionsSchritt>
        <AktionsSchritt href={`/kernaussagen/${buch.buchinhaltId}`} label="Kernaussagen" akzent={akzent}>
          <path d="M6 4.5h12v15l-6-4-6 4Z" />
        </AktionsSchritt>
        <AktionsSchritt href={`/lernkarten/${buch.buchinhaltId}`} label="Lernkarten" akzent={akzent}>
          <rect x="4.5" y="7" width="13" height="9" rx="1.5" transform="rotate(-6 11 11.5)" />
          <rect x="6.5" y="8.5" width="13" height="9" rx="1.5" />
        </AktionsSchritt>
        <AktionsSchritt href={`/quiz/${buch.buchinhaltId}`} label="Quiz" akzent={akzent}>
          <circle cx="12" cy="12" r="8" />
          <path d="M8.5 12.3l2.3 2.3 4.7-5" />
        </AktionsSchritt>
      </div>

      <div style={{ flex: 1 }} />

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
    </main>
  );
}

function AktionsSchritt({
  href,
  label,
  akzent,
  aktiv,
  children,
}: {
  href: string;
  label: string;
  akzent: string;
  aktiv?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 70 }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: aktiv ? "#24231F" : "none",
          border: aktiv ? "none" : "2.25px solid #24231F",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke={aktiv ? "#FBFAF7" : akzent}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {children}
        </svg>
      </div>
      <span
        style={{
          fontFamily: "Helvetica, Arial, sans-serif",
          fontSize: 11,
          fontWeight: aktiv ? 700 : 500,
          color: aktiv ? "#24231F" : "rgba(36,35,31,.7)",
          textAlign: "center",
        }}
      >
        {label}
      </span>
    </Link>
  );
}
