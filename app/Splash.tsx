// app/Splash.tsx
//
// Startscreen/Splashscreen (09/2026, Pendenz "Startscreen bei jedem Öffnen
// der App, welcher nach einer bestimmten Zeit ausblendet und zur
// Homeseite übergeht"). Zeigt 2.5 Sekunden lang ein vom Nutzer selbst
// gezeichnetes Bücherregal-Bild (public/splash-buecherregal.jpg), blendet
// dann per Opacity-Übergang aus und gibt den Blick auf die darunter
// bereits gerenderte Startseite frei.
//
// Bild-Skalierung: objectFit "cover" statt "fill" — das Bild wird nur
// gleichmässig skaliert (keine Verzerrung/Streckung in x/y getrennt) und
// überschüssiger Rand wird abgeschnitten, bis der ganze Screen gefüllt
// ist. Da das Bild ein durchgehendes Regalmuster zeigt, fällt ein
// Zuschnitt an den Rändern nicht auf.
//
// Zeigt sich nur bei einem ECHTEN frischen Laden der App, nicht bei jeder
// internen Navigation: diese Komponente wird im Root-Layout gerendert
// (app/layout.tsx), das Next.js beim Wechsel zwischen Home/Lesen/
// Kernaussagen/etc. NICHT neu mountet (Layouts bleiben über Client-seitige
// Navigation hinweg bestehen) — der useEffect unten läuft also nur einmal
// pro Seitenaufruf/App-Start, exakt das gewünschte Verhalten.

"use client";

import { useEffect, useRef, useState } from "react";

// Durchschnittsfarbe am oberen Bildrand von splash-buecherregal.jpg —
// für die Statusleisten-Fläche (siehe Kommentar im Effekt unten).
const RANDFARBE = "#A4A4A4";

const HOLD_MS = 2500;
const FADE_MS = 500;

export default function Splash() {
  const [ausblenden, setAusblenden] = useState(false);
  const [sichtbar, setSichtbar] = useState(true);

  const vorherigeStatusfarbe = useRef<string | null>(null);

  useEffect(() => {
    // Bug 09/2026: ein fixed positioniertes Overlay allein deckt die
    // Statusleisten-Fläche auf iOS im Standalone-Modus nicht zuverlässig
    // ab (siehe body { padding-top: env(safe-area-inset-top) } in
    // globals.css). Robuster Fix: --status-farbe (siehe
    // StatusBarColor.tsx) für die Dauer des Splash auf die Randfarbe des
    // Bilds setzen, exakt wie es jede Seite für ihre eigene Akzentfarbe
    // tut. Vorherigen Wert merken und beim Ausblenden zurücksetzen, sonst
    // geht Homes bereits gesetzte Akzentfarbe verloren (kein erneutes
    // Mounten von StatusBarColor nach dem Splash).
    vorherigeStatusfarbe.current = document.body.style.getPropertyValue("--status-farbe") || null;
    document.body.style.setProperty("--status-farbe", RANDFARBE);

    const fadeTimer = setTimeout(() => {
      setAusblenden(true);
      if (vorherigeStatusfarbe.current) {
        document.body.style.setProperty("--status-farbe", vorherigeStatusfarbe.current);
      } else {
        document.body.style.removeProperty("--status-farbe");
      }
    }, HOLD_MS);
    const hideTimer = setTimeout(() => setSichtbar(false), HOLD_MS + FADE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!sichtbar) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: RANDFARBE,
        opacity: ausblenden ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: ausblenden ? "none" : "auto",
        overflow: "hidden",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- lokales Asset, feste Grösse per objectFit statt next/image-Optimierung nötig */}
      <img
        src="/splash-buecherregal.jpg"
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
      />
    </div>
  );
}
