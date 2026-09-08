// app/manifest.ts
//
// Next.js-Sonderdatei: wird automatisch als /manifest.webmanifest
// ausgeliefert, inkl. <link rel="manifest"> im <head> — kein manueller
// Eintrag in layout.tsx nötig. Macht die App auf Android "installierbar"
// (Chrome zeigt einen Install-Banner) und liefert Name/Icons/Farben, die
// auch iOS beim "Zum Home-Bildschirm" teilweise mitliest.
//
// Die referenzierten Icons (icon-192.png, icon-512.png) liegen als
// Next.js-Sonderdateien direkt in app/ — siehe app/icon.png. Für iOS ist
// eigentlich app/apple-icon.png entscheidend (separate Konvention).

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Alexandreia — Ein Buch pro Tag",
    short_name: "Alexandreia",
    description: "Ein Buch pro Tag.",
    start_url: "/",
    display: "standalone",
    background_color: "#F2F4EF",
    theme_color: "#F2F4EF",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
