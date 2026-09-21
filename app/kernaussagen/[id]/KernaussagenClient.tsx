// app/kernaussagen/[id]/KernaussagenClient.tsx
//
// Client Component: eine Kernaussage auf einmal, mit Fortschritts-Punkten
// + Zähler, wie im Kernaussagen.dc.html-Mockup. Kein Seitenwechsel pro
// Schritt — lokaler State, nur der letzte Schritt navigiert weiter zum
// Quiz (09/2026: vorher zu Lernkarten, inzwischen entfernt).

"use client";

import { useState } from "react";
import Link from "next/link";
import MenuButton from "../../MenuButton";
import NavKreise from "../../NavKreise";
import StatusBarColor from "../../StatusBarColor";
import Hervorhebbarer, { type Hervorhebung } from "../../lesen/[id]/Hervorhebbarer";
import type { NotizFeld } from "../../../src/lib/notizen";
import type { Wissensstatus, WissensstatusWert } from "../../../src/db/schema";

type Kernaussage = {
  id: string;
  text: string;
  erklaerung: string;
  beispiel: string | null;
  wissensstatus: Wissensstatus | null;
};

// Wissensstatus pro Kernaussage (09/2026, Schicht "Wissensstatus" — siehe
// CLAUDE.md): was die heutige Forschung zu genau dieser Aussage sagt. Nur
// vorhanden, wenn in Stufe 3 mit Quelle belegt.
const WISSENSSTATUS_LABEL: Record<WissensstatusWert, string> = {
  belegt: "Belegt",
  umstritten: "Umstritten",
  ueberholt: "Überholt",
  unklar: "Forschungslage unklar",
};

// Rohzeile aus der DB (app/kernaussagen/[id]/page.tsx) — inWiederholung ist
// dort bereits aus repetitionselemente vorberechnet, kernaussageId/feld
// bleiben roh, damit hier pro Kernaussage+Feld gefiltert werden kann
// (mehrere Kernaussagen teilen sich sonst dasselbe feld).
type HervorhebungRoh = {
  id: string;
  kernaussageId: string | null;
  feld: string | null;
  textAuszug: string | null;
  text: string | null;
  inWiederholung: boolean;
};

