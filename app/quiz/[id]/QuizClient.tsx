// app/quiz/[id]/QuizClient.tsx
//
// Client Component: eine Quizfrage auf einmal. Nach Auswahl einer Option
// sofortiges Feedback (richtige Option wird dunkel + Häkchen, eine falsch
// gewählte Option bekommt ein X — wie im Quiz.dc.html-Mockup). Nach einer
// richtigen Antwort geht es nach kurzer Pause von selbst weiter, nur nach
// einer falschen erscheint der Weiter-Button. Zählt die richtigen Antworten
// lokal mit und übergibt sie als Query-Parameter an Abschluss (kein
// eigenes Schema-Feld für Quiz-Ergebnisse nötig).
//
// Nach der letzten Frage: falls mindestens eine Antwort falsch war, erst
// eine kurze Auswertung zeigen (falsch beantwortete Fragen mit der
// richtigen Antwort) — dafür kein eigenes Mockup vorhanden, daher im
// gleichen visuellen Vokabular wie der Rest der App gehalten. Waren alle
// Antworten richtig, geht's direkt weiter zu Abschluss.

"use client";

import { useEffect, useEffectEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MenuButton from "../../MenuButton";
import NavKreise from "../../NavKreise";
import StatusBarColor from "../../StatusBarColor";
import { quizantwortenProtokollieren } from "./actions";

type Frage = { id: string; kernaussageId: string; frage: string; optionen: string[]; richtigeOptionIndex: number };
type FalscheAntwort = { frage: string; gewaehlt: string; richtig: string };

// Pause nach einer richtigen Antwort, bevor es von selbst weitergeht —
// lang genug, dass das Häkchen noch wahrgenommen wird.
const AUTO_WEITER_MS = 900;

// Dezenter Hinweis neben dem Pfeil-Button, solange die Antworten geschrieben
// werden — gleiche Typo wie die Meta-Zeile unter dem Titel, kein Spinner.
function SpeichertHinweis() {
  return (
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
      Speichert …
    </span>
  );
}

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
  // Jede einzelne Antwort (nicht nur die falschen) — Grundlage für das
  // Event-Log in quizantworten (siehe actions.ts, Pendenz "Event-Log für
  // Bewertungen/Quiz-Antworten (Fortschritt-Fix)") UND für die
  // Wiederholung-Bewertung, die aus dem Quiz-Ergebnis abgeleitet wird
  // (kernaussageId je Antwort mitgeführt, siehe actions.ts).
  const [antworten, setAntworten] = useState<
    { quizfrageId: string; kernaussageId: string; richtig: boolean }[]
  >([]);
  const [phase, setPhase] = useState<"frage" | "auswertung">("frage");
  const [speichert, startTransition] = useTransition();
  const router = useRouter();

  const aktuelle = fragen[index];
  const beantwortet = ausgewaehlt !== null;
  const istLetzte = index === fragen.length - 1;

  function auswaehlen(i: number) {
    if (beantwortet) return;
    setAusgewaehlt(i);
    const istRichtig = i === aktuelle.richtigeOptionIndex;
    setAntworten((liste) => [
      ...liste,
      { quizfrageId: aktuelle.id, kernaussageId: aktuelle.kernaussageId, richtig: istRichtig },
    ]);
    if (istRichtig) {
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
    if (speichert) return;
    // 09/2026: bewusst ABGEWARTET (vorher fire-and-forget). Seit der
    // Abschaffung der Lernkarten schreibt quizantwortenProtokollieren neben
    // dem quizantworten-Log auch die repetitionselemente-Zeilen (siehe
    // actions.ts, mehrere Roundtrips je Kernaussage) — und genau die zählt
    // der Abschluss-Screen für "Wiederholungen geplant" frisch aus der DB
    // (force-dynamic). Ohne await wäre man dort, bevor geschrieben ist, und
    // sähe beim ersten Durchlauf 0 oder eine Teilzahl.
    startTransition(async () => {
      try {
        await quizantwortenProtokollieren(buchinhaltId, antworten);
      } catch (fehler) {
        // Fehler darf nicht auf dem Quiz-Screen festhalten: die Trefferquote
        // selbst kommt per Query-Parameter, der Abschluss-Screen zeigt dann
        // bloss eine zu kleine Wiederholungs-Zahl.
        console.error("Quiz-Antworten konnten nicht protokolliert werden", fehler);
      }
      router.push(`/abschluss/${buchinhaltId}?richtig=${richtigAnzahl}`);
    });
  }

  function weiter() {
    if (speichert) return;
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

  // 09/2026 (Pendenz "Quiz: bei richtiger Antwort automatisch zur nächsten
  // Frage wechseln"): nach einer RICHTIGEN Antwort geht es nach kurzer Pause
  // von selbst weiter. Nach einer falschen bleibt die Frage stehen, damit man
  // die richtige Option in Ruhe lesen kann — weiter dann per Button. Nach einer
  // richtigen Antwort ist der Button ausgeblendet (Wunsch Nutzer: der Timer
  // macht ihn überflüssig); wechselt index, verwirft der Cleanup den Timer,
  // es wird also nie doppelt weitergeschaltet. Bewusst über einen
  // Effekt statt direkt in auswaehlen(): erst im nächsten Render sind
  // antworten/richtigAnzahl aktualisiert, die zumAbschluss() bei der letzten
  // Frage braucht. useEffectEvent liefert dafür immer das aktuelle weiter().
  const warRichtig = beantwortet && ausgewaehlt === aktuelle.richtigeOptionIndex;
  const automatischWeiter = useEffectEvent(() => weiter());
  useEffect(() => {
    if (phase !== "frage" || !warRichtig) return;
    const timer = setTimeout(automatischWeiter, AUTO_WEITER_MS);
    return () => clearTimeout(timer);
  }, [index, warRichtig, phase]);

  if (phase === "auswertung") {
    return (
      <main
        style={{
          width: "100%",
          height: "calc(100dvh - env(safe-area-inset-top, 0px))",
          boxSizing: "border-box",
          padding: 16,
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
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Auswertung</span>
          <MenuButton inline />
        </div>

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
          {titel} — {kategorieLabel} · {richtigAnzahl} / {fragen.length} richtig
        </span>

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
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
              <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17, lineHeight: 1.35 }}>
                {eintrag.frage}
              </span>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}>
                  <line x1="7" y1="7" x2="17" y2="17" />
                  <line x1="17" y1="7" x2="7" y2="17" />
                </svg>
                <span style={{ fontSize: 16, lineHeight: 1.5, color: "rgba(36,35,31,.7)" }}>{eintrag.gewaehlt}</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}>
                  <path d="M8.5 12.3l2.3 2.3 4.7-5" />
                </svg>
                <span style={{ fontSize: 16, lineHeight: 1.5, fontWeight: 600 }}>{eintrag.richtig}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, flexShrink: 0 }}>
          {speichert && <SpeichertHinweis />}
          <button
            onClick={zumAbschluss}
            disabled={speichert}
            aria-busy={speichert}
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
              cursor: speichert ? "default" : "pointer",
              opacity: speichert ? 0.45 : 1,
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
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Quiz</span>
        </div>
        <MenuButton inline />
      </div>

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
        <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 600, fontSize: 14, color: "rgba(36,35,31,.7)" }}>
          {index + 1} / {fragen.length}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 26, overflowY: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
            Frage {index + 1}
          </span>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22, lineHeight: 1.3 }}>
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
                    fontSize: 16.5,
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

      <div style={{ display: "flex", flexDirection: "column", gap: 28, flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
            visibility: beantwortet ? "visible" : "hidden",
          }}
        >
          {speichert && <SpeichertHinweis />}
          <button
            onClick={weiter}
            disabled={speichert}
            aria-busy={speichert}
            aria-label={istLetzte ? "Zum Abschluss" : "Nächste Frage"}
            style={{
              // Nach richtiger Antwort übernimmt der Timer: Button unsichtbar,
              // aber Platz behalten, damit das Layout nicht springt.
              visibility: warRichtig ? "hidden" : undefined,
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
              cursor: speichert ? "default" : "pointer",
              opacity: speichert ? 0.45 : 1,
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
