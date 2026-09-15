// app/lesen/[id]/Hervorhebbarer.tsx
//
// Client Component: rendert einen Textblock (Zusammenfassung/Entstehungs-
// geschichte/Autor/Kernzitat) mit bestehenden Hervorhebungen farbig markiert
// und erlaubt, neuen Text zu markieren (native Textauswahl + "Markieren"-
// Button) sowie eine bestehende Hervorhebung anzutippen, um eine Notiz
// hinzuzufügen/zu bearbeiten oder die Hervorhebung wieder zu entfernen.
// Feature "Notiz-/Highlight-Funktion" 09/2026.
//
// Speichert optimistisch lokal (setHervorhebungen) und schickt die Server
// Action im Hintergrund — kein router.refresh() nötig, da diese Komponente
// selbst die einzige Quelle für die Anzeige der Hervorhebungen auf dieser
// Seite ist.

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  hervorhebungErstellen,
  hervorhebungLoeschen,
  notizSpeichern,
  wiederholungHinzufuegen,
  wiederholungEntfernen,
} from "../../notizen/actions";
import type { NotizFeld } from "../../../src/lib/notizen";

// inWiederholung: ob diese Hervorhebung bereits zur Wiederholung (Spaced
// Repetition) hinzugefügt wurde — Pendenz "Notizen/Hervorhebungen optional
// in die Wiederholung aufnehmen", 09/2026.
export type Hervorhebung = { id: string; textAuszug: string; text: string | null; inWiederholung: boolean };

