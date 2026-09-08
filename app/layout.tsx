// app/layout.tsx

import type { Metadata, Viewport } from "next";
import { Work_Sans } from "next/font/google";
import "./globals.css";

const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-work-sans",
});

export const metadata: Metadata = {
  title: "Alexandreia",
  description: "Ein Buch pro Tag",
  // iOS-Homescreen-Icon (public/apple-icon-180.png). Das Web-Manifest
  // (app/manifest.ts) wird von Next.js automatisch verlinkt, dafür ist
  // hier kein eigener Eintrag nötig.
  icons: {
    apple: "/apple-icon-180.png",
  },
  // Macht "Zum Home-Bildschirm hinzufügen" auf iOS zu einer echten
  // Standalone-App (kein Safari-Adressleisten-/Tab-UI mehr), mit eigenem
  // Titel unter dem Icon. "black-translucent" statt "default": iOS kennt
  // nur drei feste Stile (default = deckend weiss, black = deckend
  // schwarz, black-translucent = durchsichtig, zeigt was dahinter liegt).
  // Nur mit black-translucent lässt sich die Statusleiste farbig einfärben
  // — siehe der feste Ink-Streifen unten im <body>.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Alexandreia",
  },
};

export const viewport: Viewport = {
  // width/initialScale fehlten in der vorherigen Version — dadurch hat der
  // eigene viewport-Export den impliziten Next.js-Standard
  // ("width=device-width, initial-scale=1") komplett ersetzt statt ergänzt.
  // Ohne die beiden Werte rendert Safari die Seite in der Desktop-Breite
  // (980px) herunterskaliert -> genau der Effekt, dass oben Platz fehlt
  // und man scrollen muss, um "Guten Tag, Toni" zu sehen. Jetzt wieder
  // explizit alle drei Werte zusammen.
  width: "device-width",
  initialScale: 1,
  themeColor: "#F2F4EF",
  // Nötig, damit der Ink-Streifen unten überhaupt bis unter die Notch/
  // Dynamic Island reicht (sonst bleibt env(safe-area-inset-top) = 0).
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={workSans.variable}>
      <body>
        {/* Füllt die Statusleisten-Fläche (Uhrzeit/Signal) im Standalone-
            Modus mit der Ink-Farbe. Ausserhalb der installierten App (z.B.
            normaler Safari-Tab, oder Geräte ohne Notch) ist
            env(safe-area-inset-top) = 0 und der Streifen unsichtbar. */}
        <div className="status-bar-fill" aria-hidden />
        {children}
      </body>
    </html>
  );
}
