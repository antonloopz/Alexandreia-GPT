// app/bookshelf/page.tsx
//
// Ersetzt den bisherigen "Archiv"-Screen. Zeigt ALLE fertig produzierten
// Bücher ("im_vorrat"), nicht nur die schon gezeigten — Archiv kannte nur
// die Historie, aber weil die Content-Pipeline oft schneller produziert als
// ein Buch pro Tag gezeigt wird, wartet meist noch einiges an fertigen,
// noch nie gezeigten Büchern im Vorrat. Drei Bereiche: heutiges Buch
// (gepinnt), "Gelesen" (Historie, wie bisher Archiv), "Bereit" (fertig,
// aber diesem Konto noch nie gezeigt — direkt lesbar über "Jetzt lesen").
// Bewusst kein Coverbild (dafür gibt's aktuell keine Datenquelle) —
// Kategorie-farbiges Icon als Platzhalter, wie zuvor in Archiv.

import Link from "next/link";
import { db } from "../../src/db";
import { buchinhalte, buecher, gezeigteBuecher, konten } from "../../src/db/schema";
import { and, eq } from "drizzle-orm";
import { KATEGORIE_FARBE, KATEGORIE_LABEL } from "../../src/lib/kategorien";
import MenuButton from "../MenuButton";

export const dynamic = "force-dynamic";

function BuchIcon({ kategorie }: { kategorie: string }) {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 10,
        background: KATEGORIE_FARBE[kategorie] ?? "#ccc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 6.5c-1.8-1.3-4.2-1.8-6.5-1.3v11c2.3-.5 4.7 0 6.5 1.3 1.8-1.3 4.2-1.8 6.5-1.3v-11c-2.3-.5-4.7 0-6.5 1.3Z" />
        <path d="M12 6.5v11" />
      </svg>
    </div>
  );
}

