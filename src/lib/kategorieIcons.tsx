// src/lib/kategorieIcons.tsx
//
// Kategorie-spezifische Icons (09/2026, Pendenz "Bibliothek: Icon pro
// Kategorie statt generisches Buch-Icon für alle") — bisher zeigte
// app/bookshelf/page.tsx (BuchIcon) für jede Kategorie dasselbe
// aufgeschlagene-Buch-Symbol, nur die Hintergrundfarbe des Badges wechselte.
// Jetzt ein eigenes Liniensymbol pro Kategorie, angelehnt an die vom Nutzer
// vorgegebene Referenz (Säule/Kopf/Balkendiagramm/Gebäude/Person+Buch/Buch/
// Setzling) — für die drei dort nicht abgedeckten Kategorien
// (Naturwissenschaft, Gesellschaft/Politik, Spiritualität) im selben
// Linienstil ergänzt (Kolben, Globus, Sonne). Reine, serverkompatible
// Komponente ohne Client-Interaktivität — direkt in Server Components
// wie app/bookshelf/page.tsx nutzbar.

import type { CSSProperties } from "react";

function KategorieIconInhalt({ kategorie }: { kategorie: string }) {
  switch (kategorie) {
    case "philosophie":
      // Säule (dorische Ordnung)
      return (
        <>
          <line x1="5" y1="5" x2="19" y2="5" />
          <line x1="8" y1="5" x2="8" y2="18" />
          <line x1="16" y1="5" x2="16" y2="18" />
          <line x1="5" y1="18" x2="19" y2="18" />
        </>
      );
    case "psychologie":
      // Kopfprofil mit angedeutetem Gehirn
      return (
        <>
          <path d="M8 19v-2.3c-2-1-3.3-3-3.3-5.4C4.7 7.7 8 5 12 5c3.6 0 6.6 2.4 7.1 5.6.5.1.9.5.9 1.1 0 .7-.5 1.2-1.1 1.3-.4 1.8-1.6 3.3-3.2 4.1V19" />
          <path d="M9 9.8c1-.9 2-.9 3 0" />
        </>
      );
    case "wirtschaft_business":
      // Balkendiagramm mit Aufwärtspfeil
      return (
        <>
          <line x1="4.5" y1="19" x2="4.5" y2="15" />
          <line x1="9.5" y1="19" x2="9.5" y2="12" />
          <line x1="14.5" y1="19" x2="14.5" y2="9" />
          <path d="M14.5 9 19 5" />
          <path d="M15.3 5 19 5 19 8.7" />
        </>
      );
    case "geschichte":
      // Antikes Gebäude (Giebel + Säulen)
      return (
        <>
          <path d="M5 10 12 5 19 10" />
          <line x1="5" y1="10" x2="19" y2="10" />
          <line x1="7" y1="10" x2="7" y2="17" />
          <line x1="10.5" y1="10" x2="10.5" y2="17" />
          <line x1="13.5" y1="10" x2="13.5" y2="17" />
          <line x1="17" y1="10" x2="17" y2="17" />
          <line x1="5" y1="19" x2="19" y2="19" />
        </>
      );
    case "naturwissenschaft":
      // Erlenmeyerkolben
      return (
        <>
          <path d="M9.5 4.5h5" />
          <path d="M10.3 4.5v4.7L5.8 17a1.8 1.8 0 0 0 1.6 2.7h9.2a1.8 1.8 0 0 0 1.6-2.7l-4.5-7.8V4.5" />
          <path d="M8.2 15h7.6" />
        </>
      );
    case "gesellschaft_politik":
      // Globus
      return (
        <>
          <circle cx="12" cy="12" r="7" />
          <path d="M5 12h14" />
          <path d="M12 5c2.2 2 3.4 4.4 3.4 7s-1.2 5-3.4 7c-2.2-2-3.4-4.4-3.4-7s1.2-5 3.4-7Z" />
        </>
      );
    case "biografie_memoir":
      // Person
      return (
        <>
          <circle cx="12" cy="7" r="2.4" />
          <path d="M7.5 19v-1.8c0-2.6 2-4.7 4.5-4.7s4.5 2.1 4.5 4.7V19" />
          <line x1="8.5" y1="19" x2="15.5" y2="19" />
        </>
      );
    case "literatur_klassiker":
      // Aufgeschlagenes Buch (bisheriges generisches Icon, jetzt fest dieser
      // Kategorie zugeordnet)
      return (
        <>
          <path d="M12 6.5c-1.8-1.3-4.2-1.8-6.5-1.3v11c2.3-.5 4.7 0 6.5 1.3 1.8-1.3 4.2-1.8 6.5-1.3v-11c-2.3-.5-4.7 0-6.5 1.3Z" />
          <path d="M12 6.5v11" />
        </>
      );
    case "spiritualitaet_sinnfragen":
      // Sonne (Sinnbild für Einsicht/Erleuchtung)
      return (
        <>
          <circle cx="12" cy="12" r="3.6" />
          <path d="M12 4.5v2" />
          <path d="M12 17.5v2" />
          <path d="M4.5 12h2" />
          <path d="M17.5 12h2" />
          <path d="M6.8 6.8 8.2 8.2" />
          <path d="M15.8 15.8 17.2 17.2" />
          <path d="M6.8 17.2 8.2 15.8" />
          <path d="M15.8 8.2 17.2 6.8" />
        </>
      );
    case "persoenliche_entwicklung":
      // Setzling/Sprössling
      return (
        <>
          <path d="M12 19v-6" />
          <path d="M12 13c0-2.8 2.2-5 5-5 0 2.8-2.2 5-5 5Z" />
          <path d="M12 15c0-2.2-1.8-4-4-4 0 2.2 1.8 4 4 4Z" />
        </>
      );
    default:
      // Fallback: aufgeschlagenes Buch (bisheriges generisches Icon)
      return (
        <>
          <path d="M12 6.5c-1.8-1.3-4.2-1.8-6.5-1.3v11c2.3-.5 4.7 0 6.5 1.3 1.8-1.3 4.2-1.8 6.5-1.3v-11c-2.3-.5-4.7 0-6.5 1.3Z" />
          <path d="M12 6.5v11" />
        </>
      );
  }
}

export function KategorieIcon({
  kategorie,
  size = 16,
  stroke = "#24231F",
  strokeWidth = 1.6,
  style,
}: {
  kategorie: string;
  size?: number;
  stroke?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <KategorieIconInhalt kategorie={kategorie} />
    </svg>
  );
}
