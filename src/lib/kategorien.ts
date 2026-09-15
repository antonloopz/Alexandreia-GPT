// src/lib/kategorien.ts
//
// Zentrale Kategorie-Metadaten (Farbe + deutsches Label), geteilt von
// allen Screens. Farben entsprechen exakt der Palette im Moodboard.

export const KATEGORIE_FARBE: Record<string, string> = {
  philosophie: "#C9C4DC",
  psychologie: "#BFD2DE",
  wirtschaft_business: "#E6D2A0",
  geschichte: "#E5B8A1",
  naturwissenschaft: "#C8DAC5",
  gesellschaft_politik: "#B7C6D2",
  biografie_memoir: "#DDBABC",
  literatur_klassiker: "#B7D5CE",
  spiritualitaet_sinnfragen: "#D5C0D3",
  persoenliche_entwicklung: "#E6D39F",
};

export const KATEGORIE_LABEL: Record<string, string> = {
  philosophie: "Philosophie",
  psychologie: "Psychologie",
  wirtschaft_business: "Wirtschaft",
  geschichte: "Geschichte",
  naturwissenschaft: "Naturwissenschaft",
  gesellschaft_politik: "Gesellschaft/Politik",
  biografie_memoir: "Biografie",
  literatur_klassiker: "Literatur/Klassiker",
  spiritualitaet_sinnfragen: "Spiritualität",
  persoenliche_entwicklung: "Pers. Entwicklung",
};

// Kurzhelfer für die Kategorie-Chips, geteilt von app/buecherliste/page.tsx,
// app/bookshelf/page.tsx und app/notizen/page.tsx (vorher dreifach
// dupliziert — Pendenz "Code-Dopplung bereinigen: hexZuRgba /
// kategorieChipStyle", 09/2026). KATEGORIE_FARBE liefert volle Hex-Farben,
// für den abgeschwächten "inaktiv"-Zustand der Chips wird davon eine
// transparente Variante gebraucht.
export function hexZuRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function kategorieChipStyle(aktiv: boolean, farbe?: string) {
  return {
    display: "inline-flex" as const,
    alignItems: "center" as const,
    gap: 6,
    padding: "6px 12px",
    borderRadius: 999,
    fontFamily: "Helvetica, Arial, sans-serif",
    fontWeight: 600,
    fontSize: 14.5,
    background: farbe ? hexZuRgba(farbe, aktiv ? 0.9 : 0.16) : aktiv ? "#24231F" : "rgba(36,35,31,.08)",
    color: farbe ? "rgba(36,35,31,.85)" : aktiv ? "#FBFAF7" : "rgba(36,35,31,.75)",
  };
}
