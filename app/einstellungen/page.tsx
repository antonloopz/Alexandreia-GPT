// app/einstellungen/page.tsx
//
// Fünfter und letzter sekundärer Screen. "Obsidian-Export"/"Anki-Export"
// (kontoeinstellungen-Zeile, per Toggle aktualisiert) und "Themenverteilung
// anpassen" (verlinkt auf app/einstellungen/themenverteilung, siehe dort)
// sind echt verdrahtet. "Partnerkonto verknüpfen" ist konzeptionell
// vorgesehen (Mehrnutzer-Verknüpfung), aber ohne jede Datenbankgrundlage
// (kein Login/Einladungssystem) noch nicht gebaut — Zeile deshalb bewusst
// entfernt statt als toter Button stehen zu lassen, bis das Feature wirklich
// umgesetzt wird.

import { db } from "../../src/db";
import { konten, kontoeinstellungen } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import MenuButton from "../MenuButton";
import SchliessenButton from "../SchliessenButton";
import EinstellungenClient from "./EinstellungenClient";

export const dynamic = "force-dynamic";

const gruppenLabelStil: React.CSSProperties = {
  fontFamily: "Helvetica, Arial, sans-serif",
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "rgba(36,35,31,.6)",
};

const zeileStil: React.CSSProperties = {
  boxSizing: "border-box",
  padding: "14px 16px",
  borderRadius: 14,
  background: "linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.05)), var(--paper)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

export default async function EinstellungenSeite() {
  const [konto] = await db.select().from(konten).limit(1);

  if (!konto) {
    return (
      <main style={{ padding: 24, fontFamily: "Helvetica, Arial, sans-serif" }}>
        Kein Konto gefunden — <code>npx tsx src/db/seed.ts</code> ausführen.
      </main>
    );
  }

  const [einstellungen] = await db
    .select()
    .from(kontoeinstellungen)
    .where(eq(kontoeinstellungen.kontoId, konto.id));

  return (
    <main
      style={{
        width: "100%",
        height: "calc(100dvh - env(safe-area-inset-top, 0px))",
        boxSizing: "border-box",
        padding: 16,
        background: "var(--paper)",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        color: "var(--ink)",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SchliessenButton />
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 20 }}>Einstellungen</span>
        </div>
        <MenuButton />
      </div>

      {/* Oberster Bereich (Header) bleibt beim Scrollen fixiert, analog den
          Buttons auf den Lese-Seiten (09/2026, Pendenz "Dropdown-Seiten:
          oberster Bereich nicht scrollbar") — nur dieser Wrapper scrollt. */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 24, overflowY: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={gruppenLabelStil}>Inhalt</span>
          <Link href="/einstellungen/themenverteilung" style={zeileStil}>
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 14.5, color: "#24231F" }}>
              Themenverteilung anpassen
            </span>
            <span style={{ color: "rgba(36,35,31,.5)", fontSize: 16 }}>›</span>
          </Link>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={gruppenLabelStil}>Export</span>
          <EinstellungenClient
            obsidianAktiv={einstellungen?.obsidianExportAktiv ?? true}
            ankiAktiv={einstellungen?.ankiExportAktiv ?? false}
          />
        </div>
      </div>
    </main>
  );
}
