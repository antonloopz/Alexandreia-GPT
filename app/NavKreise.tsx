// app/NavKreise.tsx
//
// Vier-Kreis-Navigation zwischen den Hauptscreens eines Buchs (Lesen,
// Kernaussagen, Lernkarten, Quiz) — wie im Design-Canvas-Mockup (Main/
// Lesen/Kernaussagen/Lernkarten/Quiz.dc.html). Auf Home ohne aktiven
// Kreis (keiner der vier Screens ist "gerade offen"); auf jedem der vier
// Screens selbst mit dem eigenen Kreis aktiv hervorgehoben (schwarz
// gefüllt, Icon in Kategoriefarbe statt umgekehrt akzentfarben mit
// schwarzem Icon).

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
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      {ZIELE.map((ziel) => {
        const istAktiv = ziel.schluessel === aktiv;
        return (
          <Link key={ziel.schluessel} href={`${ziel.hrefPraefix}/${buchinhaltId}`}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: istAktiv ? "#24231F" : akzent,
                border: "3px solid #24231F",
                boxSizing: "border-box",
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
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {ziel.pfade}
              </svg>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
