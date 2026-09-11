// middleware.ts
//
// Zugangsgate für die kostenfreie Testumgebung (siehe src/lib/testmodus.ts,
// Pendenz "andere Personen zur Prüfung/Rückmeldung testen lassen"). Greift
// NUR, wenn NEXT_PUBLIC_KI_DEAKTIVIERT="true" gesetzt ist — das ist exakt
// das separate Test-Deployment mit geklonter Neon-DB, nie die Haupt-
// Produktionsumgebung. Dort bleibt alles wie bisher, komplett ohne Login.
//
// Bewusst nur 1 gemeinsamer Zugangscode für alle Tester statt eines
// Rollensystems: die Testumgebung ist durch die separate DB und den
// KI-Deaktiviert-Schalter bereits vollständig von der echten App isoliert
// (keine Kosten, kein Einfluss auf die Haupt-Daten) — das Login dient hier
// nur als einfache Schwelle gegen zufälliges Herumklicken, nicht als echtes
// Berechtigungssystem.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { kiDeaktiviert } from "./src/lib/testmodus";

const OEFFENTLICHE_PFADE = ["/tester-zugang", "/api/cron"];
const OEFFENTLICHE_DATEIENDUNGEN = /\.(svg|png|jpg|jpeg|ico|webmanifest|json|txt)$/;

export function middleware(request: NextRequest) {
  if (!kiDeaktiviert()) return NextResponse.next();

  const pfad = request.nextUrl.pathname;
  if (
    OEFFENTLICHE_PFADE.some((p) => pfad === p || pfad.startsWith(`${p}/`)) ||
    OEFFENTLICHE_DATEIENDUNGEN.test(pfad)
  ) {
    return NextResponse.next();
  }

  const secret = process.env.TESTER_SESSION_SECRET;
  const cookie = request.cookies.get("tester_auth")?.value;
  if (secret && cookie === secret) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/tester-zugang";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
