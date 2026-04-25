import { defineConfig } from "drizzle-kit";

const env =
  (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env ?? {};

export default defineConfig({
  dbCredentials: {
    accountId: env.CLOUDFLARE_ACCOUNT_ID ?? "",
    databaseId: env.CLOUDFLARE_D1_DATABASE_ID ?? "",
    token: env.CLOUDFLARE_D1_TOKEN ?? env.CLOUDFLARE_API_TOKEN ?? "",
  },
  dialect: "sqlite",
  driver: "d1-http",
  out: "./migrations",
  schema: "./src/db/d1-schema.ts",
});
