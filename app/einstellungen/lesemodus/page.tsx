// app/einstellungen/lesemodus/page.tsx
//
// Unterseite von Einstellungen (09/2026, Pendenz "Lesemodus: Schriftgrösse
// & Zeilenabstand einstellbar", inkl. Schriftart): Einstellung über das
// Menü statt auf der Lese-Seite selbst (Entscheid 22.09.2026). Aufbau wie
// app/einstellungen/themenverteilung (Zurück zu Einstellungen, Menü mit
// ankerPfad). Logik: src/lib/lesemodus.ts, Bedienung: LesemodusClient.

import Link from "next/link";
import { db } from "../../../src/db";
import { konten } from "../../../src/db/schema";
import { ladeLesemodus } from "../../../src/lib/lesemodus-laden";
import MenuButton from "../../MenuButton";
import LesemodusClient from "./LesemodusClient";

export const dynamic = "force-dynamic";

export default async function LesemodusSeite() {
  const [konto] = await db.select({ id: konten.id }).from(konten).limit(1);
  const lesemodus = await ladeLesemodus(konto?.id);

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
          <Link href="/einstellungen" aria-label="Zurück">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 5.5 8 12l6.5 6.5" />
            </svg>
          </Link>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Lesemodus</span>
        </div>
        <MenuButton inline ankerPfad="/einstellungen" />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <LesemodusClient initial={lesemodus} />
      </div>
    </main>
  );
}
