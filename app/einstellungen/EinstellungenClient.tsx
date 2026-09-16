// app/einstellungen/EinstellungenClient.tsx
//
// Client Component für den Obsidian-Export-Toggle plus (09/2026, Pendenz
// "Obsidian-Export für Notizen fertigstellen") das optionale Ordner-/
// Vaultname-Feld dafür (Rest der Seite bleibt statisch im Server
// Component). Optimistisches UI-Update, Server Action läuft im
// Hintergrund. Anki-Export (nie über den Schalter hinaus gebaut) wieder
// entfernt, siehe Pendenz "Anki-Exportfunktion entfernen".

"use client";

import { useRef, useState, useTransition } from "react";
import { obsidianExportUmschalten, obsidianVaultNameSpeichern } from "./actions";

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
  obsidianVaultName,
}: {
  obsidianAktiv: boolean;
  obsidianVaultName: string;
}) {
  const [obsidian, setObsidian] = useState(obsidianAktiv);
  const [, startTransition] = useTransition();

  function obsidianUmschalten() {
    const neu = !obsidian;
    setObsidian(neu);
    startTransition(() => {
      obsidianExportUmschalten(neu);
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
      {obsidian && <VaultNameFeld initial={obsidianVaultName} />}
    </>
  );
}

// Freitext-Feld für den Ordnernamen, in den die exportierten .md-Dateien im
// ZIP gelegt werden (z.B. der Name des Obsidian-Vaults oder eines
// Unterordners darin) — leer lassen, dann liegen die Dateien im ZIP-
// Wurzelverzeichnis. Speichert debounced (600ms) nach Tippende, analog dem
// Muster in app/notizen/NotizenSuche.tsx.
function VaultNameFeld({ initial }: { initial: string }) {
  const [wert, setWert] = useState(initial);
  const [gespeichert, setGespeichert] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function aktualisieren(neuerWert: string) {
    setWert(neuerWert);
    setGespeichert(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      obsidianVaultNameSpeichern(neuerWert).then(() => setGespeichert(true));
    }, 600);
  }

  return (
    <div
      style={{
        boxSizing: "border-box",
        width: "100%",
        padding: "12px 16px",
        borderRadius: 14,
        background: "linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.05)), var(--paper)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <label
        htmlFor="obsidian-vault-name"
        style={{
          fontFamily: "Helvetica, Arial, sans-serif",
          fontWeight: 600,
          fontSize: 12.5,
          letterSpacing: ".03em",
          color: "rgba(36,35,31,.6)",
        }}
      >
        Ordnername im Export (optional)
      </label>
      <input
        id="obsidian-vault-name"
        type="text"
        value={wert}
        onChange={(e) => aktualisieren(e.target.value)}
        placeholder="z.B. Bücher"
        style={{
          boxSizing: "border-box",
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid rgba(36,35,31,.18)",
          background: "var(--paper)",
          fontFamily: "Helvetica, Arial, sans-serif",
          fontSize: 15,
          color: "#24231F",
        }}
      />
      <span style={{ fontSize: 12, color: "rgba(36,35,31,.45)" }}>
        {gespeichert ? "Die .md-Dateien landen im ZIP in diesem Unterordner." : "Wird gespeichert…"}
      </span>
    </div>
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
