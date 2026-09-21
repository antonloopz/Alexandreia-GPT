// app/buecherliste/neu/page.tsx
//
// Formular fürs Hinzufügen eines Wunschbuchs. Reines Server Component mit
// nativem <form action={serverAction}> (kein Client-JS nötig). Kein eigenes
// Mockup vorhanden — im gleichen visuellen Vokabular wie der Rest der App
// gehalten (Eyebrow-Labels, Ink-Umriss-Felder, runder Aktionsbutton).
//
// Kategorie ist jetzt optional ("Automatisch erkennen" als Standard) —
// actions.ts versucht dann kategorieErkennen() und kommt nur bei einem
// Fehlschlag hierher zurück (?fehler=kategorie), mit den bisherigen
// Eingaben als Query-Parameter vorausgefüllt, damit nichts verloren geht.

import Link from "next/link";
import { kategorieEnum } from "../../../src/db/schema";
import { KATEGORIE_LABEL } from "../../../src/lib/kategorien";
import MenuButton from "../../MenuButton";
import { buchHinzufuegen } from "./actions";

export const dynamic = "force-dynamic";

const feldStil: React.CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1.5px solid #24231F",
  background: "none",
  fontFamily: "Helvetica, Arial, sans-serif",
  fontSize: 17,
  color: "#24231F",
};

const labelStil: React.CSSProperties = {
  fontFamily: "Helvetica, Arial, sans-serif",
  fontWeight: 700,
  fontSize: 14,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "rgba(36,35,31,.6)",
};

export default async function NeuesBuchSeite({
  searchParams,
}: {
  searchParams: Promise<{
    fehler?: string;
    titel?: string;
    autor?: string;
    originalsprache?: string;
    notiz?: string;
    bald?: string;
    doubletteTitel?: string;
    doubletteAutor?: string;
    doubletteExakt?: string;
    doubletteStatus?: string;
  }>;
}) {
  const vorbelegung = await searchParams;
  const kategorieFehler = vorbelegung.fehler === "kategorie";
  const doubletteFehler = vorbelegung.fehler === "doublette";
  const doubletteStatusText = {
    wunschliste: " — steht schon auf der Wunschliste.",
    bereit: " — ist schon fertig produziert, bereit in der Bibliothek.",
    gelesen: " — ist schon gelesen.",
  }[vorbelegung.doubletteStatus ?? ""] ?? "";

  return (
    <main
      style={{
        width: "100%",
        minHeight: "100dvh",
        boxSizing: "border-box",
        padding: 16,
        background: "var(--paper)",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        color: "var(--ink)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/buecherliste" aria-label="Schliessen">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </Link>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Neues Buch</span>
        </div>
        <MenuButton inline />
      </div>

      {kategorieFehler && (
        <div
          style={{
            boxSizing: "border-box",
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(36,35,31,.08)",
            fontSize: 15,
            lineHeight: 1.4,
          }}
        >
          Kategorie konnte nicht automatisch erkannt werden — bitte manuell auswählen.
        </div>
      )}

      {doubletteFehler && (
        <div
          style={{
            boxSizing: "border-box",
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(36,35,31,.08)",
            fontSize: 15,
            lineHeight: 1.4,
          }}
        >
          {vorbelegung.doubletteExakt === "1" ? "Ist bereits" : "Ist möglicherweise bereits"} in deinem Katalog: „
          {vorbelegung.doubletteTitel}“{vorbelegung.doubletteAutor ? ` von ${vorbelegung.doubletteAutor}` : ""}
          {doubletteStatusText} Trotzdem hinzufügen? Einfach nochmal auf Speichern tippen.
        </div>
      )}

      <form action={buchHinzufuegen} style={{ display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
        <input type="hidden" name="ueberschreiben" value={doubletteFehler ? "on" : ""} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={labelStil} htmlFor="titel">Titel</label>
          <input
            style={feldStil}
            type="text"
            id="titel"
            name="titel"
            required
            defaultValue={vorbelegung.titel ?? ""}
            placeholder="z.B. Sapiens"
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={labelStil} htmlFor="autor">Autor (optional)</label>
          <input
            style={feldStil}
            type="text"
            id="autor"
            name="autor"
            defaultValue={vorbelegung.autor ?? ""}
            placeholder="z.B. Yuval Noah Harari"
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={labelStil} htmlFor="kategorie">
            Kategorie {!kategorieFehler && "(optional)"}
          </label>
          <select style={feldStil} id="kategorie" name="kategorie" required={kategorieFehler} defaultValue="">
            {!kategorieFehler && <option value="">Automatisch erkennen</option>}
            {kategorieFehler && (
              <option value="" disabled>
                Bitte wählen
              </option>
            )}
            {kategorieEnum.enumValues.map((k) => (
              <option key={k} value={k}>{KATEGORIE_LABEL[k] ?? k}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={labelStil} htmlFor="originalsprache">Originalsprache (optional)</label>
          <input
            style={feldStil}
            type="text"
            id="originalsprache"
            name="originalsprache"
            defaultValue={vorbelegung.originalsprache ?? ""}
            placeholder="Automatisch erkennen (Standard: Deutsch)"
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={labelStil} htmlFor="notiz">Notiz (optional)</label>
          <textarea
            style={{ ...feldStil, resize: "vertical", minHeight: 60 }}
            id="notiz"
            name="notiz"
            defaultValue={vorbelegung.notiz ?? ""}
            placeholder="Warum interessiert dich das Buch?"
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            name="bald"
            defaultChecked={vorbelegung.bald === "on"}
            style={{ width: 18, height: 18, accentColor: "#24231F" }}
          />
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 16.5 }}>Bald lesen (priorisieren)</span>
        </label>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            aria-label="Buch speichern"
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "#24231F",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FBFAF7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7" />
            </svg>
          </button>
        </div>
      </form>
    </main>
  );
}
