// app/Splash.tsx
//
// Startscreen/Splashscreen (09/2026, Pendenz "Startscreen bei jedem Öffnen
// der App, welcher nach einer bestimmten Zeit ausblendet und zur
// Homeseite übergeht"). Zeigt 2.5 Sekunden lang ein selbst erzeugtes
// Bücherregal-Muster (kein Stockbild/Rasterbild — vom Nutzer per Mockup
// abgenommen, siehe Claude-Artifact "Splashscreen Bücherregal"), blendet
// dann per Opacity-Übergang aus und gibt den Blick auf die darunter
// bereits gerenderte Startseite frei.
//
// Zeigt sich nur bei einem ECHTEN frischen Laden der App, nicht bei jeder
// internen Navigation: diese Komponente wird im Root-Layout gerendert
// (app/layout.tsx), das Next.js beim Wechsel zwischen Home/Lesen/
// Kernaussagen/etc. NICHT neu mountet (Layouts bleiben über Client-seitige
// Navigation hinweg bestehen) — der useEffect unten läuft also nur einmal
// pro Seitenaufruf/App-Start, exakt das gewünschte Verhalten.
//
// Zufallsmuster + Hydration: das Regal wird bewusst erst im useEffect
// (also nur im Browser, nach dem ersten Rendern) mit Math.random()
// erzeugt, nicht schon beim ersten Rendern selbst — sonst würde der
// serverseitig gerenderte Zufalls-Zustand nie exakt mit dem ersten
// Client-Rendern übereinstimmen (React-Hydration-Fehler). Bis dahin steht
// nur eine leere, weisse Fläche (identisch zur Regal-Grundfarbe) — der
// Unterschied ist nicht wahrnehmbar.

"use client";

import { useEffect, useState } from "react";
import { KATEGORIE_FARBE } from "../src/lib/kategorien";

type Form =
  | {
      art: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      fill: string;
      stroke: string;
      strokeWidth: number;
      fillOpacity?: number;
      transform?: string;
    }
  | { art: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; strokeWidth: number };

const LINIE = "#24231F";
const LINIENSTAERKE = 2;
const WEISS = "#F5F4EE";
const KATEGORIE_FARBEN = Object.values(KATEGORIE_FARBE);

const HOLD_MS = 2500;
const FADE_MS = 500;

// Rund 1 von 6 Büchern bekommt statt Weiss eine zufällige Kategoriefarbe
// bei 50% Deckkraft über dem weissen Regalgrund — wirkt dadurch immer
// heller/blasser als die Originalfarbe, nie dunkler. Kontur bei allen
// Büchern gleich: dünn und deckend schwarz.
function buchFuellung(): { fill: string; stroke: string; strokeWidth: number; fillOpacity?: number } {
  if (Math.random() < 0.16) {
    const farbe = KATEGORIE_FARBEN[Math.floor(Math.random() * KATEGORIE_FARBEN.length)];
    return { fill: farbe, fillOpacity: 0.5, stroke: LINIE, strokeWidth: LINIENSTAERKE };
  }
  return { fill: WEISS, stroke: LINIE, strokeWidth: LINIENSTAERKE };
}

function drawSpines(out: Form[], x: number, y: number, w: number, h: number) {
  let cursor = x;
  const gap = w * 0.02;
  let guard = 0;
  while (cursor < x + w - gap && guard < 40) {
    guard++;
    const remaining = x + w - cursor;
    const spineW = Math.min(remaining, w * (0.07 + Math.random() * 0.11));
    if (spineW < w * 0.035) break;
    const leaning = Math.random() < 0.07 && remaining > spineW * 1.6;
    const shortTop = Math.random() < 0.28 ? h * (0.08 + Math.random() * 0.18) : 0;
    const spineH = h - shortTop;
    const spineY = y + shortTop;
    if (leaning) {
      const rot = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 6);
      out.push({
        art: "rect",
        x: cursor,
        y: spineY,
        width: spineW,
        height: spineH,
        transform: `rotate(${rot} ${cursor + spineW / 2} ${spineY + spineH})`,
        ...buchFuellung(),
      });
      cursor += spineW * 1.6 + gap;
    } else {
      out.push({ art: "rect", x: cursor, y: spineY, width: spineW, height: spineH, ...buchFuellung() });
      cursor += spineW + gap;
    }
  }
}

function drawStack(out: Form[], x: number, y: number, w: number, h: number) {
  const books = 3 + Math.floor(Math.random() * 4);
  const barH = h / (books * 1.18);
  let cy = y + h - barH;
  for (let i = 0; i < books; i++) {
    const inset = w * Math.random() * 0.05;
    out.push({ art: "rect", x: x + inset, y: cy, width: Math.max(w - inset * 2, w * 0.6), height: barH * 0.8, ...buchFuellung() });
    cy -= barH;
  }
}

function drawMixed(out: Form[], x: number, y: number, w: number, h: number) {
  const stackW = w * (0.35 + Math.random() * 0.15);
  drawStack(out, x, y, stackW, h);
  drawSpines(out, x + stackW + w * 0.02, y, w - stackW - w * 0.02, h);
}

// Tablar/Seite als echter Körper mit sichtbarer Dicke T (nicht nur eine
// Trennlinie) — weiss gefülltes Rechteck mit dünner schwarzer Kontur, plus
// einer feinen grauen Linie darin als Kante/Schattenwurf für den
// Tiefeneindruck.
function drawBoardH(out: Form[], x: number, y: number, w: number, t: number) {
  out.push({ art: "rect", x, y, width: w, height: t, fill: WEISS, stroke: LINIE, strokeWidth: LINIENSTAERKE });
  out.push({ art: "line", x1: x, y1: y + t * 0.42, x2: x + w, y2: y + t * 0.42, stroke: "#D9D7CB", strokeWidth: LINIENSTAERKE * 0.7 });
}
function drawBoardV(out: Form[], x: number, y: number, h: number, t: number) {
  out.push({ art: "rect", x, y, width: t, height: h, fill: WEISS, stroke: LINIE, strokeWidth: LINIENSTAERKE });
  out.push({ art: "line", x1: x + t * 0.42, y1: y, x2: x + t * 0.42, y2: y + h, stroke: "#D9D7CB", strokeWidth: LINIENSTAERKE * 0.7 });
}

