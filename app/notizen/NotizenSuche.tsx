// app/notizen/NotizenSuche.tsx
//
// Suchfeld für die Notizen-Übersicht (09/2026, Pendenz "Suchfunktion in
// Notizen"). Bewusst als eigener Client Component: die Seite selbst bleibt
// eine Server Component (liest den ?suche=-Query-Parameter direkt aus
// searchParams, analog zum bestehenden ?kategorie=-Filter), aber Live-
// Tippen erfordert lokalen Eingabe-State — hier debounced (300ms) per
// router.replace() in die URL geschrieben, damit kein extra Klick/Enter
// nötig ist. Ein vorhandener ?kategorie=-Filter bleibt beim Tippen erhalten.

"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function NotizenSuche({ initial }: { initial: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [wert, setWert] = useState(initial);
  // Hält den Eingabe-State synchron, falls sich die URL von aussen ändert
  // (z.B. Zurück-Navigation im Browser) — bewusst OHNE useEffect: React
  // empfiehlt für "State bei Prop-Änderung anpassen" den Vergleich direkt
  // im Render statt eines Effekts (vermeidet einen zusätzlichen Render-
  // Durchlauf, siehe react-hooks/set-state-in-effect).
  const [vorherigesInitial, setVorherigesInitial] = useState(initial);
  if (initial !== vorherigesInitial) {
    setVorherigesInitial(initial);
    setWert(initial);
  }
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function aktualisieren(neuerWert: string) {
    setWert(neuerWert);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (neuerWert.trim()) {
        params.set("suche", neuerWert.trim());
      } else {
        params.delete("suche");
      }
      const query = params.toString();
      router.replace(query ? `/notizen?${query}` : "/notizen");
    }, 300);
  }

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", flexShrink: 0 }}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgba(36,35,31,.5)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ position: "absolute", left: 14, pointerEvents: "none" }}
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <line x1="19" y1="19" x2="15.2" y2="15.2" />
      </svg>
      <input
        type="text"
        value={wert}
        onChange={(e) => aktualisieren(e.target.value)}
        placeholder="Notizen durchsuchen"
        style={{
          boxSizing: "border-box",
          width: "100%",
          padding: "10px 38px 10px 38px",
          borderRadius: 12,
          border: "none",
          background: "rgba(36,35,31,.08)",
          fontFamily: "Helvetica, Arial, sans-serif",
          fontSize: 15,
          color: "#24231F",
        }}
      />
      {wert && (
        <button
          onClick={() => aktualisieren("")}
          aria-label="Suche zurücksetzen"
          style={{
            position: "absolute",
            right: 10,
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "none",
            background: "rgba(36,35,31,.14)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
