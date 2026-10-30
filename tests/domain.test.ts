import { describe, expect, it } from "vitest";
import { formatMoney, parseAmount, applyShare } from "@/lib/money";
import { findIbans, redactSensitive } from "@/lib/domain/redact";
import { normalizeMerchant, transactionFingerprint, withOrdinals } from "@/lib/domain/text";
import { fillRunningBalances, validateStatement } from "@/lib/domain/validation";
import { findMatchingRule, type CategoryRule } from "@/lib/domain/rules";
import { findMentionedAccount, findTransferPairs, rankTransferMatches } from "@/lib/domain/transfers";
import { findSectionIbans, selectAccountText } from "@/lib/domain/sections";
import { parseDate, parseStatement, selectParser } from "@/lib/parsers";
import { keywordCategorize } from "@/lib/domain/keywords";

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

describe("multi-product statement without years in dates", () => {
  const text = [
    "Saldo Inicial a 01/09/2026   Saldo final a 30/09/2026",
    "• Detalle",
    "Cuenta Uno - IBAN: ES7614650100912345678901   Saldo final 90,00€",
    "Fecha operación   Fecha valor   Concepto   Importe   Saldo total",
    "Saldo inicial   100,00 €",
    "05/09   05/09   Compra Tienda   -10,00 €   90,00 €",
    "Saldo final   90,00 €",
    "• Otro",
    "Cuenta Dos - IBAN: ES1201821234561234567890   Saldo final 500,00€",
    "Saldo inicial   400,00 €",
    "07/09   07/09   Nomina   100,00 €   500,00 €",
    "Saldo final   500,00 €",
    "• Fondos",
    "30/09   Saldo final   9,99 €   9,99 €",
  ].join("\n");

  it("keeps only the matching section and infers the year from the period", () => {
    const section = selectAccountText(text, (iban) => iban.endsWith("8901"));
    expect(section).not.toContain("Nomina");
    expect(section).not.toContain("9,99");
    const parsed = parseStatement(section);
    expect(parsed.openingBalance).toBe(100);
    expect(parsed.closingBalance).toBe(90);
    expect(parsed.transactions).toEqual([
      { date: "2026-09-05", valueDate: "2026-09-05", description: "Compra Tienda", amount: -10, balanceAfter: 90 },
    ]);
  });

  it("leaves text without IBAN headers untouched", () => {
    expect(selectAccountText("01/01/2026 Cafe -1,00", () => false)).toBe("01/01/2026 Cafe -1,00");
  });
});

describe("statement with an issue date and detail lines under each row", () => {
  const text = [
    "Extracto de cuenta",
    "Datos de la cuenta 1234   Fecha de emisión: 05/10/2026",
    "IBAN ES76 1465 0100 9123 4567 8901",
    "F.Oper.   F.Valor   Concepto   Importe   Saldo",
    "SALDO ANTERIOR - - - - - - - -   1.000,00",
    "28/09   28/09   COMPRA EN COMERCIO   -25,50   974,50",
    "A 1234567890123456 TIENDA UNO, S.A.",
    "30/09   01/10   TRANSFERENCIA RECIBIDA   100,00   1.074,50",
    "Alquiler octubre",
    "Texto legal de pie de página:",
    "TOTAL   1.074,50",
    "",
    "F.Oper.   F.Valor   Concepto   Importe   Saldo",
    "SALDO ANTERIOR - - - - - - - -   1.074,50",
    "02/10   02/10   RECIBO LUZ   -50,00   1.024,50",
  ].join("\n");

  it("reads year-less dates, joins detail lines without card numbers and ignores footers", () => {
    const parsed = parseStatement(text);
    expect(parsed.openingBalance).toBe(1000);
    expect(parsed.closingBalance).toBe(1024.5);
    expect(parsed.transactions.map((t) => [t.date, t.description, t.amount, t.balanceAfter])).toEqual([
      ["2026-09-28", "COMPRA EN COMERCIO TIENDA UNO, S.A.", -25.5, 974.5],
      ["2026-09-30", "TRANSFERENCIA RECIBIDA Alquiler octubre", 100, 1074.5],
      ["2026-10-02", "RECIBO LUZ", -50, 1024.5],
    ]);
    // The issue date (05/10) is when the document was produced, not the end of the period.
    expect([parsed.periodStart, parsed.periodEnd]).toEqual(["2026-09-28", "2026-10-02"]);
  });

  it("doesn't extend a monthly statement into the month it was issued", () => {
    const monthly = text.replace("05/10/2026", "01/10/2026").split("\n").slice(0, 9).join("\n");
    const parsed = parseStatement(monthly);
    expect([parsed.periodStart, parsed.periodEnd]).toEqual(["2026-09-28", "2026-09-30"]);
  });

  it("treats an IBAN repeated on every page as one account", () => {
    const repeated = `${text}\nIBAN ES76 1465 0100 9123 4567 8901`;
    expect(selectAccountText(repeated, () => true)).toBe(repeated);
    expect(findSectionIbans(repeated)).toEqual(["ES7614650100912345678901"]);
  });
});