function buildBuecherregal(): { formen: Form[]; vbW: number; vbH: number } {
  const cols = 3;
  const rows = 9;
  const vbW = 561;
  const vbH = 953;
  const T = 14; // Dicke der Tablare/Seiten, unabhängig von LINIENSTAERKE (der feinen Konturlinie)
  const out: Form[] = [];
  out.push({ art: "rect", x: 0, y: 0, width: vbW, height: vbH, fill: WEISS, stroke: WEISS, strokeWidth: 0 });

  // Volle Waffel-/Würfelregal-Struktur: Aussenrahmen (Deckel, Boden,
  // Seiten) plus durchgehende Trennwände/Fachböden — nicht nur Zeilen oder
  // nur Spalten mit Tiefe.
  const usableH = vbH - (rows + 1) * T;
  const rowH = usableH / rows;
  const usableW = vbW - (cols + 1) * T;
  const colW = usableW / cols;

  const rowBounds: { top: number; bottom: number }[] = [];
  let cursorY = T;
  for (let r = 0; r < rows; r++) {
    rowBounds.push({ top: cursorY, bottom: cursorY + rowH });
    cursorY += rowH;
    if (r < rows - 1) {
      drawBoardH(out, T, cursorY, vbW - 2 * T, T);
      cursorY += T;
    }
  }
  drawBoardH(out, 0, 0, vbW, T);
  drawBoardH(out, 0, vbH - T, vbW, T);

  const colBounds: { left: number; right: number }[] = [];
  let cursorX = T;
  for (let c = 0; c < cols; c++) {
    colBounds.push({ left: cursorX, right: cursorX + colW });
    cursorX += colW;
    if (c < cols - 1) {
      drawBoardV(out, cursorX, T, vbH - 2 * T, T);
      cursorX += T;
    }
  }
  drawBoardV(out, 0, T, vbH - 2 * T, T);
  drawBoardV(out, vbW - T, T, vbH - 2 * T, T);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const innerX = colBounds[c].left;
      const innerY = rowBounds[r].top;
      const innerW = colBounds[c].right - colBounds[c].left;
      const innerH = rowBounds[r].bottom - rowBounds[r].top;
      const v = Math.random();
      if (v < 0.2) drawStack(out, innerX, innerY, innerW, innerH);
      else if (v < 0.32) drawMixed(out, innerX, innerY, innerW, innerH);
      else drawSpines(out, innerX, innerY, innerW, innerH);
    }
  }

  return { formen: out, vbW, vbH };
}

export default function Splash() {
  const [muster, setMuster] = useState<{ formen: Form[]; vbW: number; vbH: number } | null>(null);
  const [ausblenden, setAusblenden] = useState(false);
  const [sichtbar, setSichtbar] = useState(true);

  useEffect(() => {
    // Erzeugung erst per requestAnimationFrame anstossen (analog
    // NavKreise.tsx) statt setState synchron im Effekt-Body aufzurufen —
    // vermeidet die react-hooks/set-state-in-effect-Warnung, ändert am
    // Timing (ein Frame, unmerklich) nichts.
    const frame = requestAnimationFrame(() => setMuster(buildBuecherregal()));
    const fadeTimer = setTimeout(() => setAusblenden(true), HOLD_MS);
    const hideTimer = setTimeout(() => setSichtbar(false), HOLD_MS + FADE_MS);
    return () => {
      cancelAnimationFrame(frame);
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
        // Bug 09/2026: ein schlicht mit inset:0 positioniertes fixed-Element
        // liess oben einen Streifen in der Statusleisten-Farbe stehen (body
        // { padding-top: env(safe-area-inset-top) } aus globals.css scheint
        // im iOS-Standalone-Modus die Ausgangsposition von fixed-Elementen
        // mit zu verschieben, statt sie wie spezifiziert relativ zum reinen
        // Viewport zu berechnen — siehe bereits dokumentierter, verwandter
        // Bug im Kommentar zu body { padding-top: ... } in globals.css).
        // Fix: top/height explizit um genau diesen Versatz kompensieren,
        // statt sich auf inset:0 zu verlassen.
        top: "calc(env(safe-area-inset-top, 0px) * -1)",
        left: 0,
        right: 0,
        bottom: 0,
        height: "calc(100% + env(safe-area-inset-top, 0px))",
        zIndex: 9999,
        background: WEISS,
        opacity: ausblenden ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: ausblenden ? "none" : "auto",
      }}
    >
      {muster && (
        <svg viewBox={`0 0 ${muster.vbW} ${muster.vbH}`} preserveAspectRatio="none" width="100%" height="100%" style={{ display: "block" }}>
          {muster.formen.map((f, i) =>
            f.art === "rect" ? (
              <rect
                key={i}
                x={f.x}
                y={f.y}
                width={f.width}
                height={f.height}
                fill={f.fill}
                fillOpacity={f.fillOpacity}
                stroke={f.stroke}
                strokeWidth={f.strokeWidth}
                transform={f.transform}
              />
            ) : (
              <line key={i} x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} stroke={f.stroke} strokeWidth={f.strokeWidth} />
            )
          )}
        </svg>
      )}
    </div>
  );
}
