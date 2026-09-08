// app/MenuButton.tsx
//
// Menü-Icon + Overlay, auf jedem Screen wiederverwendet — kein eigener
// Screen/Route "/menue", sondern ein Overlay über dem aktuellen Bildschirm
// (fixed positioniert, Scrim + Karte), genau wie im Menue.dc.html-Mockup.
// Icon wechselt zwischen Chevron (zu) und × (offen). Karte ist immer
// papierfarben, unabhängig von der Kategoriefarbe des Hintergrundscreens.

"use client";

import { useState } from "react";
import Link from "next/link";

const EINTRAEGE: { href: string; label: string; pfade: React.ReactNode }[] = [
  {
    href: "/wiederholung",
    label: "Wiederholung",
    pfade: (
      <>
        <path d="M4 12a8 8 0 1 1 2.5 5.8" />
        <path d="M4 17v-4h4" />
      </>
    ),
  },
  {
    href: "/bookshelf",
    label: "Bibliothek",
    pfade: (
      <>
        <path d="M12 6.5c-1.8-1.3-4.2-1.8-6.5-1.3v11c2.3-.5 4.7 0 6.5 1.3 1.8-1.3 4.2-1.8 6.5-1.3v-11c-2.3-.5-4.7 0-6.5 1.3Z" />
        <path d="M12 6.5v11" />
      </>
    ),
  },
  {
    href: "/buecherliste",
    label: "Wunschliste",
    pfade: (
      <>
        <path d="M6 3.5v17" />
        <path d="M6 4h11l-3 3.5 3 3.5H6" />
      </>
    ),
  },
  {
    href: "/fortschritt",
    label: "Fortschritt",
    pfade: (
      <>
        <line x1="5.5" y1="18.5" x2="5.5" y2="12.5" />
        <line x1="12" y1="18.5" x2="12" y2="8.5" />
        <line x1="18.5" y1="18.5" x2="18.5" y2="5.5" />
      </>
    ),
  },
  {
    href: "/einstellungen",
    label: "Einstellungen",
    pfade: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19.5a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H4.5a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10.5a1.7 1.7 0 0 0 1.04-1.56V4.5a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10.5a1.7 1.7 0 0 0 1.56 1.04h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.04Z" />
      </>
    ),
  },
];

export default function MenuButton() {
  const [offen, setOffen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOffen((o) => !o)}
        aria-label={offen ? "Menü schliessen" : "Menü öffnen"}
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          border: "none",
          background: "none",
          padding: 0,
          cursor: "pointer",
        }}
      >
        {offen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9.5 12 15.5 18 9.5" />
          </svg>
        )}
      </button>

      {offen && (
        <>
          <div
            onClick={() => setOffen(false)}
            aria-hidden
            style={{ position: "fixed", inset: 0, background: "rgba(36,35,31,.45)", zIndex: 40 }}
          />
          <div
            style={{
              position: "fixed",
              top: 64,
              right: 16,
              width: 246,
              boxSizing: "border-box",
              background: "#F2F4EF",
              border: "1.5px solid #24231F",
              borderRadius: 16,
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              zIndex: 41,
            }}
          >
            {EINTRAEGE.map((eintrag) => (
              <Link
                key={eintrag.href}
                href={eintrag.href}
                onClick={() => setOffen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 12px",
                  borderRadius: 10,
                  textDecoration: "none",
                  color: "#24231F",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  {eintrag.pfade}
                </svg>
                <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 14.5 }}>
                  {eintrag.label}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
