// app/abschluss/[id]/BuchBewertung.tsx
//
// Client Component für das Buch-Feedback auf dem Abschluss-Screen (09/2026,
// Buch-Bewertung Phase 1): Buchwert "Stark · Solide · Schwach" plus die
// zwei Schalter "Im Original lesen" und "Aufbereitung war schwach" — drei
// bewusst getrennte Angaben, siehe gezeigteBuecher in src/db/schema.ts.
// Jedes Antippen speichert sofort (optimistisch, wie der Obsidian-Toggle in
// app/einstellungen/EinstellungenClient.tsx); schlägt das Speichern fehl,
// springt die Anzeige zurück, ohne den Nutzer zu blockieren. Erneutes
// Antippen der gewählten Stufe setzt die Bewertung wieder auf "unbewertet".

"use client";

import { useState, useTransition } from "react";
import { kategorieChipStyle } from "../../../src/lib/kategorien";
import { buchFeedbackSpeichern, type BuchBewertung, type BuchFeedback } from "./actions";

const STUFEN: { wert: BuchBewertung; label: string }[] = [
  { wert: "stark", label: "Stark" },
  { wert: "solide", label: "Solide" },
  { wert: "schwach", label: "Schwach" },
];

export default function BuchBewertungAuswahl({
  buchinhaltId,
  initial,
  akzent,
}: {
  buchinhaltId: string;
  initial: BuchFeedback;
  akzent: string;
}) {
  const [feedback, setFeedback] = useState<BuchFeedback>(initial);
  const [, startTransition] = useTransition();

  function speichern(aenderung: Partial<BuchFeedback>) {
    // Nur die Felder merken, die dieser Tap ändert — ein Fehler setzt genau
    // diese zurück und lässt spätere (erfolgreiche) Taps unangetastet.
    const felder = Object.keys(aenderung) as (keyof BuchFeedback)[];
    const vorher: Partial<BuchFeedback> = Object.fromEntries(felder.map((k) => [k, feedback[k]]));
    setFeedback((f) => ({ ...f, ...aenderung }));
    startTransition(async () => {
      try {
        await buchFeedbackSpeichern(buchinhaltId, aenderung);
      } catch (e) {
        console.error("Buch-Feedback konnte nicht gespeichert werden:", e);
        setFeedback((f) => {
          // Feld nur zurücksetzen, wenn es noch den Wert dieses Taps trägt;
          // hat ein neuerer Tap es schon wieder geändert, gilt dessen Wert.
          const zurueck = Object.fromEntries(felder.filter((k) => f[k] === aenderung[k]).map((k) => [k, vorher[k]]));
          return { ...f, ...zurueck };
        });
      }
    });
  }

  const zeileStil: React.CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    padding: "10px 14px",
    borderRadius: 14,
    background: `linear-gradient(rgba(0,0,0,.07),rgba(0,0,0,.07)), ${akzent}`,
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    textAlign: "left",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
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
        Dein Eindruck
      </span>

      <div role="radiogroup" aria-label="Wie wertvoll war das Buch?" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {STUFEN.map((s) => {
          const aktiv = feedback.buchBewertung === s.wert;
          return (
            <button
              key={s.wert}
              role="radio"
              aria-checked={aktiv}
              onClick={() => speichern({ buchBewertung: aktiv ? null : s.wert })}
              style={{ ...kategorieChipStyle(aktiv), border: "none", cursor: "pointer" }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <button
        role="switch"
        aria-checked={feedback.imOriginalLesen}
        onClick={() => speichern({ imOriginalLesen: !feedback.imOriginalLesen })}
        style={zeileStil}
      >
        <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 15.5, color: "#24231F" }}>
          Im Original lesen
        </span>
        <Toggle aktiv={feedback.imOriginalLesen} />
      </button>

      <button
        role="switch"
        aria-checked={feedback.aufbereitungSchwach}
        onClick={() => speichern({ aufbereitungSchwach: !feedback.aufbereitungSchwach })}
        style={zeileStil}
      >
        <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 15.5, color: "#24231F" }}>
          Aufbereitung war schwach
        </span>
        <Toggle aktiv={feedback.aufbereitungSchwach} />
      </button>
    </div>
  );
}

// Gleiche Optik wie der (lokale, nicht exportierte) Toggle in
// app/einstellungen/EinstellungenClient.tsx — bewusst dupliziert statt
// verschoben, um die Einstellungen nicht anzufassen.
function Toggle({ aktiv }: { aktiv: boolean }) {
  return (
    <span
      style={{
        display: "block",
        width: 40,
        height: 22,
        borderRadius: 999,
        background: aktiv ? "#24231F" : "none",
        border: aktiv ? "none" : "1.5px solid #24231F",
        position: "relative",
        flexShrink: 0,
        boxSizing: "border-box",
      }}
    >
      <span
        style={{
          display: "block",
          width: aktiv ? 16 : 14,
          height: aktiv ? 16 : 14,
          borderRadius: "50%",
          background: aktiv ? "#FBFAF7" : "#24231F",
          position: "absolute",
          top: aktiv ? 3 : 2.5,
          left: aktiv ? undefined : 3,
          right: aktiv ? 3 : undefined,
        }}
      />
    </span>
  );
}
