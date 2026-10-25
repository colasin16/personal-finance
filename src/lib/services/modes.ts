import { getLlm } from "@/lib/services/llm";
import { getStorage } from "@/lib/services/storage";

/** Which adapters are live vs mocked — shown in the UI so it's obvious when running offline. */
export function serviceModes() {
  const llm = getLlm().name;
  return [
    { service: "Database", value: process.env.DATABASE_URL ? "Postgres" : "PGlite (embedded)", mocked: !process.env.DATABASE_URL },
    { service: "File storage", value: getStorage().kind === "local" ? "Local disk (.data/uploads)" : "Supabase Storage", mocked: getStorage().kind === "local" },
    { service: "Statement parser / categorizer", value: llm, mocked: llm.startsWith("mock") },
    { service: "Authentication", value: "Mock magic link (signed cookie)", mocked: true },
    { service: "Background jobs", value: "In-process queue", mocked: true },
  ];
}
