/** Applies migrations and seeds banks on DATABASE_URL. The app doesn't migrate Postgres at runtime. */
import { createDb } from "@/lib/db";

if (!process.env.DATABASE_URL) {
  console.log("[db:migrate] DATABASE_URL not set, skipping (the embedded database migrates itself).");
} else {
  await createDb({ migrate: true });
  console.log("[db:migrate] done");
}
process.exit(0);
