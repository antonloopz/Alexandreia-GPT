// app/tester-zugang/page.tsx
//
// Einzige Login-Seite der App — existiert funktional nur in der
// kostenfreien Testumgebung (siehe middleware.ts, greift nur dort). Bewusst
// simple: 1 Eingabefeld für den gemeinsamen Zugangscode, kein Konto-/
// Passwort-Konzept nötig, da die Testumgebung ohnehin komplett von der
// Haupt-App/DB getrennt ist (siehe src/lib/testmodus.ts).

import { zugangPruefen } from "./actions";

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

export default async function TesterZugangSeite({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string }>;
}) {
  const { fehler } = await searchParams;

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
        justifyContent: "center",
        gap: 24,
        color: "var(--ink)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>
          Alexandreia — Testversion
        </span>
        <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontSize: 15, color: "rgba(36,35,31,.6)" }}>
          Voll funktionsfähig, ausser Funktionen mit echten Kosten.
        </span>
      </div>

      {fehler && (
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
          Zugangscode falsch — bitte erneut versuchen.
        </div>
      )}

      <form action={zugangPruefen} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={labelStil} htmlFor="code">Zugangscode</label>
          <input style={feldStil} type="password" id="code" name="code" required autoFocus placeholder="•••••" />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            aria-label="Anmelden"
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
