import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES, NAMESPACES, negotiateLocale } from "@/i18n/config";
import { localizeCategoryName } from "@/lib/i18n/categories";

const dir = join(__dirname, "..", "messages");
const load = (locale: string, ns: string) => JSON.parse(readFileSync(join(dir, locale, `${ns}.json`), "utf8"));
const keys = (obj: Record<string, unknown>, prefix = ""): string[] =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]));
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]).sort();

describe("translations", () => {
  it("has a file per namespace and locale", () => {
    for (const locale of LOCALES) expect(readdirSync(join(dir, locale)).sort()).toEqual(NAMESPACES.map((n) => `${n}.json`).sort());
  });

  for (const ns of NAMESPACES) {
    it(`${ns}: every locale has the same keys and placeholders as English`, () => {
      const en = load("en", ns);
      const enKeys = keys(en).sort();
      for (const locale of LOCALES.filter((l) => l !== "en")) {
        const other = load(locale, ns);
        expect(keys(other).sort(), `${locale}/${ns}.json`).toEqual(enKeys);
        for (const key of enKeys) {
          const get = (o: Record<string, unknown>) => key.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown>)[k], o) as string;
          expect(placeholders(get(other)), `${locale}/${ns}.json ${key}`).toEqual(placeholders(get(en)));
        }
      }
    });
  }

  it("negotiates the locale from Accept-Language", () => {
    expect(negotiateLocale("es-ES,es;q=0.9,en;q=0.8")).toBe("es");
    expect(negotiateLocale("fr-FR,en;q=0.5")).toBe("en");
    expect(negotiateLocale(undefined)).toBe("en");
  });

  it("translates built-in categories unless renamed", () => {
    expect(localizeCategoryName({ slug: "groceries", name: "Groceries" }, "es")).toBe("Supermercado");
    expect(localizeCategoryName({ slug: "groceries", name: "Food" }, "es")).toBe("Food");
    expect(localizeCategoryName({ slug: "groceries", name: "Groceries" }, "en")).toBe("Groceries");
    expect(localizeCategoryName({ slug: "custom-x", name: "Padel club" }, "es")).toBe("Padel club");
  });
});
