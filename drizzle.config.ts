// drizzle.config.ts — im Projekt-Root ablegen
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit lädt automatisch nur ".env", nicht ".env.local" — explizit laden.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
