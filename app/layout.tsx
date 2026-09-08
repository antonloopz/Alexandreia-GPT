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
  // Titel unter dem Icon.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Alexandreia",
  },
};

export const viewport: Viewport = {
  themeColor: "#F2F4EF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={workSans.variable}>
      <body>{children}</body>
    </html>
  );
}
