// app/wiederholung/sitzung/SitzungClient.tsx
//
// Client Component: eine fällige Karte auf einmal, bücherübergreifend.
// Gleiches Muster wie LernkartenClient (Frage+Antwort zusammen sichtbar,
// 3 Bewertungs-Chips), aber neutrale Papierfarbe statt Kategoriefarbe, da
// eine Sitzung mehrere Bücher/Kategorien mischen kann. Nutzt dieselbe
// Server Action wie die Lernkarten-Bewertung (bewertungSpeichern) — die
// repetitionselemente-Logik ist identisch, nur die Quelle der fälligen
// Karten unterscheidet sich.
//
// 09/2026, Pendenz "Notizen/Hervorhebungen optional in die Wiederholung
// aufnehmen": eine Sitzung kann jetzt zwei Kartentypen mischen — die
// klassische Lernkarte (Frage/Antwort, automatisch aus einer Kernaussage
// erzeugt) UND eine vom Nutzer selbst hinzugefügte Hervorhebung (Zitat +
// optionale eigene Notiz). Beide nutzen dieselben 3 Bewertungs-Chips, aber
// unterschiedliche Server Actions zum Speichern (die Fälligkeits-Logik
// selbst ist identisch, nur der Fremdschlüssel unterscheidet sich).

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { bewertungSpeichern, hervorhebungBewertungSpeichern } from "../../lernkarten/[id]/actions";
import MenuButton from "../../MenuButton";

export type Karte =
  | { typ: "lernkarte"; kernaussageId: string; titel: string; frage: string; antwort: string }
  | { typ: "hervorhebung"; notizId: string; titel: string; textAuszug: string; text: string | null };
type Bewertung = "nicht_gewusst" | "unsicher" | "gewusst";

function FeldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "Helvetica, Arial, sans-serif",
        fontWeight: 700,
        fontSize: 14,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: "rgba(36,35,31,.6)",
      }}
    >
      {children}
    </span>
  );
}

export default function SitzungClient({ karten }: { karten: Karte[] }) {
  const [index, setIndex] = useState(0);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const aktuelle = karten[index];
  const istLetzte = index === karten.length - 1;

  function bewerten(bewertung: Bewertung) {
    startTransition(() => {
      if (aktuelle.typ === "lernkarte") {
        bewertungSpeichern(aktuelle.kernaussageId, bewertung);
      } else {
        hervorhebungBewertungSpeichern(aktuelle.notizId, bewertung);
      }
    });
    if (istLetzte) {
      router.push("/");
    } else {
      setIndex((i) => i + 1);
    }
  }

  return (
    <main
      style={{
        width: "100%",
        minHeight: "100dvh",
        boxSizing: "border-box",
        padding: 16,
        background: "var(--paper)",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        color: "var(--ink)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/wiederholung" aria-label="Schliessen">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </Link>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Wiederholung</span>
        </div>
      </div>
      <MenuButton />

      <span
        style={{
          fontFamily: "Helvetica, Arial, sans-serif",
          fontWeight: 600,
          fontSize: 13,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "rgba(36,35,31,.62)",
        }}
      >
        {aktuelle.titel}
      </span>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {karten.map((_, i) => (
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
        <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 600, fontSize: 14, color: "rgba(36,35,31,.7)" }}>
          {index + 1} / {karten.length}
        </span>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div
          style={{
            borderRadius: 18,
            padding: 24,
            background: "linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.05)), var(--paper)",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {aktuelle.typ === "lernkarte" ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <FeldLabel>Frage</FeldLabel>
                <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 21, lineHeight: 1.35 }}>
                  {aktuelle.frage}
                </span>
              </div>
              <div style={{ height: 1.5, background: "rgba(36,35,31,.15)" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <FeldLabel>Antwort</FeldLabel>
                <span style={{ fontSize: 17, lineHeight: 1.5 }}>{aktuelle.antwort}</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <FeldLabel>Hervorhebung</FeldLabel>
                <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 20, lineHeight: 1.4, fontStyle: "italic" }}>
                  „{aktuelle.textAuszug}“
                </span>
              </div>
              {aktuelle.text && (
                <>
                  <div style={{ height: 1.5, background: "rgba(36,35,31,.15)" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <FeldLabel>Notiz</FeldLabel>
                    <span style={{ fontSize: 17, lineHeight: 1.5 }}>{aktuelle.text}</span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <BewertungsChip label="Nicht gewusst" onClick={() => bewerten("nicht_gewusst")} />
        <BewertungsChip label="Unsicher" onClick={() => bewerten("unsicher")} />
        <BewertungsChip label="Gewusst" onClick={() => bewerten("gewusst")} />
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
        fontSize: 14.5,
        color: "#24231F",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
