// app/api/cron/pruefen/route.ts
//
// Stufe 2 der täglichen Produktion (09/2026, siehe src/lib/fertigstellung.ts):
// prüft den ältesten gespeicherten Entwurf (Status "in_aufbereitung"),
// korrigiert leichte Fehler direkt und setzt ihn auf "geprueft"; bei
// schweren Fehlern wird der Entwurf gelöscht. Genau EIN Buch pro Aufruf.
// Läuft laut vercel.json zweimal (pruefen + pruefen-2), jeweils vor einem
// Lauf von Stufe 3. Wartet nichts, passiert nichts (keine API-Kosten).
//
// Absicherung wie app/api/cron/produzieren: CRON_SECRET als Bearer-Token.

import { NextRequest } from "next/server";
import { naechsterZuPruefender, pruefen } from "../../../../src/lib/fertigstellung";
import { kiDeaktiviert } from "../../../../src/lib/testmodus";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (kiDeaktiviert()) {
    return Response.json({ status: "testumgebung_deaktiviert" });
  }

  const buchinhaltId = await naechsterZuPruefender();
  if (!buchinhaltId) {
    return Response.json({ status: "nichts_zu_tun" });
  }

  const { status: pruefStatus, ...rest } = await pruefen(buchinhaltId);
  return Response.json({ status: "geprueft_lauf", pruefStatus, buchinhaltId, ...rest });
}
