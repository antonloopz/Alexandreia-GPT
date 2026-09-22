This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## GPT-Ableger: erster Start

- `DATABASE_URL`: ausschliesslich die Verbindung zum Neon-Branch `alexandreia-gpt` verwenden.
- `NEXT_PUBLIC_KI_DEAKTIVIERT=true`: kostenpflichtige KI-Funktionen bleiben deaktiviert.
- `ANTHROPIC_API_KEY=test-mode-disabled`: Platzhalter für die Client-Initialisierung, kein gültiger API-Schlüssel.
- `CRON_SECRET` nicht setzen: Cron-Endpunkte weisen Aufrufe zurück.
- `TESTER_ZUGANG_AKTIV` nicht setzen: kein Testzugang erforderlich. Dieser Schalter ist unabhängig von der KI-Deaktivierung.

Nur für einen optionalen Testzugang `TESTER_ZUGANG_AKTIV=true` sowie eigene Werte für `TESTER_ZUGANGSCODE` und `TESTER_SESSION_SECRET` setzen.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
