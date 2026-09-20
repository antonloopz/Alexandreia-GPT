// app/NavKreise.tsx
//
// Drei-Kacheln-Navigation zwischen den Hauptscreens eines Buchs (Lesen,
// Kernaussagen, Quiz — Lernkarten 09/2026 entfernt, das Quiz-Ergebnis
// treibt seither die Wiederholung-Planung direkt an, siehe
// app/quiz/[id]/actions.ts). Wieder echte Kreise statt der
// abgerundeten Quadrate, und ohne Füllanimation beim Laden der aktiven
// Seite (09/2026, Pendenz "4 Buttons der Leseseiten ohne Animation und
// wieder kreisrund" — Rückbau der vorherigen Kacheln-Variante). Aktiver
// Screen: Kreis schwarz gefüllt, Icon in Kategoriefarbe. Inaktive
// Screens: Kreis in Kategoriefarbe, Icon schwarz.
//
// Ohne Animation braucht es keinen Mount-Zustand mehr — der Endzustand
// wird direkt beim Rendern gesetzt, kein "use client"/useEffect nötig.

import Link from "next/link";

type Ziel = "lesen" | "kernaussagen" | "quiz";

const ZIELE: { schluessel: Ziel; hrefPraefix: string; pfade: React.ReactNode }[] = [
  {
    schluessel: "lesen",
    hrefPraefix: "/lesen",
    pfade: (
      <>
        <path d="M12 6.5c-1.8-1.3-4.2-1.8-6.5-1.3v11c2.3-.5 4.7 0 6.5 1.3 1.8-1.3 4.2-1.8 6.5-1.3v-11c-2.3-.5-4.7 0-6.5 1.3Z" />
        <path d="M12 6.5v11" />
      </>
    ),
  },
  {
    schluessel: "kernaussagen",
    hrefPraefix: "/kernaussagen",
    pfade: (
      <>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="1.4" />
        <line x1="12" y1="1.5" x2="12" y2="4.5" />
        <line x1="12" y1="19.5" x2="12" y2="22.5" />
        <line x1="1.5" y1="12" x2="4.5" y2="12" />
        <line x1="19.5" y1="12" x2="22.5" y2="12" />
      </>
    ),
  },
  {
    schluessel: "quiz",
    hrefPraefix: "/quiz",
    pfade: (
      <>
        <path d="M9.3 9.2a2.7 2.7 0 1 1 4.4 2.1c-.9.7-1.7 1.2-1.7 2.5" />
        <line x1="12" y1="17.3" x2="12" y2="17.3" strokeWidth={2.6} />
      </>
    ),
  },
];

export default function NavKreise({
  buchinhaltId,
  akzent,
  aktiv,
}: {
  buchinhaltId: string;
  akzent: string;
  aktiv?: Ziel;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      {ZIELE.map((ziel) => {
        const istAktiv = ziel.schluessel === aktiv;
        return (
          <Link key={ziel.schluessel} href={`${ziel.hrefPraefix}/${buchinhaltId}`}>
            <div style={{ position: "relative", width: 56, height: 56 }}>
              {/* Rahmen als eigene Ebene, getrennt vom Clipping-Container
                  darunter — border + overflow:hidden + border-radius auf
                  demselben Element lässt in Safari/WebKit sonst einen
                  1px-Spalt an den Ecken frei, durch den der Hintergrund
                  durchschimmert (siehe Bugreport 09/2026, gilt für Kreise
                  genauso wie für die vorherigen Kacheln). */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  border: "1px solid #24231F",
                  boxSizing: "border-box",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 1,
                  borderRadius: "50%",
                  overflow: "hidden",
                  background: istAktiv ? "#24231F" : akzent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={istAktiv ? akzent : "#24231F"}
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {ziel.pfade}
                </svg>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
