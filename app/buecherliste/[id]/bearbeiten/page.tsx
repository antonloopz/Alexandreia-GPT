// app/buecherliste/[id]/bearbeiten/page.tsx
//
// Formular fürs Bearbeiten eines bestehenden Wunschlisten-Eintrags
// (09/2026, Pendenz "Wunschliste: Einträge bearbeiten/löschen") — optisch
// und strukturell identisch zu buecherliste/neu/page.tsx, aber mit den
// aktuellen Werten vorbelegt und ohne "Automatisch erkennen"-Option bei
// der Kategorie (die gibt es beim Bearbeiten nicht, siehe actions.ts).

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "../../../../src/db";
import { buecher, kategorieEnum, wunschlisteneintraege } from "../../../../src/db/schema";
import { eq } from "drizzle-orm";
import { KATEGORIE_LABEL } from "../../../../src/lib/kategorien";
import MenuButton from "../../../MenuButton";
import { eintragAktualisieren } from "./actions";

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

export default async function EintragBearbeitenSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [eintrag] = await db
    .select({
      id: wunschlisteneintraege.id,
      notiz: wunschlisteneintraege.notiz,
      bald: wunschlisteneintraege.bald,
      titel: buecher.titel,
      autor: buecher.autor,
      originalsprache: buecher.originalsprache,
      kategorie: buecher.kategorie,
    })
    .from(wunschlisteneintraege)
    .leftJoin(buecher, eq(wunschlisteneintraege.buchId, buecher.id))
    .where(eq(wunschlisteneintraege.id, id));

  if (!eintrag) notFound();

  const eintragAktualisierenMitId = eintragAktualisieren.bind(null, id);

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
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Buch bearbeiten</span>
        </div>
        <MenuButton inline />
      </div>

      <form action={eintragAktualisierenMitId} style={{ display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={labelStil} htmlFor="titel">Titel</label>
          <input
            style={feldStil}
            type="text"
            id="titel"
            name="titel"
            required
            defaultValue={eintrag.titel ?? ""}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={labelStil} htmlFor="autor">Autor (optional)</label>
          <input
            style={feldStil}
            type="text"
            id="autor"
            name="autor"
            defaultValue={eintrag.autor ?? ""}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={labelStil} htmlFor="kategorie">Kategorie</label>
          <select style={feldStil} id="kategorie" name="kategorie" required defaultValue={eintrag.kategorie ?? ""}>
            {kategorieEnum.enumValues.map((k) => (
              <option key={k} value={k}>{KATEGORIE_LABEL[k] ?? k}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={labelStil} htmlFor="originalsprache">Originalsprache</label>
          <input
            style={feldStil}
            type="text"
            id="originalsprache"
            name="originalsprache"
            defaultValue={eintrag.originalsprache ?? "Deutsch"}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={labelStil} htmlFor="notiz">Notiz (optional)</label>
          <textarea
            style={{ ...feldStil, resize: "vertical", minHeight: 60 }}
            id="notiz"
            name="notiz"
            defaultValue={eintrag.notiz ?? ""}
            placeholder="Warum interessiert dich das Buch?"
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            name="bald"
            defaultChecked={eintrag.bald}
            style={{ width: 18, height: 18, accentColor: "#24231F" }}
          />
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 16.5 }}>Bald lesen (priorisieren)</span>
        </label>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            aria-label="Änderungen speichern"
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