export default async function BookshelfSeite() {
  const [konto] = await db.select().from(konten).limit(1);

  if (!konto) {
    return (
      <main style={{ padding: 24, fontFamily: "Helvetica, Arial, sans-serif" }}>
        Kein Konto gefunden — <code>npx tsx src/db/seed.ts</code> ausführen.
      </main>
    );
  }

  const heute = new Date();

  const [heutigesBuch] = await db
    .select({
      buchinhaltId: buchinhalte.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
      umfang: buecher.umfang,
    })
    .from(gezeigteBuecher)
    .innerJoin(buchinhalte, eq(gezeigteBuecher.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(and(eq(gezeigteBuecher.kontoId, konto.id), eq(gezeigteBuecher.datumGezeigt, heute)));

  const alleImVorrat = await db
    .select({
      buchinhaltId: buchinhalte.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
      umfang: buecher.umfang,
    })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.status, "im_vorrat"));

  const gezeigtRows = await db
    .select({ buchinhaltId: gezeigteBuecher.buchinhaltId, datumGezeigt: gezeigteBuecher.datumGezeigt })
    .from(gezeigteBuecher)
    .where(eq(gezeigteBuecher.kontoId, konto.id));

  const letztesDatumProBuchinhalt = new Map<string, Date>();
  for (const zeile of gezeigtRows) {
    if (zeile.buchinhaltId === heutigesBuch?.buchinhaltId) continue; // separat gepinnt
    const bestehend = letztesDatumProBuchinhalt.get(zeile.buchinhaltId);
    if (!bestehend || zeile.datumGezeigt > bestehend) {
      letztesDatumProBuchinhalt.set(zeile.buchinhaltId, zeile.datumGezeigt);
    }
  }

  const uebrige = alleImVorrat.filter((b) => b.buchinhaltId !== heutigesBuch?.buchinhaltId);

  const gelesen = uebrige
    .filter((b) => letztesDatumProBuchinhalt.has(b.buchinhaltId))
    .sort((a, b) => letztesDatumProBuchinhalt.get(b.buchinhaltId)!.getTime() - letztesDatumProBuchinhalt.get(a.buchinhaltId)!.getTime());

  const bereit = uebrige
    .filter((b) => !letztesDatumProBuchinhalt.has(b.buchinhaltId))
    .sort((a, b) => a.titel.localeCompare(b.titel));

  const gesamtAnzahl = alleImVorrat.length;

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
          <Link href="/" aria-label="Schliessen">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </Link>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 20 }}>Bibliothek</span>
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
        {gesamtAnzahl === 1 ? "1 Buch fertig" : `${gesamtAnzahl} Bücher fertig`}
      </span>

      {gesamtAnzahl === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            textAlign: "center",
          }}
        >
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
            <rect x="4.5" y="8.5" width="15" height="11" rx="1.5" />
            <path d="M4.5 8.5V6a1.5 1.5 0 0 1 1.5-1.5h12A1.5 1.5 0 0 1 19.5 6v2.5" />
            <line x1="10" y1="13" x2="14" y2="13" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 250 }}>
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17 }}>Noch keine Bücher fertig</span>
            <span style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(36,35,31,.65)" }}>
              Sobald die Pipeline das erste Buch produziert hat, erscheint es hier.
            </span>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, overflowY: "auto" }}>
          {heutigesBuch && (
            <div
              style={{
                boxSizing: "border-box",
                padding: "14px 16px",
                borderRadius: 14,
                background: "#24231F",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                <span
                  style={{
                    fontFamily: "Helvetica, Arial, sans-serif",
                    fontWeight: 600,
                    fontSize: 11,
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                    color: "rgba(251,250,247,.65)",
                  }}
                >
                  Heute · {KATEGORIE_LABEL[heutigesBuch.kategorie] ?? heutigesBuch.kategorie}
                </span>
                <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 15, color: "#FBFAF7" }}>
                  {heutigesBuch.titel}
                </span>
                <span style={{ fontSize: 12.5, color: "rgba(251,250,247,.75)" }}>{heutigesBuch.autor}</span>
                {heutigesBuch.umfang && (
                  <span style={{ fontSize: 11.5, color: "rgba(251,250,247,.55)" }}>{heutigesBuch.umfang}</span>
                )}
              </div>
            </div>
          )}

          {bereit.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span
                style={{
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontWeight: 600,
                  fontSize: 11,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "rgba(36,35,31,.5)",
                }}
              >
                Bereit ({bereit.length})
              </span>
              {bereit.map((buch) => (
                <div
                  key={buch.buchinhaltId}
                  style={{
                    boxSizing: "border-box",
                    padding: "14px 16px",
                    borderRadius: 14,
                    background: "linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.05)), var(--paper)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <BuchIcon kategorie={buch.kategorie} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 15 }}>{buch.titel}</span>
                    <span style={{ fontSize: 12.5, color: "rgba(36,35,31,.65)" }}>{buch.autor}</span>
                    {buch.umfang && (
                      <span style={{ fontSize: 11.5, color: "rgba(36,35,31,.5)" }}>{buch.umfang}</span>
                    )}
                  </div>
                  <Link href={`/lesen/${buch.buchinhaltId}`} aria-label="Jetzt lesen">
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#24231F", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={KATEGORIE_FARBE[buch.kategorie] ?? "#FBFAF7"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.5 5.5 16 12l-6.5 6.5" />
                      </svg>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          )}

          {gelesen.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span
                style={{
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontWeight: 600,
                  fontSize: 11,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "rgba(36,35,31,.5)",
                }}
              >
                Gelesen ({gelesen.length})
              </span>
              {gelesen.map((buch) => (
                <div
                  key={buch.buchinhaltId}
                  style={{
                    boxSizing: "border-box",
                    padding: "14px 16px",
                    borderRadius: 14,
                    background: "linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.05)), var(--paper)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <BuchIcon kategorie={buch.kategorie} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 15 }}>{buch.titel}</span>
                    <span style={{ fontSize: 12.5, color: "rgba(36,35,31,.65)" }}>
                      {buch.autor} · gelesen{" "}
                      {new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" }).format(
                        letztesDatumProBuchinhalt.get(buch.buchinhaltId)!
                      )}
                    </span>
                    {buch.umfang && (
                      <span style={{ fontSize: 11.5, color: "rgba(36,35,31,.5)" }}>{buch.umfang}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
