// app/quiz/[id]/QuizClient.tsx
//
// Client Component: eine Quizfrage auf einmal. Nach Auswahl einer Option
// sofortiges Feedback (richtige Option wird dunkel + Häkchen, eine falsch
// gewählte Option bekommt ein X — wie im Quiz.dc.html-Mockup), erst danach
// erscheint der Weiter-Button. Zählt die richtigen Antworten lokal mit und
// übergibt sie als Query-Parameter an Abschluss (kein eigenes Schema-Feld
// für Quiz-Ergebnisse nötig).
//
// Nach der letzten Frage: falls mindestens eine Antwort falsch war, erst
// eine kurze Auswertung zeigen (falsch beantwortete Fragen mit der
// richtigen Antwort) — dafür kein eigenes Mockup vorhanden, daher im
// gleichen visuellen Vokabular wie der Rest der App gehalten. Waren alle
// Antworten richtig, geht's direkt weiter zu Abschluss.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MenuButton from "../../MenuButton";
import NavKreise from "../../NavKreise";
import StatusBarColor from "../../StatusBarColor";

type Frage = { id: string; frage: string; optionen: string[]; richtigeOptionIndex: number };
type FalscheAntwort = { frage: string; gewaehlt: string; richtig: string };

export default function QuizClient({
  buchinhaltId,
  titel,
  akzent,
  kategorieLabel,
  fragen,
}: {
  buchinhaltId: string;
  titel: string;
  akzent: string;
  kategorieLabel: string;
  fragen: Frage[];
}) {
  const [index, setIndex] = useState(0);
  const [ausgewaehlt, setAusgewaehlt] = useState<number | null>(null);
  const [richtigAnzahl, setRichtigAnzahl] = useState(0);
  const [falscheAntworten, setFalscheAntworten] = useState<FalscheAntwort[]>([]);
  const [phase, setPhase] = useState<"frage" | "auswertung">("frage");
  const router = useRouter();

  const aktuelle = fragen[index];
  const beantwortet = ausgewaehlt !== null;
  const istLetzte = index === fragen.length - 1;

  function auswaehlen(i: number) {
    if (beantwortet) return;
    setAusgewaehlt(i);
    if (i === aktuelle.richtigeOptionIndex) {
      setRichtigAnzahl((n) => n + 1);
    } else {
      setFalscheAntworten((liste) => [
        ...liste,
        {
          frage: aktuelle.frage,
          gewaehlt: aktuelle.optionen[i],
          richtig: aktuelle.optionen[aktuelle.richtigeOptionIndex],
        },
      ]);
    }
  }

  function zumAbschluss() {
    router.push(`/abschluss/${buchinhaltId}?richtig=${richtigAnzahl}`);
  }

  function weiter() {
    if (istLetzte) {
      if (falscheAntworten.length > 0) {
        setPhase("auswertung");
      } else {
        zumAbschluss();
      }
    } else {
      setIndex((i) => i + 1);
      setAusgewaehlt(null);
    }
  }

  if (phase === "auswertung") {
    return (
      <main
        style={{
          width: "100%",
          minHeight: "100dvh",
          boxSizing: "border-box",
          padding: 16,
          background: akzent,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          color: "var(--ink)",
        }}
      >
        <StatusBarColor farbe={akzent} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 20 }}>Auswertung</span>
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
          {titel} — {kategorieLabel} · {richtigAnzahl} / {fragen.length} richtig
        </span>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {falscheAntworten.map((eintrag, i) => (
            <div
              key={i}
              style={{
                borderRadius: 14,
                padding: 16,
                background: `linear-gradient(rgba(0,0,0,.07),rgba(0,0,0,.07)), ${akzent}`,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 15, lineHeight: 1.35 }}>
                {eintrag.frage}
              </span>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}>
                  <line x1="7" y1="7" x2="17" y2="17" />
                  <line x1="17" y1="7" x2="7" y2="17" />
                </svg>
                <span style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(36,35,31,.7)" }}>{eintrag.gewaehlt}</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}>
                  <path d="M8.5 12.3l2.3 2.3 4.7-5" />
                </svg>
                <span style={{ fontSize: 14, lineHeight: 1.5, fontWeight: 600 }}>{eintrag.richtig}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={zumAbschluss}
            aria-label="Zum Abschluss"
            style={{
              width: 56,
              height: 32,
              borderRadius: 999,
              background: "#24231F",
              border: "none",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              cursor: "pointer",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={akzent} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 5.5 16 12l-6.5 6.5" />
            </svg>
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        width: "100%",
        minHeight: "100dvh",
        boxSizing: "border-box",
        padding: 16,
        background: akzent,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        color: "var(--ink)",
      }}
    >
      <StatusBarColor farbe={akzent} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/lernkarten/${buchinhaltId}`} aria-label="Zurück">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 5.5 8 12l6.5 6.5" />
            </svg>
          </Link>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 20 }}>Quiz</span>
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
          {fragen.map((_, i) => (
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
          {index + 1} / {fragen.length}
        </span>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 26 }}>
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
            Frage {index + 1}
          </span>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 20, lineHeight: 1.3 }}>
            {aktuelle.frage}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {aktuelle.optionen.map((option, i) => {
            const istRichtig = i === aktuelle.richtigeOptionIndex;
            const istGewaehlt = i === ausgewaehlt;
            const zeigeAlsRichtig = beantwortet && istRichtig;
            const zeigeAlsFalsch = beantwortet && istGewaehlt && !istRichtig;

            return (
              <button
                key={i}
                onClick={() => auswaehlen(i)}
                disabled={beantwortet}
                style={{
                  boxSizing: "border-box",
                  padding: "14px 16px",
                  borderRadius: 14,
                  border: zeigeAlsRichtig ? "none" : "1.5px solid #24231F",
                  background: zeigeAlsRichtig ? "#24231F" : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  textAlign: "left",
                  cursor: beantwortet ? "default" : "pointer",
                }}
              >
                <span
                  style={{
                    fontFamily: "Helvetica, Arial, sans-serif",
                    fontWeight: zeigeAlsRichtig ? 600 : 500,
                    fontSize: 14.5,
                    color: zeigeAlsRichtig ? "#FBFAF7" : "#24231F",
                  }}
                >
                  {option}
                </span>
                {zeigeAlsRichtig && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FBFAF7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8.5 12.3l2.3 2.3 4.7-5" />
                  </svg>
                )}
                {zeigeAlsFalsch && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="7" x2="17" y2="17" />
                    <line x1="17" y1="7" x2="7" y2="17" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", visibility: beantwortet ? "visible" : "hidden" }}>
          <button
            onClick={weiter}
            aria-label={istLetzte ? "Zum Abschluss" : "Nächste Frage"}
            style={{
              width: 56,
              height: 32,
              borderRadius: 999,
              background: "#24231F",
              border: "none",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              cursor: "pointer",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={akzent} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 5.5 16 12l-6.5 6.5" />
            </svg>
          </button>
        </div>
        <NavKreise buchinhaltId={buchinhaltId} akzent={akzent} aktiv="quiz" />
      </div>
    </main>
  );
}
