// app/einstellungen/themenverteilung/page.tsx
//
// Unterseite von Einstellungen (bisher inerte Zeile "Themenverteilung
// anpassen" — siehe app/einstellungen/page.tsx): pro Kategorie einen
// eigenen Mindestbestand festlegen, statt für alle Kategorien denselben
// festen Wert (STANDARD_MINDESTBESTAND, aktuell 2) zu verwenden.
// Persistiert in kontoeinstellungen.kategorieZielwerte; vorschlaege() und
// kategorieUebersicht() (src/lib/vorschlag.ts) lesen das jetzt statt der
// festen Konstante.

import Link from "next/link";
import { db } from "../../../src/db";
import { konten, kontoeinstellungen } from "../../../src/db/schema";
import { eq } from "drizzle-orm";
import { ALLE_KATEGORIEN, STANDARD_MINDESTBESTAND } from "../../../src/lib/vorschlag";
import { KATEGORIE_FARBE, KATEGORIE_LABEL } from "../../../src/lib/kategorien";
import MenuButton from "../../MenuButton";
import { zielwerteSpeichern } from "./actions";

export const dynamic = "force-dynamic";

const zeileStil: React.CSSProperties = {
  boxSizing: "border-box",
  padding: "12px 16px",
  borderRadius: 14,
  background: "linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.05)), var(--paper)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const feldStil: React.CSSProperties = {
  boxSizing: "border-box",
  width: 56,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1.5px solid #24231F",
  background: "none",
  fontFamily: "Helvetica, Arial, sans-serif",
  fontSize: 17,
  color: "#24231F",
  textAlign: "center",
  flexShrink: 0,
};

export default async function ThemenverteilungSeite() {
  const [konto] = await db.select().from(konten).limit(1);

  if (!konto) {
    return (
      <main style={{ padding: 24, fontFamily: "Helvetica, Arial, sans-serif" }}>
        Kein Konto gefunden — <code>npx tsx src/db/seed.ts</code> ausführen.
      </main>
    );
  }

  const [einstellungen] = await db
    .select({ kategorieZielwerte: kontoeinstellungen.kategorieZielwerte })
    .from(kontoeinstellungen)
    .where(eq(kontoeinstellungen.kontoId, konto.id));

  const zielwerte = einstellungen?.kategorieZielwerte ?? {};

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
          <Link href="/einstellungen" aria-label="Zurück">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 5.5 8 12l6.5 6.5" />
            </svg>
          </Link>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Themenverteilung</span>
        </div>
        <MenuButton inline ankerPfad="/einstellungen" />
      </div>

      <span style={{ fontSize: 15.5, lineHeight: 1.5, color: "rgba(36,35,31,.65)" }}>
        Mindestbestand pro Kategorie — sinkt der Vorrat an fertigen Büchern einer Kategorie
        darunter, wird sie beim nächsten automatischen Lauf bevorzugt aufgefüllt. Standard: {STANDARD_MINDESTBESTAND}.
      </span>

      <form action={zielwerteSpeichern} style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ALLE_KATEGORIEN.map((kategorie) => (
            <div key={kategorie} style={zeileStil}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: KATEGORIE_FARBE[kategorie] ?? "#ccc", flexShrink: 0 }} />
                <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 16.5, color: "#24231F" }}>
                  {KATEGORIE_LABEL[kategorie] ?? kategorie}
                </span>
              </div>
              <input
                style={feldStil}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                name={`zielwert_${kategorie}`}
                defaultValue={zielwerte[kategorie] ?? STANDARD_MINDESTBESTAND}
              />
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            aria-label="Speichern"
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
