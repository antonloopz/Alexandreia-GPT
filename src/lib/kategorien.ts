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
