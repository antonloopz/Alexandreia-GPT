// app/api/cron/fertigstellen/route.ts
//
// Stufe 3 der täglichen Produktion (09/2026, siehe src/lib/fertigstellung.ts):
// nimmt den ältesten Buchinhalt mit Status "geprueft" und stellt ihn fertig
// (Einordnung, "Das bleibt hängen", Wissensstatus pro Kernaussage, Quiz →
// "im_vorrat"). Bewusst genau EIN
// Buch pro Aufruf, damit ein Lauf sicher unter maxDuration (300 s, Vercel
// Hobby) bleibt. Läuft laut vercel.json zweimal morgens, jeweils nach
// einem Lauf von Stufe 2 (der zweite über die Route fertigstellen-2) —
// fängt einen Fehlschlag auf oder erledigt ein zweites wartendes Buch
// (z.B. vom Button "Jetzt aufbereiten" am Vortag).
// Wartet nichts, passiert nichts (keine API-Kosten).
//
// Absicherung wie app/api/cron/produzieren: CRON_SECRET als Bearer-Token.

import { NextRequest } from "next/server";
import { fertigstellen, naechsterFertigzustellender } from "../../../../src/lib/fertigstellung";
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

  const buchinhaltId = await naechsterFertigzustellender();
  if (!buchinhaltId) {
    return Response.json({ status: "nichts_zu_tun" });
  }

  const { status: buchStatus, ...rest } = await fertigstellen(buchinhaltId);
  return Response.json({ status: "fertiggestellt", buchStatus, ...rest });
}
