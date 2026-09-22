// app/einstellungen/page.tsx
//
// Fünfter und letzter sekundärer Screen. "Obsidian-Export"
// (kontoeinstellungen-Zeile, per Toggle aktualisiert) und "Themenverteilung
// anpassen" (verlinkt auf app/einstellungen/themenverteilung, siehe dort)
// sind echt verdrahtet. Anki-Export (nie über den Schalter hinaus gebaut)
// wieder entfernt, siehe Pendenz "Anki-Exportfunktion entfernen".
// "Partnerkonto verknüpfen" ist konzeptionell vorgesehen (Mehrnutzer-
// Verknüpfung), aber ohne jede Datenbankgrundlage (kein Login-/
// Einladungssystem) noch nicht gebaut — Zeile deshalb bewusst entfernt
// statt als toter Button stehen zu lassen, bis das Feature wirklich
// umgesetzt wird.
//
// Obsidian-Export tatsächlich fertig verdrahtet (09/2026, Pendenz
// "Obsidian-Export für Notizen fertigstellen") — bis dahin toggelte der
// Schalter nur ein ungenutztes Flag. Siehe src/lib/obsidian.ts für die
// Export-Logik und app/einstellungen/obsidian-export/route.ts für den
// eigentlichen Download.

import { db } from "../../src/db";
import { konten, kontoeinstellungen } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import MenuButton from "../MenuButton";
import SchliessenButton from "../SchliessenButton";
import EinstellungenClient from "./EinstellungenClient";
import { obsidianExportStatus } from "../../src/lib/obsidian";
import { lesemodusKurz, normalisiereLesemodus } from "../../src/lib/lesemodus";

export const dynamic = "force-dynamic";

const gruppenLabelStil: React.CSSProperties = {
  fontFamily: "Helvetica, Arial, sans-serif",
  fontWeight: 700,
  fontSize: 14,
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

export default async function EinstellungenSeite({
  searchParams,
}: {
  searchParams: Promise<{ export?: string }>;
}) {
  const { export: exportHinweis } = await searchParams;
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

  const obsidianAktiv = einstellungen?.obsidianExportAktiv ?? true;
  const { anzahlBuecher, anzahlNotizen } = obsidianAktiv
    ? await obsidianExportStatus(konto.id)
    : { anzahlBuecher: 0, anzahlNotizen: 0 };

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
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Einstellungen</span>
        </div>
        <MenuButton inline />
      </div>

      {/* Oberster Bereich (Header) bleibt beim Scrollen fixiert, analog den
          Buttons auf den Lese-Seiten (09/2026, Pendenz "Dropdown-Seiten:
          oberster Bereich nicht scrollbar") — nur dieser Wrapper scrollt. */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 24, overflowY: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={gruppenLabelStil}>Inhalt</span>
          <Link href="/einstellungen/themenverteilung" style={zeileStil}>
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 16.5, color: "#24231F" }}>
              Themenverteilung anpassen
            </span>
            <span style={{ color: "rgba(36,35,31,.5)", fontSize: 18 }}>›</span>
          </Link>
        </div>

        {/* Lesemodus (09/2026): Schriftgrösse, Zeilenabstand, Schrift —
            Unterseite analog Themenverteilung. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={gruppenLabelStil}>Darstellung</span>
          <Link href="/einstellungen/lesemodus" style={zeileStil}>
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 16.5, color: "#24231F" }}>
                Lesemodus
              </span>
              <span style={{ fontSize: 13, color: "rgba(36,35,31,.55)" }}>
                {lesemodusKurz(normalisiereLesemodus(einstellungen?.lesemodus ?? null))}
              </span>
            </span>
            <span style={{ color: "rgba(36,35,31,.5)", fontSize: 18 }}>›</span>
          </Link>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={gruppenLabelStil}>Export</span>
          <EinstellungenClient
            obsidianAktiv={obsidianAktiv}
            obsidianVaultName={einstellungen?.obsidianVaultName ?? ""}
          />
          {obsidianAktiv && (
            <>
              {anzahlBuecher > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Custom-URL-Schema statt Server-Route (09/2026, Pendenz
                      "Obsidian-Export für Notizen fertigstellen" — Nachtrag
                      "Direktschreiben statt ZIP") — öffnet den lokalen
                      Helfer (tools/obsidian-export-helfer/), der den ZIP-
                      Endpunkt selbst abruft und direkt in den Vault
                      entpackt. Einrichtung einmalig pro Mac nötig, siehe
                      tools/obsidian-export-helfer/README.md. */}
                  <a href="alexandreia-export://sync" style={zeileStil}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 16.5, color: "#24231F" }}>
                        Direkt in Obsidian synchronisieren
                      </span>
                      <span style={{ fontSize: 13, color: "rgba(36,35,31,.55)" }}>
                        {anzahlNotizen} neue Notiz{anzahlNotizen === 1 ? "" : "en"} in {anzahlBuecher} {anzahlBuecher === 1 ? "Buch" : "Büchern"}
                      </span>
                    </span>
                    <span style={{ color: "rgba(36,35,31,.5)", fontSize: 18 }}>⚡</span>
                  </a>
                  <a
                    href="/einstellungen/obsidian-export"
                    style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(36,35,31,.55)", padding: "0 4px" }}
                  >
                    Stattdessen als ZIP herunterladen
                  </a>
                </div>
              ) : (
                <div style={{ ...zeileStil, cursor: "default" }}>
                  <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 16.5, color: "rgba(36,35,31,.4)" }}>
                    Direkt in Obsidian synchronisieren
                  </span>
                  <span style={{ fontSize: 13, color: "rgba(36,35,31,.45)" }}>Alles aktuell</span>
                </div>
              )}
              {exportHinweis === "leer" && (
                <span style={{ fontSize: 13, color: "rgba(36,35,31,.55)" }}>
                  Es gab nichts Neues zu exportieren — vermutlich in einem anderen Tab bereits erledigt.
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
