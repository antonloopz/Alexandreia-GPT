"use server";
// app/tester-zugang/actions.ts
//
// Prüft den gemeinsamen Zugangscode der Testumgebung gegen
// TESTER_ZUGANGSCODE und setzt bei Erfolg ein httpOnly-Cookie mit dem
// separaten TESTER_SESSION_SECRET als Wert (siehe middleware.ts) — nie
// der Zugangscode selbst, damit ein Cookie-Leak den Code nicht verrät.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function zugangPruefen(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  const erwarteterCode = process.env.TESTER_ZUGANGSCODE;
  const secret = process.env.TESTER_SESSION_SECRET;

  if (!erwarteterCode || !secret || code !== erwarteterCode) {
    redirect("/tester-zugang?fehler=1");
  }

  const cookieStore = await cookies();
  cookieStore.set("tester_auth", secret, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180, // ~6 Monate
  });

  redirect("/");
}
