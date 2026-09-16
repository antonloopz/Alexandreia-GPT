// app/einstellungen/obsidian-export/route.ts
//
// Route Handler statt Server Action — ein Datei-Download mit
// Content-Disposition braucht einen echten HTTP-Response, den eine Server
// Action nicht liefern kann. Aufgerufen per einfachem <a href>-Link aus
// app/einstellungen/page.tsx (kein Client-JS nötig). Siehe src/lib/
// obsidian.ts für die eigentliche Export-Logik (09/2026, Pendenz
// "Obsidian-Export für Notizen fertigstellen").

import { db } from "../../../src/db";
import { konten } from "../../../src/db/schema";
import { obsidianExportDurchfuehren } from "../../../src/lib/obsidian";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) {
    return new Response("Kein Konto gefunden.", { status: 404 });
  }

  const ergebnis = await obsidianExportDurchfuehren(konto.id);
  if (!ergebnis) {
    // Kann nur bei einer Race Condition passieren (z.B. zwei offene Tabs) —
    // die Einstellungen-Seite blendet den Link sonst aus, wenn nichts
    // fällig ist. Zurück zu den Einstellungen statt eines leeren Downloads.
    return Response.redirect(new URL("/einstellungen?export=leer", request.url), 303);
  }

  const datum = new Date().toISOString().slice(0, 10);
  // "as BodyInit": bekannter, rein typseitiger Konflikt zwischen dem
  // generischen Uint8Array<ArrayBufferLike>, das JSZip liefert, und dem
  // von aktuellen TS-DOM-Typen strikter geforderten Uint8Array<ArrayBuffer>
  // (seit TS 5.7 verschärft) — zur Laufzeit nimmt Response ein Uint8Array
  // problemlos entgegen, das ist nur ein Typing-Mismatch der Bibliotheken.
  return new Response(ergebnis.zip as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="alexandreia-obsidian-export-${datum}.zip"`,
      "Content-Length": String(ergebnis.zip.length),
    },
  });
}
