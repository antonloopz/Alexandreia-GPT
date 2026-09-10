// app/einstellungen/EinstellungenClient.tsx
//
// Client Component nur für die beiden Export-Toggles (Rest der Seite ist
// statisch, bleibt im Server Component). Optimistisches UI-Update, Server
// Action läuft im Hintergrund.

"use client";

import { useState, useTransition } from "react";
import { ankiExportUmschalten, obsidianExportUmschalten } from "./actions";

const zeileStil: React.CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  padding: "14px 16px",
  borderRadius: 14,
  background: "linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.05)), var(--paper)",
  border: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  cursor: "pointer",
  textAlign: "left",
};

export default function EinstellungenClient({
  obsidianAktiv,
  ankiAktiv,
}: {
  obsidianAktiv: boolean;
  ankiAktiv: boolean;
}) {
  const [obsidian, setObsidian] = useState(obsidianAktiv);
  const [anki, setAnki] = useState(ankiAktiv);
  const [, startTransition] = useTransition();

  function obsidianUmschalten() {
    const neu = !obsidian;
    setObsidian(neu);
    startTransition(() => {
      obsidianExportUmschalten(neu);
    });
  }

  function ankiUmschalten() {
    const neu = !anki;
    setAnki(neu);
    startTransition(() => {
      ankiExportUmschalten(neu);
    });
  }

  return (
    <>
      <button onClick={obsidianUmschalten} style={zeileStil}>
        <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 16.5, color: "#24231F" }}>
          Obsidian-Export
        </span>
        <Toggle aktiv={obsidian} />
      </button>
      <button onClick={ankiUmschalten} style={zeileStil}>
        <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 16.5, color: "#24231F" }}>
          Anki-Export
        </span>
        <Toggle aktiv={anki} />
      </button>
    </>
  );
}

function Toggle({ aktiv }: { aktiv: boolean }) {
  return (
    <div
      style={{
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
      <div
        style={{
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
    </div>
  );
}
