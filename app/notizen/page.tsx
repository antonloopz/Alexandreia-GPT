// app/notizen/page.tsx
//
// Notizen-Übersicht: alle Hervorhebungen aus dem Lesen-Screen, gruppiert
// nach Buch, neueste Gruppe zuerst. Sechster Hauptscreen — wie die anderen
// fünf über das Dropdown-Menü erreichbar (MenuButton), eigener
// SchliessenButton. Feature "Notiz-/Highlight-Funktion" 09/2026.

import Link from "next/link";
import { db } from "../../src/db";
import { buchinhalte, buecher, konten, notizen } from "../../src/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import MenuButton from "../MenuButton";
import SchliessenButton from "../SchliessenButton";
import { FELD_LABEL, type NotizFeld } from "./actions";
import EntfernenButton from "./EntfernenButton";

export const dynamic = "force-dynamic";

export default async function NotizenSeite() {
  const [konto] = await db.select().from(konten).limit(1);

  if (!konto) {
    return (
      <main style={{ padding: 24, fontFamily: "Helvetica, Arial, sans-serif" }}>
        Kein Konto gefunden — <code>npx tsx src/db/seed.ts</code> ausführen.
      </main>
    );
  }

  const zeilen = await db
    .select({
      id: notizen.id,
      feld: notizen.feld,
      textAuszug: notizen.textAuszug,
      text: notizen.text,
      buchinhaltId: notizen.buchinhaltId,
      titel: buecher.titel,
    })
    .from(notizen)
    .innerJoin(buchinhalte, eq(notizen.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(and(eq(notizen.kontoId, konto.id), isNotNull(notizen.textAuszug)))
    .orderBy(desc(notizen.erstelltAm));

  type Zeile = (typeof zeilen)[number];
  type Gruppe = { buchinhaltId: string; titel: string; eintraege: Zeile[] };
  const gruppen: Gruppe[] = [];
  const index = new Map<string, number>();
  for (const zeile of zeilen) {
    if (!zeile.buchinhaltId) continue;
    const i = index.get(zeile.buchinhaltId);
    if (i === undefined) {
      index.set(zeile.buchinhaltId, gruppen.length);
      gruppen.push({ buchinhaltId: zeile.buchinhaltId, titel: zeile.titel, eintraege: [zeile] });
    } else {
      gruppen[i].eintraege.push(zeile);
    }
  }

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
        gap: 20,
        color: "var(--ink)",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SchliessenButton />
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Notizen</span>
        </div>
      </div>
      <MenuButton />

      {gruppen.length === 0 ? (
        <span style={{ fontSize: 16, lineHeight: 1.5, color: "rgba(36,35,31,.65)" }}>
          Noch keine Hervorhebungen — im Lesen-Screen Text markieren, um ihn hier zu sammeln.
        </span>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 24 }}>
          {gruppen.map((gruppe) => (
            <div key={gruppe.buchinhaltId} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Link href={`/lesen/${gruppe.buchinhaltId}`}>
                <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17 }}>
                  {gruppe.titel}
                </span>
              </Link>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {gruppe.eintraege.map((eintrag) => (
                  <div
                    key={eintrag.id}
                    style={{
                      boxSizing: "border-box",
                      padding: "12px 14px",
                      borderRadius: 14,
                      background: "linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.05)), var(--paper)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "Helvetica, Arial, sans-serif",
                        fontWeight: 600,
                        fontSize: 12,
                        letterSpacing: ".04em",
                        textTransform: "uppercase",
                        color: "rgba(36,35,31,.5)",
                      }}
                    >
                      {FELD_LABEL[eintrag.feld as NotizFeld]}
                    </span>
                    <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>„{eintrag.textAuszug}“</p>
                    {eintrag.text && (
                      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: "rgba(36,35,31,.7)" }}>
                        {eintrag.text}
                      </p>
                    )}
                    <EntfernenButton id={eintrag.id} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