export default function KernaussagenClient({
  buchinhaltId,
  titel,
  akzent,
  kategorieLabel,
  kernaussagenLabel,
  kernaussagen,
  hervorhebungen,
}: {
  buchinhaltId: string;
  titel: string;
  akzent: string;
  kategorieLabel: string;
  // 09/2026, Pendenz "Kernaussagen-Funktion überdenken: passt nicht für
  // alle Kategorien" — server-seitig aus KERNAUSSAGEN_LABEL vorberechnet
  // (kategorien.ts), damit dieser Screen nicht bei jeder Kategorie
  // pauschal von "Kernaussagen" spricht.
  kernaussagenLabel: { einzeln: string; mehrzahl: string };
  kernaussagen: Kernaussage[];
  hervorhebungen: HervorhebungRoh[];
}) {
  const [index, setIndex] = useState(0);
  const aktuelle = kernaussagen[index];
  const istLetzte = index === kernaussagen.length - 1;

  // Hervorhebungen dieser EINEN Kernaussage, getrennt nach Text/Erklärung
  // (09/2026, Pendenz "Hervorhebungen auch auf Kernaussagen erlauben") —
  // gleiches Muster wie nachFeld() in app/lesen/[id]/page.tsx.
  const nachFeld = (feld: NotizFeld): Hervorhebung[] =>
    hervorhebungen
      .filter((h) => h.kernaussageId === aktuelle.id && h.feld === feld && h.textAuszug)
      .map((h) => ({
        id: h.id,
        textAuszug: h.textAuszug as string,
        text: h.text,
        inWiederholung: h.inWiederholung,
      }));

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
          <Link href={`/lesen/${buchinhaltId}`} aria-label="Zurück">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 5.5 8 12l6.5 6.5" />
            </svg>
          </Link>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>{kernaussagenLabel.mehrzahl}</span>
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
        {titel} — {kategorieLabel}
      </span>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {kernaussagen.map((_, i) => (
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
          {index + 1} / {kernaussagen.length}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "safe center", gap: 16, overflowY: "auto" }}>
        <span
          style={{
            fontFamily: "Helvetica, Arial, sans-serif",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: ".04em",
            textTransform: "uppercase",
            color: "rgba(36,35,31,.7)",
          }}
        >
          {kernaussagenLabel.einzeln} {index + 1}
        </span>
        <Hervorhebbarer
          key={`${aktuelle.id}-text`}
          text={aktuelle.text}
          buchinhaltId={buchinhaltId}
          feld="kernaussage_text"
          kernaussageId={aktuelle.id}
          bestehende={nachFeld("kernaussage_text")}
          akzent={akzent}
          style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 29, lineHeight: 1.2 }}
        />
        <Hervorhebbarer
          key={`${aktuelle.id}-erklaerung`}
          text={aktuelle.erklaerung}
          buchinhaltId={buchinhaltId}
          feld="kernaussage_erklaerung"
          kernaussageId={aktuelle.id}
          bestehende={nachFeld("kernaussage_erklaerung")}
          akzent={akzent}
          style={{ fontSize: 18, lineHeight: 1.6 }}
        />
        {/* Beispiel zur Kernaussage (09/2026) — nur bei Kernaussagen, die
            eins haben (ältere nicht). Bewusst nicht hervorhebbar: das
            bräuchte einen neuen Wert im notizFeld-Enum. */}
        {aktuelle.beispiel && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              borderLeft: "2px solid rgba(36,35,31,.35)",
              paddingLeft: 12,
            }}
          >
            <span
              style={{
                fontFamily: "Helvetica, Arial, sans-serif",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "rgba(36,35,31,.55)",
              }}
            >
              Beispiel
            </span>
            <span style={{ fontSize: 16, lineHeight: 1.55, color: "rgba(36,35,31,.8)" }}>{aktuelle.beispiel}</span>
          </div>
        )}
        {aktuelle.wissensstatus && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              boxSizing: "border-box",
              padding: "10px 12px",
              borderRadius: 12,
              background: "rgba(36,35,31,.07)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "rgba(36,35,31,.55)",
                }}
              >
                Forschung heute
              </span>
              <span
                style={{
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: "#24231F",
                  color: "#FBFAF7",
                }}
              >
                {WISSENSSTATUS_LABEL[aktuelle.wissensstatus.status] ?? aktuelle.wissensstatus.status}
              </span>
            </div>
            <span style={{ fontSize: 15, lineHeight: 1.5, color: "rgba(36,35,31,.8)" }}>
              {aktuelle.wissensstatus.begruendung}
            </span>
            {aktuelle.wissensstatus.quellen.map((q) => (
              <a
                key={q.url}
                href={q.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 13.5, lineHeight: 1.4, color: "rgba(36,35,31,.7)", textDecoration: "underline", overflowWrap: "anywhere" }}
              >
                {q.titel}
              </a>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {istLetzte ? (
            <Link href={`/quiz/${buchinhaltId}`} aria-label="Weiter zu Quiz">
              <WeiterButton akzent={akzent} />
            </Link>
          ) : (
            <button
              onClick={() => setIndex((i) => i + 1)}
              aria-label="Nächste Kernaussage"
              style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}
            >
              <WeiterButton akzent={akzent} />
            </button>
          )}
        </div>
        <NavKreise buchinhaltId={buchinhaltId} akzent={akzent} aktiv="kernaussagen" />
      </div>
    </main>
  );
}

function WeiterButton({ akzent }: { akzent: string }) {
  return (
    <div
      style={{
        width: 56,
        height: 32,
        borderRadius: 999,
        background: "#24231F",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={akzent} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.5 5.5 16 12l-6.5 6.5" />
      </svg>
    </div>
  );
}
