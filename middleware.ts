// middleware.ts
//
// Optionaler gemeinsamer Testzugang, nur mit TESTER_ZUGANG_AKTIV="true".
// Unabhängig von NEXT_PUBLIC_KI_DEAKTIVIERT: Der GPT-Ableger kann ohne
// Testzugang laufen, während kostenpflichtige KI-Funktionen deaktiviert sind.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const OEFFENTLICHE_PFADE = ["/tester-zugang", "/api/cron"];
const OEFFENTLICHE_DATEIENDUNGEN = /\.(svg|png|jpg|jpeg|ico|webmanifest|json|txt)$/;

export function middleware(request: NextRequest) {
  if (process.env.TESTER_ZUGANG_AKTIV !== "true") return NextResponse.next();

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
