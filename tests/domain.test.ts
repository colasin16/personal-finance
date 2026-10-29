import { describe, expect, it } from "vitest";
import { formatMoney, parseAmount, applyShare } from "@/lib/money";
import { findIbans, redactSensitive } from "@/lib/domain/redact";
import { normalizeMerchant, transactionFingerprint, withOrdinals } from "@/lib/domain/text";
import { fillRunningBalances, validateStatement } from "@/lib/domain/validation";
import { findMatchingRule, type CategoryRule } from "@/lib/domain/rules";
import { findTransferPairs } from "@/lib/domain/transfers";
import { keywordCategorize, parseDate } from "@/lib/services/llm/mock";

describe("parseAmount", () => {
  it.each([
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["-12,00 €", -1200],
    ["12,00-", -1200],
    ["(12.00)", -1200],
    ["\u221245,30", -4530],
    ["+5", 500],
    ["1.234", 123400],
    ["0,5", 50],
    ["2.850,00", 285000],
  ])("%s → %d", (input, expected) => expect(parseAmount(input)).toBe(expected));

  it("rejects text", () => {
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("money", () => {
  it("formats euros in Spanish locale", () => {
    expect(formatMoney(123456).replace(/\s/g, " ")).toBe("1234,56 €");
    expect(formatMoney(-500, "EUR", { signed: true }).replace(/\s/g, " ")).toBe("-5,00 €");
  });
  it("applies ownership share", () => expect(applyShare(-10001, 50)).toBe(-5001));
});

describe("redaction", () => {
  it("masks IBANs, cards, ids, emails and phones", () => {
    const text = "IBAN: ES76 1465 0100 9123 4567 8901 tarjeta 4111 1111 1111 1234 DNI 12345678Z mail a@b.com tel 612 345 678";
    const redacted = redactSensitive(text);
    expect(redacted).not.toMatch(/9123 4567/);
    expect(redacted).toContain("[IBAN …8901]");
    expect(redacted).toContain("[CARD …1234]");
    expect(redacted).toContain("[ID]");
    expect(redacted).toContain("[EMAIL]");
    expect(redacted).toContain("[PHONE]");
  });
  it("finds IBANs", () => expect(findIbans("IBAN: ES76 1465 0100 9123 4567 8901")).toEqual(["ES7614650100912345678901"]));
});

describe("merchant & fingerprint", () => {
  it("normalizes merchants", () => {
    expect(normalizeMerchant("COMPRA TARJ. 4821 MERCADONA VALENCIA")).toBe("Mercadona Valencia");
    expect(normalizeMerchant("PAGO TARJETA NETFLIX.COM")).toBe("Netflix Com");
    expect(normalizeMerchant("RECIBO IBERDROLA CLIENTES SAU")).toBe("Iberdrola Clientes");
  });
  it("gives identical rows different ordinals so both survive dedupe", () => {
    const rows = withOrdinals([
      { bookedAt: "2026-05-01", amountCents: -100, description: "Coffee" },
      { bookedAt: "2026-05-01", amountCents: -100, description: "COFFEE" },
    ]);
    const fps = rows.map((r) => transactionFingerprint({ accountId: "a", ...r }));
    expect(fps[0]).not.toBe(fps[1]);
    expect(transactionFingerprint({ accountId: "a", ...rows[0]! })).toBe(fps[0]);
  });
});

describe("statement validation", () => {
  it("passes a consistent statement", () => {
    expect(
      validateStatement({
        openingBalanceCents: 1000,
        closingBalanceCents: 700,
        transactions: [
          { amountCents: -500, balanceAfterCents: 500 },
          { amountCents: 200, balanceAfterCents: 700 },
        ],
      }),
    ).toEqual([]);
  });
  it("detects totals and running balance mismatches", () => {
    const issues = validateStatement({
      openingBalanceCents: 1000,
      closingBalanceCents: 900,
      transactions: [{ amountCents: -500, balanceAfterCents: 400 }],
    });
    expect(issues.map((i) => i.kind)).toEqual(["balance_mismatch", "running_balance_mismatch"]);
  });
  it("fills running balances", () => {
    expect(fillRunningBalances(1000, [{ amountCents: -100, balanceAfterCents: null }]).at(0)?.balanceAfterCents).toBe(900);
  });
});

describe("rules", () => {
  const rules: CategoryRule[] = [
    { id: "1", matchType: "contains", pattern: "mercadona", categoryId: "groceries", priority: 100 },
    { id: "2", matchType: "merchant", pattern: "Mercadona Valencia", categoryId: "home", priority: 10 },
    { id: "3", matchType: "regex", pattern: "^NOMINA", categoryId: "salary", priority: 100 },
    { id: "4", matchType: "regex", pattern: "([", categoryId: "broken", priority: 1 },
  ];
  it("respects priority and ignores invalid regexes", () => {
    expect(findMatchingRule(rules, { description: "COMPRA MERCADONA", merchant: "Mercadona Valencia" })?.id).toBe("2");
    expect(findMatchingRule(rules, { description: "COMPRA MERCADONA", merchant: null })?.id).toBe("1");
    expect(findMatchingRule(rules, { description: "NOMINA ACME", merchant: null })?.id).toBe("3");
    expect(findMatchingRule(rules, { description: "UNKNOWN", merchant: null })).toBeNull();
  });
});

describe("transfer matching", () => {
  it("pairs opposite amounts across accounts within 3 days, closest first", () => {
    const pairs = findTransferPairs([
      { id: "out", accountId: "A", bookedAt: "2026-05-02", amountCents: -90000 },
      { id: "in-far", accountId: "B", bookedAt: "2026-05-05", amountCents: 90000 },
      { id: "in-near", accountId: "B", bookedAt: "2026-05-02", amountCents: 90000 },
      { id: "same-account", accountId: "A", bookedAt: "2026-05-02", amountCents: 90000 },
      { id: "too-late", accountId: "C", bookedAt: "2026-05-10", amountCents: 90000 },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.incoming.id).toBe("in-near");
  });
});

describe("offline categorizer", () => {
  const categories = [
    { slug: "groceries", name: "Groceries", kind: "expense" as const },
    { slug: "restaurants", name: "Restaurants", kind: "expense" as const },
    { slug: "salary", name: "Salary", kind: "income" as const },
    { slug: "other-income", name: "Other income", kind: "income" as const },
  ];
  it("matches keywords with whole-word rules", () => {
    expect(keywordCategorize({ id: "1", description: "COMPRA MERCADONA", merchant: null, amountCents: -100 }, categories).categorySlug).toBe("groceries");
    expect(keywordCategorize({ id: "2", description: "NOMINA ACME", merchant: null, amountCents: 100 }, categories)).toMatchObject({ categorySlug: "salary", confidence: 0.8 });
    expect(keywordCategorize({ id: "3", description: "BARBERIA JOSE", merchant: null, amountCents: -100 }, categories).categorySlug).toBeNull();
  });
  it("parses dates", () => {
    expect(parseDate("03/05/26")).toBe("2026-05-03");
    expect(parseDate("2026-05-03")).toBe("2026-05-03");
    expect(parseDate("31/13/2026")).toBeNull();
  });
});

describe("findIbans", () => {
  it("does not swallow the word that follows an IBAN", () => {
    expect(findIbans("IBAN: ES76 1465 0100 9123 4567 8901 Saldo final 90,00")).toEqual(["ES7614650100912345678901"]);
  });
});