// Dunklere, volldeckende Variante der Kategoriefarbe — für die
// Hervorhebungs-Markierung auf dem Lesen-Screen, dessen <main> selbst mit
// der (vollen, undurchsichtigen) Kategoriefarbe hinterlegt ist. Eine bloss
// halbtransparente Kopie DERSELBEN Farbe (frühere Version) war auf diesem
// Hintergrund praktisch unsichtbar — bewusst um denselben Farbton
// verdunkelt statt auf eine hiervon unabhängige Akzentfarbe zu wechseln,
// damit die Markierung weiterhin zur jeweiligen Buchkategorie passt.
function hexZuDunkler(hex: string, anteil: number) {
  const bereinigt = hex.replace("#", "");
  const voll = bereinigt.length === 3 ? bereinigt.split("").map((z) => z + z).join("") : bereinigt;
  const r = parseInt(voll.slice(0, 2), 16);
  const g = parseInt(voll.slice(2, 4), 16);
  const b = parseInt(voll.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return "rgb(150,145,160)";
  const dunkler = (kanal: number) => Math.round(kanal * (1 - anteil));
  return `rgb(${dunkler(r)},${dunkler(g)},${dunkler(b)})`;
}

// Zerlegt text an den (nicht überlappenden) Stellen, an denen eine der
// bestehenden Hervorhebungen wörtlich vorkommt — bei mehrfach vorkommendem
// Text wird bewusst nur die erste Fundstelle markiert (für eine
// Einzelnutzer-App ausreichend genau).
function segmentiere(text: string, hervorhebungen: Hervorhebung[]) {
  const treffer = hervorhebungen
    .map((h) => ({ h, start: text.indexOf(h.textAuszug) }))
    .filter((t) => t.start !== -1 && t.h.textAuszug.length > 0)
    .sort((a, b) => a.start - b.start);

  const segmente: { typ: "text" | "hervorhebung"; inhalt: string; hervorhebung?: Hervorhebung }[] = [];
  let cursor = 0;
  for (const { h, start } of treffer) {
    if (start < cursor) continue;
    if (start > cursor) segmente.push({ typ: "text", inhalt: text.slice(cursor, start) });
    segmente.push({ typ: "hervorhebung", inhalt: h.textAuszug, hervorhebung: h });
    cursor = start + h.textAuszug.length;
  }
  if (cursor < text.length) segmente.push({ typ: "text", inhalt: text.slice(cursor) });
  return segmente;
}

export default function Hervorhebbarer({
  text,
  buchinhaltId,
  feld,
  kernaussageId,
  bestehende,
  akzent,
  style,
  praefix,
  suffix,
}: {
  text: string;
  buchinhaltId: string;
  feld: NotizFeld;
  // Nur für feld === "kernaussage_text"/"kernaussage_erklaerung" gesetzt
  // (09/2026, Pendenz "Hervorhebungen auch auf Kernaussagen erlauben") —
  // ordnet die Hervorhebung der konkreten Kernaussage zu.
  kernaussageId?: string;
  bestehende: Hervorhebung[];
  akzent: string;
  style?: React.CSSProperties;
  // Rein dekorative Zeichen (z.B. Anführungszeichen beim Kernzitat), die
  // NICHT Teil des markierbaren/gespeicherten Texts sein sollen — werden
  // ausserhalb der Auswahl-Erkennung als einfache Geschwister-Textknoten
  // gerendert.
  praefix?: string;
  suffix?: string;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [hervorhebungen, setHervorhebungen] = useState(bestehende);
  const [auswahl, setAuswahl] = useState<{ text: string; bottom: number; left: number } | null>(null);
  const [popover, setPopover] = useState<{ hervorhebung: Hervorhebung; top: number; left: number } | null>(null);
  const [notizEntwurf, setNotizEntwurf] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    function beiAuswahlWechsel() {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setAuswahl(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!containerRef.current || !containerRef.current.contains(range.commonAncestorContainer)) {
        setAuswahl(null);
        return;
      }
      const ausgewaehlt = selection.toString().trim();
      if (!ausgewaehlt) {
        setAuswahl(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setAuswahl({ text: ausgewaehlt, bottom: rect.bottom, left: rect.left + rect.width / 2 });
    }
    document.addEventListener("selectionchange", beiAuswahlWechsel);
    return () => document.removeEventListener("selectionchange", beiAuswahlWechsel);
  }, []);

  function markieren() {
    if (!auswahl) return;
    const textAuszug = auswahl.text;
    setAuswahl(null);
    window.getSelection()?.removeAllRanges();
    startTransition(async () => {
      const zeile = await hervorhebungErstellen(buchinhaltId, feld, textAuszug, kernaussageId);
      if (zeile && zeile.textAuszug) {
        setHervorhebungen((h) => [
          ...h,
          { id: zeile.id, textAuszug: zeile.textAuszug!, text: zeile.text, inWiederholung: false },
        ]);
      }
    });
  }

  function hervorhebungAntippen(h: Hervorhebung, e: React.MouseEvent) {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setNotizEntwurf(h.text ?? "");
    setPopover({ hervorhebung: h, top: rect.bottom + 8, left: rect.left });
  }

  function notizUebernehmen() {
    if (!popover) return;
    const { hervorhebung } = popover;
    const wert = notizEntwurf.trim();
    setHervorhebungen((hs) => hs.map((h) => (h.id === hervorhebung.id ? { ...h, text: wert || null } : h)));
    setPopover(null);
    startTransition(() => {
      notizSpeichern(hervorhebung.id, wert);
    });
  }

  function hervorhebungEntfernen() {
    if (!popover) return;
    const { hervorhebung } = popover;
    setHervorhebungen((hs) => hs.filter((h) => h.id !== hervorhebung.id));
    setPopover(null);
    startTransition(() => {
      hervorhebungLoeschen(hervorhebung.id);
    });
  }

  // Toggle "Zur Wiederholung hinzufügen" / "In Wiederholung" im Popover —
  // Pendenz "Notizen/Hervorhebungen optional in die Wiederholung
  // aufnehmen", 09/2026. Analog zum WiederholungButton auf der Notizen-
  // Übersicht (app/notizen/WiederholungButton.tsx), hier aber inline statt
  // als eigene Komponente, da der Popover-State ohnehin lokal ist.
  function wiederholungUmschalten() {
    if (!popover) return;
    const { hervorhebung } = popover;
    const neu = !hervorhebung.inWiederholung;
    setHervorhebungen((hs) => hs.map((h) => (h.id === hervorhebung.id ? { ...h, inWiederholung: neu } : h)));
    setPopover((p) => (p ? { ...p, hervorhebung: { ...p.hervorhebung, inWiederholung: neu } } : p));
    startTransition(() => {
      if (neu) {
        wiederholungHinzufuegen(hervorhebung.id);
      } else {
        wiederholungEntfernen(hervorhebung.id);
      }
    });
  }

  const segmente = segmentiere(text, hervorhebungen);

  return (
    <>
      <p style={{ margin: 0, ...style }}>
        {praefix}
        <span ref={containerRef}>
        {segmente.map((segment, i) =>
          segment.typ === "hervorhebung" && segment.hervorhebung ? (
            <mark
              key={i}
              onClick={(e) => hervorhebungAntippen(segment.hervorhebung!, e)}
              style={{
                background: hexZuDunkler(akzent, 0.32),
                borderRadius: 3,
                padding: "0 1px",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              {segment.inhalt}
            </mark>
          ) : (
            <span key={i}>{segment.inhalt}</span>
          )
        )}
        </span>
        {suffix}
      </p>

      {/* Unterhalb statt oberhalb der Auswahl positioniert (09/2026, Bug-Fix
          "Markieren-Button kollidiert mit Apples Auswahl-Menü") — iOS/Safari
          zeigt sein eigenes Callout-Menü (Kopieren/Nachschlagen/…) direkt
          ÜBER der Textauswahl an; ein eigener Button an derselben Stelle
          überlappte das native Menü bzw. wurde selbst davon verdeckt. */}
      {auswahl && (
        <button
          onClick={markieren}
          style={{
            position: "fixed",
            top: Math.min(auswahl.bottom + 12, window.innerHeight - 52),
            left: auswahl.left,
            transform: "translateX(-50%)",
            zIndex: 50,
            background: "#24231F",
            color: "#FBFAF7",
            border: "none",
            borderRadius: 20,
            padding: "8px 16px",
            fontFamily: "Helvetica, Arial, sans-serif",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Markieren
        </button>
      )}

      {popover && (
        <>
          <div onClick={() => setPopover(null)} aria-hidden style={{ position: "fixed", inset: 0, zIndex: 49 }} />
          <div
            style={{
              position: "fixed",
              top: Math.min(popover.top, window.innerHeight - 180),
              left: Math.min(Math.max(16, popover.left), window.innerWidth - 260),
              width: 244,
              boxSizing: "border-box",
              background: "#F2F4EF",
              border: "1.5px solid #24231F",
              borderRadius: 14,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              zIndex: 50,
            }}
          >
            <textarea
              value={notizEntwurf}
              onChange={(e) => setNotizEntwurf(e.target.value)}
              placeholder="Notiz (optional)"
              rows={3}
              style={{
                boxSizing: "border-box",
                width: "100%",
                resize: "none",
                border: "1.5px solid #24231F",
                borderRadius: 10,
                padding: "8px 10px",
                fontFamily: "'Work Sans', Arial, sans-serif",
                fontSize: 14.5,
                color: "#24231F",
                background: "none",
              }}
            />
            <button
              onClick={wiederholungUmschalten}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                alignSelf: "flex-start",
                border: "none",
                background: "none",
                padding: 0,
                color: popover.hervorhebung.inWiederholung ? "#24231F" : "rgba(36,35,31,.6)",
                fontFamily: "Helvetica, Arial, sans-serif",
                fontWeight: popover.hervorhebung.inWiederholung ? 600 : 400,
                fontSize: 13.5,
                cursor: "pointer",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M4 12a8 8 0 0 1 14-5.3" />
                <path d="M20 12a8 8 0 0 1-14 5.3" />
                <path d="M18 3v4h-4" />
                <path d="M6 21v-4h4" />
              </svg>
              {popover.hervorhebung.inWiederholung ? "In Wiederholung" : "Zur Wiederholung"}
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button
                onClick={hervorhebungEntfernen}
                style={{
                  border: "none",
                  background: "none",
                  color: "rgba(36,35,31,.6)",
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontSize: 13.5,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Entfernen
              </button>
              <button
                onClick={notizUebernehmen}
                style={{
                  border: "none",
                  background: "#24231F",
                  color: "#FBFAF7",
                  borderRadius: 999,
                  padding: "6px 16px",
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontWeight: 600,
                  fontSize: 13.5,
                  cursor: "pointer",
                }}
              >
                Speichern
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
