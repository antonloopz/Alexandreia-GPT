// app/einstellungen/lesemodus/LesemodusClient.tsx
//
// Bedienung des Lesemodus (09/2026): Schriftgrösse (5 Stufen),
// Zeilenabstand (3 Stufen), Schriftart (Helvetica / Serif) — jeweils als
// Chips, jede Änderung sofort gespeichert (optimistisch wie
// BuchBewertung.tsx) und in der Vorschau darunter direkt sichtbar. Die
// Vorschau nutzt dieselben Lesetext-Stile wie die Lese-Screens.

"use client";

import { useState, useTransition } from "react";
import {
  GROESSEN_PX,
  LESETEXT,
  SCHRIFT_LABEL,
  SCHRIFTEN,
  STANDARD_LESEMODUS,
  ZEILEN_LABEL,
  ZEILENABSTAENDE,
  leseVariablen,
  type Lesemodus,
  type Schrift,
  type Zeilenabstand,
} from "../../../src/lib/lesemodus";
import { kategorieChipStyle } from "../../../src/lib/kategorien";
import { lesemodusSpeichern } from "./actions";

const LABEL: React.CSSProperties = {
  fontFamily: "Helvetica, Arial, sans-serif",
  fontWeight: 700,
  fontSize: 14,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "rgba(36,35,31,.6)",
};

export default function LesemodusClient({ initial }: { initial: Lesemodus }) {
  const [modus, setModus] = useState<Lesemodus>(initial);
  const [fehler, setFehler] = useState(false);
  const [, startTransition] = useTransition();

  function aendern(aenderung: Partial<Lesemodus>) {
    const vorher = modus;
    const neu = { ...modus, ...aenderung };
    setModus(neu);
    setFehler(false);
    startTransition(async () => {
      try {
        await lesemodusSpeichern(neu);
      } catch (e) {
        console.error("Lesemodus konnte nicht gespeichert werden:", e);
        setModus(vorher);
        setFehler(true);
      }
    });
  }

  const istStandard =
    modus.groesse === STANDARD_LESEMODUS.groesse &&
    modus.zeilen === STANDARD_LESEMODUS.zeilen &&
    modus.schrift === STANDARD_LESEMODUS.schrift;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={LABEL}>Schriftgrösse</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {GROESSEN_PX.map((px, i) => (
            <button
              key={px}
              onClick={() => aendern({ groesse: i })}
              aria-label={`${px} Pixel`}
              style={{ ...kategorieChipStyle(modus.groesse === i), border: "none", cursor: "pointer", minWidth: 44, justifyContent: "center" }}
            >
              <span style={{ fontSize: 11 + i * 2.5, lineHeight: 1 }}>A</span>
            </button>
          ))}
          <span style={{ fontSize: 13.5, color: "rgba(36,35,31,.55)", marginLeft: 4 }}>{GROESSEN_PX[modus.groesse]} px</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={LABEL}>Zeilenabstand</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(Object.keys(ZEILENABSTAENDE) as Zeilenabstand[]).map((z) => (
            <button
              key={z}
              onClick={() => aendern({ zeilen: z })}
              style={{ ...kategorieChipStyle(modus.zeilen === z), border: "none", cursor: "pointer" }}
            >
              {ZEILEN_LABEL[z]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={LABEL}>Schrift</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(Object.keys(SCHRIFTEN) as Schrift[]).map((s) => (
            <button
              key={s}
              onClick={() => aendern({ schrift: s })}
              style={{ ...kategorieChipStyle(modus.schrift === s), border: "none", cursor: "pointer", fontFamily: SCHRIFTEN[s] }}
            >
              {SCHRIFT_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={LABEL}>Vorschau</span>
        <div
          style={{
            ...leseVariablen(modus),
            boxSizing: "border-box",
            padding: "16px 18px",
            borderRadius: 14,
            background: "var(--paper-alt)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <span style={LESETEXT}>
            Marc Aurel schrieb seine Selbstbetrachtungen nicht für ein Publikum, sondern als tägliche Übung: Er
            erinnert sich daran, was in seiner Macht steht und was nicht.
          </span>
          <span style={LESETEXT}>
            Gerade diese Unterscheidung macht das Buch bis heute lesenswert — sie verlangt keine Weltflucht,
            sondern einen klaren Blick auf das, was man selbst beeinflussen kann.
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: 13.5, color: fehler ? "#9B2C2C" : "rgba(36,35,31,.55)" }}>
          {fehler ? "Speichern fehlgeschlagen — bitte nochmals versuchen." : "Gilt für Lesen, Kernaussagen und Konzepte."}
        </span>
        {!istStandard && (
          <button
            onClick={() => aendern(STANDARD_LESEMODUS)}
            style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: "#24231F", textDecoration: "underline" }}
          >
            Standard
          </button>
        )}
      </div>
    </div>
  );
}
