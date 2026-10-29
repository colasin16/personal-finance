import { getStorage } from "@/lib/services/storage";
import { BRANDFETCH_CLIENT_ID } from "@/lib/banks";

/** Labels: messages/<locale>/settings.json `services.labels.<key>` and `services.values.<value>`. */
export type ServiceKey = "database" | "storage" | "auth" | "jobs" | "logos";
export type ServiceValue = "postgres" | "pglite" | "localDisk" | "supabase" | "mockMagicLink" | "inProcessQueue" | "brandfetch" | "lettermarks";
/** `detail` is untranslated technical info (e.g. a model or region) to show next to the value. */
export type ServiceMode = { key: ServiceKey; value: ServiceValue; mocked: boolean; detail?: string };

/** Which adapters are live vs mocked — shown in the UI so it's obvious when running offline. */
export function serviceModes(): ServiceMode[] {
  const localStorage = getStorage().kind === "local";
  return [
    { key: "database", value: process.env.DATABASE_URL ? "postgres" : "pglite", mocked: !process.env.DATABASE_URL },
    { key: "storage", value: localStorage ? "localDisk" : "supabase", mocked: localStorage },
    { key: "auth", value: "mockMagicLink", mocked: true },
    { key: "jobs", value: "inProcessQueue", mocked: true },
    { key: "logos", value: BRANDFETCH_CLIENT_ID ? "brandfetch" : "lettermarks", mocked: !BRANDFETCH_CLIENT_ID },
  ];
}
