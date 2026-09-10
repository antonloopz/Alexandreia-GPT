// app/NavKreise.tsx
//
// Vier-Kacheln-Navigation zwischen den Hauptscreens eines Buchs (Lesen,
// Kernaussagen, Lernkarten, Quiz). Quadrate mit stark abgerundeten Ecken
// statt echter Kreise (09/2026, Pendenz "Design Kreisbuttons"), gleiche
// Grösse wie zuvor (56px), dünnerer Rahmen (1px, zuvor 5px). Aktiver
// Screen: Kachel schwarz gefüllt, Icon in Kategoriefarbe. Inaktive
// Screens: Kachel in Kategoriefarbe, Icon schwarz — exakt die Farblogik
// der vorherigen Kreise, nur mit neuer Form.
//
// Beim Laden der jeweils aktiven Seite füllt sich deren Kachel animiert
// von unten mit Schwarz, statt sofort im Endzustand zu erscheinen (daher
// "use client": der Übergang wird per useEffect nach dem Mount
// ausgelöst). Ein Übergang ÜBER die Seitennavigation hinweg — die
// vorherige Kachel sichtbar "leert" sich beim Verlassen — ist damit NICHT
// möglich, da Lesen/Kernaussagen/Lernkarten/Quiz separate Routen sind und
// bei jeder Navigation neu gemountet werden; dafür bräuchte es ein
// gemeinsames Layout über alle vier Routen hinweg (nicht Teil dieser
// Änderung).

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Ziel = "lesen" | "kernaussagen" | "lernkarten" | "quiz";

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
    schluessel: "lernkarten",
    hrefPraefix: "/lernkarten",
    pfade: (
      <>
        <path d="M9.7 5.4c-1.7-.5-3.4.6-3.7 2.3-.1.5 0 1 .1 1.4-1.2.6-1.7 2-1.1 3.2.3.6.8 1 1.3 1.3-.3.6-.3 1.3.1 1.9.6 1 1.9 1.3 2.9.7" />
        <path d="M14.3 5.4c1.7-.5 3.4.6 3.7 2.3.1.5 0 1-.1 1.4 1.2.6 1.7 2 1.1 3.2-.3.6-.8 1-1.3 1.3.3.6.3 1.3-.1 1.9-.6 1-1.9 1.3-2.9.7" />
        <path d="M9.2 8.6c1.9-1.5 3.7-1.5 5.6 0" />
        <path d="M12 8v9.5" />
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
  // Startet immer im Ruhezustand (Kategoriefarbe, schwarzes Icon) und
  // schaltet erst einen Frame nach dem Mount auf "eingefüllt" um, damit
  // die aktive Kachel sichtbar von unten mit Schwarz einfüllt statt
  // direkt im Endzustand zu erscheinen.
  const [eingefuellt, setEingefuellt] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEingefuellt(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      {ZIELE.map((ziel) => {
        const istAktiv = ziel.schluessel === aktiv && eingefuellt;
        return (
          <Link key={ziel.schluessel} href={`${ziel.hrefPraefix}/${buchinhaltId}`}>
            <div style={{ position: "relative", width: 56, height: 56 }}>
              {/* Rahmen als eigene Ebene, getrennt vom Clipping-Container
                  darunter — border + overflow:hidden + border-radius auf
                  demselben Element lässt in Safari/WebKit sonst einen
                  1px-Spalt an den Ecken frei, durch den der Hintergrund
                  durchschimmert (siehe Bugreport 09/2026). */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 22,
                  border: "1px solid #24231F",
                  boxSizing: "border-box",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 1,
                  borderRadius: 21,
                  overflow: "hidden",
                  background: akzent,
                }}
              >
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: istAktiv ? "100%" : "0%",
                    background: "#24231F",
                    transition: "height .45s cubic-bezier(.4,0,.2,1)",
                  }}
                />
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#24231F"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    opacity: istAktiv ? 0 : 1,
                    transition: "opacity .3s ease .08s",
                  }}
                >
                  {ziel.pfade}
                </svg>
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={akzent}
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    opacity: istAktiv ? 1 : 0,
                    transition: "opacity .3s ease .08s",
                  }}
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