describe("selectParser", () => {
  it("routes by layout when keyword detection picked another bank", () => {
    expect(selectParser("Saldo Inicial a 01/09/2026   Saldo final a 30/09/2026", "santander")?.bankId).toBe("ing");
    expect(selectParser("F.Oper.   F.Valor   Concepto   Importe   Saldo", null)?.bankId).toBe("bbva");
    expect(selectParser("01/01/2026 Cafe -1,00", "bbva")).toBeNull();
  });
});

describe("N26 statement", () => {
  const footer = [
    "ANA GARCIA LOPEZ   Tipo de cuenta: Cuenta Estándar   Emitido el",
    "Calle de la Luz 123, 28001 Madrid   IBAN: ES9115830001199876543210   05.10.2026",
    "BIC: NTSBESM1XXX   1/2026",
    "N26 Bank SE, Sucursal en España | texto legal",
  ];
  const text = [
    "Extracto bancario Nº 1/2026",
    "01.09.2026 hasta 30.09.2026",
    "Descripción   Fecha de reserva   Importe",
    "MERCADONA   02.09.2026   -25,40€",
    "Mastercard • Alimentación",
    "Fecha de valor 02.09.2026",
    "Ana Garcia Lopez   05.09.2026   +1.200,00€",
    "IBAN: ES7614650100912345678901 • BIC: INGDESMMXXX",
    "Nomina septiembre",
    "Fecha de valor 05.09.2026",
    "CAFE CENTRAL   29.09.2026   -3,50€",
    "Mastercard • Restaurantes",
    ...footer,
    "",
    "Resumen Nº 1/2026",
    "01.09.2026 hasta 30.09.2026",
    "Saldo previo   +100,00€",
    "Transacciones salientes   -28,90€",
    "Transacciones entrantes   +1.200,00€",
    "Tu nuevo saldo   1.271,10€",
    ...footer,
  ].join("\n");

  it("reads rows, detail lines, value dates and the summary balances", () => {
    expect(selectParser(text, "santander")?.bankId).toBe("n26");
    const parsed = parseStatement(text, "n26");
    expect(parsed.periodStart).toBe("2026-09-01");
    expect(parsed.periodEnd).toBe("2026-09-30");
    expect(parsed.openingBalance).toBe(100);
    expect(parsed.closingBalance).toBe(1271.1);
    expect(parsed.transactions.map((t) => [t.date, t.valueDate, t.description, t.amount])).toEqual([
      ["2026-09-02", "2026-09-02", "MERCADONA Mastercard • Alimentación", -25.4],
      ["2026-09-05", "2026-09-05", "Ana Garcia Lopez Nomina septiembre", 1200],
      ["2026-09-29", null, "CAFE CENTRAL Mastercard • Restaurantes", -3.5],
    ]);    expect(parseStatement(redactSensitive(text), "n26").transactions.map((t) => t.description)).toEqual(
      parsed.transactions.map((t) => t.description),
    );
  });

  it("finds the account's own IBAN but not counterparty ones", () => {
    expect(selectParser(text, "n26")?.accountIbans?.(text)).toEqual(["ES9115830001199876543210"]);
  });
});

describe("findMentionedAccount", () => {
  const accounts = [
    { id: "main", name: "Cuenta Principal" },
    { id: "trip", name: "Ahorro Vacaciones" },
    { id: "short", name: "Big" },
  ];

  it("finds another account named as whole words, accents and case aside", () => {
    expect(findMentionedAccount("Hacia ahorro vacaciones Espacios", accounts, "main")?.id).toBe("trip");
    expect(findMentionedAccount("Desde CUENTA PRINCIPAL", accounts, "trip")?.id).toBe("main");
  });

  it("ignores the own account, partial words and very short names", () => {
    expect(findMentionedAccount("Desde Cuenta Principal", accounts, "main")).toBeNull();
    expect(findMentionedAccount("AHORRO VACACIONESX", accounts, "main")).toBeNull();
    expect(findMentionedAccount("BIG BURGER", accounts, "main")).toBeNull();
  });
});

describe("rankTransferMatches", () => {
  const tx = { id: "t", accountId: "a", bookedAt: "2026-09-10", amountCents: -5000 };
  it("keeps mirror amounts in other accounts within the window, closest first", () => {
    const candidates = [
      { id: "far", accountId: "b", bookedAt: "2026-09-30", amountCents: 5000 },
      { id: "near", accountId: "c", bookedAt: "2026-09-11", amountCents: 5000 },
      { id: "same-account", accountId: "a", bookedAt: "2026-09-10", amountCents: 5000 },
      { id: "same-sign", accountId: "b", bookedAt: "2026-09-10", amountCents: -5000 },
      { id: "other-amount", accountId: "b", bookedAt: "2026-09-10", amountCents: 4999 },
      { id: "too-far", accountId: "b", bookedAt: "2026-11-01", amountCents: 5000 },
    ];
    expect(rankTransferMatches(tx, candidates).map((c) => c.id)).toEqual(["near", "far"]);
  });
});
