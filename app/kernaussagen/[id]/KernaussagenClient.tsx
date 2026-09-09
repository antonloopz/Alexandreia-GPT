// app/kernaussagen/[id]/KernaussagenClient.tsx
//
// Client Component: eine Kernaussage auf einmal, mit Fortschritts-Punkten
// + Zähler, wie im Kernaussagen.dc.html-Mockup. Kein Seitenwechsel pro
// Schritt — lokaler State, nur der letzte Schritt navigiert weiter zu
// Lernkarten.

"use client";

import { useState } from "react";
import Link from "next/link";
import MenuButton from "../../MenuButton";
import NavKreise from "../../NavKreise";
import StatusBarColor from "../../StatusBarColor";

type Kernaussage = { text: string; erklaerung: string };

export default function KernaussagenClient({
  buchinhaltId,
  titel,
  akzent,
  kategorieLabel,
  kernaussagen,
}: {
  buchinhaltId: string;
  titel: string;
  akzent: string;
  kategorieLabel: string;
  kernaussagen: Kernaussage[];
}) {
  const [index, setIndex] = useState(0);
  const aktuelle = kernaussagen[index];
  const istLetzte = index === kernaussagen.length - 1;

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
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 20 }}>Kernaussagen</span>
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
        <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 600, fontSize: 12, color: "rgba(36,35,31,.7)" }}>
          {index + 1} / {kernaussagen.length}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16, overflowY: "auto" }}>
        <span
          style={{
            fontFamily: "Helvetica, Arial, sans-serif",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: ".04em",
            textTransform: "uppercase",
            color: "rgba(36,35,31,.7)",
          }}
        >
          Kernaussage {index + 1}
        </span>
        <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 27, lineHeight: 1.2 }}>
          {aktuelle.text}
        </span>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6 }}>{aktuelle.erklaerung}</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {istLetzte ? (
            <Link href={`/lernkarten/${buchinhaltId}`} aria-label="Weiter zu Lernkarten">
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
