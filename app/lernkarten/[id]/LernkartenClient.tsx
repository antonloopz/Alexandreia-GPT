// app/lernkarten/[id]/LernkartenClient.tsx
//
// Client Component: eine Lernkarte auf einmal, Frage+Antwort direkt
// zusammen sichtbar (kein Flip — so auch im Lernkarten.dc.html-Mockup).
// Darunter drei gleichwertige Bewertungs-Chips statt eines einzelnen
// Weiter-Buttons, da hier eine 3-Wege-Entscheidung getroffen wird. Jede
// Bewertung speichert sofort ein repetitionselemente-Update (Server Action)
// und schaltet dann zur nächsten Karte bzw. — bei der letzten — zu Quiz.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { bewertungSpeichern } from "./actions";
import MenuButton from "../../MenuButton";
import NavKreise from "../../NavKreise";
import StatusBarColor from "../../StatusBarColor";

type Lernkarte = { id: string; kernaussageId: string; frage: string; antwort: string };
type Bewertung = "nicht_gewusst" | "unsicher" | "gewusst";

export default function LernkartenClient({
  buchinhaltId,
  titel,
  akzent,
  kategorieLabel,
  lernkarten,
}: {
  buchinhaltId: string;
  titel: string;
  akzent: string;
  kategorieLabel: string;
  lernkarten: Lernkarte[];
}) {
  const [index, setIndex] = useState(0);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const aktuelle = lernkarten[index];
  const istLetzte = index === lernkarten.length - 1;

  function bewerten(bewertung: Bewertung) {
    startTransition(() => {
      bewertungSpeichern(aktuelle.kernaussageId, bewertung);
    });
    if (istLetzte) {
      router.push(`/quiz/${buchinhaltId}`);
    } else {
      setIndex((i) => i + 1);
    }
  }

  return (
    <main
      style={{
        width: "100%",
        height: "calc(100dvh - env(safe-area-inset-top, 0px))",
        boxSizing: "border-box",
        padding: 16,
        paddingBottom: 32,
        background: akzent,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        color: "var(--ink)",
        overflow: "hidden",
      }}
    >
      <StatusBarColor farbe={akzent} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/kernaussagen/${buchinhaltId}`} aria-label="Zurück">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 5.5 8 12l6.5 6.5" />
            </svg>
          </Link>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 20 }}>Lernkarten</span>
        </div>
        <MenuButton />
      </div>

      <span
        style={{
          fontFamily: "Helvetica, Arial, sans-serif",
          fontWeight: 600,
          fontSize: 11,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "rgba(36,35,31,.62)",
        }}
      >
        {titel} — {kategorieLabel}
      </span>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {lernkarten.map((_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: i <= index ? "#24231F" : "none",
                border: i <= index ? "none" : "1.5px solid #24231F",
              }}
            />
          ))}
        </div>
        <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 600, fontSize: 12, color: "rgba(36,35,31,.7)" }}>
          {index + 1} / {lernkarten.length}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", overflowY: "auto" }}>
        <div
          style={{
            borderRadius: 18,
            padding: 24,
            background: `linear-gradient(rgba(0,0,0,.07),rgba(0,0,0,.07)), ${akzent}`,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span
              style={{
                fontFamily: "Helvetica, Arial, sans-serif",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "rgba(36,35,31,.6)",
              }}
            >
              Frage
            </span>
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 19, lineHeight: 1.35 }}>
              {aktuelle.frage}
            </span>
          </div>
          <div style={{ height: 1.5, background: "rgba(36,35,31,.15)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span
              style={{
                fontFamily: "Helvetica, Arial, sans-serif",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "rgba(36,35,31,.6)",
              }}
            >
              Antwort
            </span>
            <span style={{ fontSize: 15, lineHeight: 1.5 }}>{aktuelle.antwort}</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <BewertungsChip label="Nicht gewusst" onClick={() => bewerten("nicht_gewusst")} />
          <BewertungsChip label="Unsicher" onClick={() => bewerten("unsicher")} />
          <BewertungsChip label="Gewusst" onClick={() => bewerten("gewusst")} />
        </div>

        <NavKreise buchinhaltId={buchinhaltId} akzent={akzent} aktiv="lernkarten" />
      </div>
    </main>
  );
}

function BewertungsChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        boxSizing: "border-box",
        padding: "12px 4px",
        borderRadius: 12,
        border: "1.5px solid #24231F",
        background: "none",
        textAlign: "center",
        fontFamily: "Helvetica, Arial, sans-serif",
        fontWeight: 600,
        fontSize: 12.5,
        color: "#24231F",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
