import { describe, expect, it } from "vitest";
import { normalizeHex, randomColor } from "@/lib/colors";
import { DEFAULT_PERIOD, parsePeriod, parseRangePeriod, rangePeriod } from "@/lib/dashboard-periods";
import { formatMoney, parseAmount, applyShare } from "@/lib/money";
import { findIbans, redactSensitive } from "@/lib/domain/redact";
import { normalizeMerchant, transactionFingerprint, withOrdinals } from "@/lib/domain/text";
import { fillRunningBalances, validateStatement } from "@/lib/domain/validation";
import { findMatchingRule, type CategoryRule } from "@/lib/domain/rules";
import { findMentionedAccount, findTransferPairs, rankTransferMatches } from "@/lib/domain/transfers";
import { findSectionIbans, selectAccountText } from "@/lib/domain/sections";
import { parseDate, parseStatement, selectParser } from "@/lib/parsers";
import { keywordCategorize } from "@/lib/domain/keywords";
import { netCashFlow } from "@/lib/domain/cashflow";
import { budgetStatus, effectiveBudgets, monthPace, planBudgetChange, suggestBudget, type BudgetRow } from "@/lib/domain/budgets";
import { DEFAULT_PAGE_SIZE, pageRange, parsePageSize } from "@/lib/pagination";
import { decryptBytes, encryptBytes, isEncrypted } from "@/lib/crypto";
import { EncryptedFileStorage } from "@/lib/services/storage";
import { bankFingerprints, coveredByBank, decimalToCents, dueReminder, matchBankId, minSyncFrom, syncWindow, toBankRow, type BankRow, type ProviderTransaction } from "@/lib/domain/bank-sync";
import { isMonthParam, monthBounds, monthSlots, needsAttention, shiftMonth } from "@/lib/statement-months";

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
    expect(formatMoney(123456).replace(/\s/g, " ")).toBe("1.234,56 €");
    expect(formatMoney(12345678).replace(/\s/g, " ")).toBe("123.456,78 €");
    expect(formatMoney(-500, "EUR", { signed: true }).replace(/\s/g, " ")).toBe("-5,00 €");
  });
  it("masks the digits of hidden amounts, keeping sign and currency", () => {
    const hidden = (cents: number, options = {}) => formatMoney(cents, "EUR", { hidden: true, ...options }).replace(/\s/g, " ");
    expect(hidden(123456)).toBe("•••• €");
    expect(hidden(-123456)).toBe("-•••• €");
    expect(hidden(500, { signed: true })).toBe("+•••• €");
    expect(hidden(123456789, { compact: true })).toBe("•••• €");
    expect(formatMoney(-500, "USD", { locale: "en-US", hidden: true })).toBe("-$••••");
  });
  it("formats amounts only through formatMoney, so incognito mode can't be skipped", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const offenders = readdirSync("src", { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && file !== "lib/money.ts")
      .filter((file) => /style:\s*["']currency["']/.test(readFileSync(`src/${file}`, "utf8")));
    expect(offenders).toEqual([]);
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

  it("keeps the issue date above a single-page statement's only IBAN", () => {
    const onePage = text.split("\n").slice(0, 11).join("\n");
    const section = selectAccountText(onePage, () => true);
    expect(section).toBe(onePage);
    expect(parseStatement(section, "bbva").transactions).toHaveLength(2);
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

describe("Sabadell statement", () => {
  const header = [
    "EXTRACTE DE COMPTE CORRENT",
    "PERÍODE DES DE 15.12.25 FINS A 14.01.26",
    "EL COMPTE   PÀG 1",
    "ES91 0081 0001 1998 7654 3210 ANA GARCIA LOPEZ   EUR",
    "Data Clau concepte   Càrrec (-) / Abonament (+) Valor Saldo   Núm Document",
    "OP VL",
  ];
  const footer = "Banc de Sabadell, S.A.   www.bancsabadell.com";
  const text = [
    ...header,
    "1512 SALDO ANTERIOR   1512 +   1.000,00",
    "2012 TRANSFERENCIA / PEPE PEREZ   -   50,00 2012 +   950,00",
    "2912 COMPRA TARJ. 4176XXXXXXXX1234 MERCADONA-VALENCIA -   12,34 2912 + 937,66",
    "3112 NOMINA EMPRESA, S.A.   +   1.234,56 0201 +   2.172,22   1   12,34 A",
    footer,
    "",
    ...header,
    "0301 COMPRA TARJ. 4176XXXXXXXX1234 CAFE - BAR SOL   -   2.200,00 0301 -   27,78   9-   999,99-A",
    footer,
  ].join("\n");

  it("reads signed rows across a year boundary, ignoring extra columns and repeated headers", () => {
    expect(selectParser(text, "santander")?.bankId).toBe("sabadell");
    const parsed = parseStatement(text, "sabadell");
    expect(parsed.parser).toBe("sabadell");
    expect(parsed.periodStart).toBe("2025-12-15");
    expect(parsed.periodEnd).toBe("2026-01-14");
    expect(parsed.openingBalance).toBe(1000);
    expect(parsed.closingBalance).toBe(-27.78);
    expect(parsed.transactions.map((t) => [t.date, t.valueDate, t.description, t.amount, t.balanceAfter])).toEqual([
      ["2025-12-20", "2025-12-20", "TRANSFERENCIA / PEPE PEREZ", -50, 950],
      ["2025-12-29", "2025-12-29", "COMPRA TARJ. MERCADONA-VALENCIA", -12.34, 937.66],
      ["2025-12-31", "2026-01-02", "NOMINA EMPRESA, S.A.", 1234.56, 2172.22],
      ["2026-01-03", "2026-01-03", "COMPRA TARJ. CAFE - BAR SOL", -2200, -27.78],
    ]);
  });

  it("finds the account's own IBAN", () => {
    expect(selectParser(text, "sabadell")?.accountIbans?.(text)).toEqual(["ES9100810001199876543210"]);
  });
});

describe("Sabadell monthly statement", () => {
  const page = (rows: string[], n: number) => [
    "Detall d'operacions de compte a la Vista",
    `EN SABADELL,02.01.26   2025/   ${n} DE 2`,
    "NIF.123456789 NIF.987654321   O1234",
    "Data   Concepte   Valor   Import   Saldo",
    ...rows,
    "IBAN",
    "ES91 0081 0001 1998 7654 3210   08001 BARCELONA (BARCELONA )",
    "Codi BIC: BSABESBB",
    "www.bancsabadell.com",
  ];
  const text = [
    ...page(
      [
        "0112 SALDO ANTERIOR   1.000,00H",
        "0212 TRANSFERENCIA / PEPE PEREZ   0212   50,00H   1.050,00H",
        "0512 COMPRA TARJ. 4176XXXXXXXX1234 MERCADONA VLC MERCADONA-VALENCIA 0612   12,34 D   1.037,66H",
      ],
      1,
    ),
    "",
    ...page(
      [
        "3012 NOMINA EMPRESA, S.A.   0101   1.234,56H   2.272,22H",
        "3112 COMPRA TARJ. 4176XXXXXXXX1234 CAFE BAR SOL   3112   2.300,00 D   27,78 D",
      ],
      2,
    ),
  ].join("\n");

  it("reads D/H-marked rows over the calendar month, anchoring years on the issue date", () => {
    expect(selectParser(text, "santander")?.bankId).toBe("sabadell");
    const parsed = parseStatement(text, "sabadell");
    expect(parsed.parser).toBe("sabadell");
    expect(parsed.periodStart).toBe("2025-12-01");
    expect(parsed.periodEnd).toBe("2025-12-31");
    expect(parsed.openingBalance).toBe(1000);
    expect(parsed.closingBalance).toBe(-27.78);
    expect(parsed.transactions.map((t) => [t.date, t.valueDate, t.description, t.amount, t.balanceAfter])).toEqual([
      ["2025-12-02", "2025-12-02", "TRANSFERENCIA / PEPE PEREZ", 50, 1050],
      ["2025-12-05", "2025-12-06", "COMPRA TARJ. MERCADONA VLC MERCADONA-VALENCIA", -12.34, 1037.66],
      ["2025-12-30", "2026-01-01", "NOMINA EMPRESA, S.A.", 1234.56, 2272.22],
      ["2025-12-31", "2025-12-31", "COMPRA TARJ. CAFE BAR SOL", -2300, -27.78],
    ]);
  });

  it("finds the account's own IBAN", () => {
    expect(selectParser(text, "sabadell")?.accountIbans?.(text)).toEqual(["ES9100810001199876543210"]);
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

describe("pagination", () => {
  it("lists every page when there are few", () => {
    expect(pageRange(1, 1)).toEqual([1]);
    expect(pageRange(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("adds ellipses around the current page, keeping first and last", () => {
    expect(pageRange(1, 20)).toEqual([1, 2, 3, 4, 5, null, 20]);
    expect(pageRange(4, 20)).toEqual([1, 2, 3, 4, 5, null, 20]);
    expect(pageRange(5, 20)).toEqual([1, null, 4, 5, 6, null, 20]);
    expect(pageRange(16, 20)).toEqual([1, null, 15, 16, 17, null, 20]);
    expect(pageRange(17, 20)).toEqual([1, null, 16, 17, 18, 19, 20]);
    expect(pageRange(20, 20)).toEqual([1, null, 16, 17, 18, 19, 20]);
  });

  it("only accepts the offered page sizes", () => {
    expect(parsePageSize("25")).toBe(25);
    expect(parsePageSize("100")).toBe(100);
    expect(parsePageSize("2000")).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe("statement months", () => {
  it("validates and shifts months across years", () => {
    expect(isMonthParam("2026-09")).toBe(true);
    expect(isMonthParam("2026-13")).toBe(false);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
    expect(monthBounds("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });

  it("flags unconfirmed, unassigned or undated statements as needing attention", () => {
    const base = { status: "confirmed", accountId: "a", periodStart: "2026-09-01", periodEnd: "2026-09-30" };
    expect(needsAttention(base)).toBe(false);
    expect(needsAttention({ ...base, status: "needs_review" })).toBe(true);
    expect(needsAttention({ ...base, accountId: null })).toBe(true);
    expect(needsAttention({ ...base, periodStart: null })).toBe(true);
  });

  it("builds one slot per account, marking gaps only after the account's first statement", () => {
    const st = (id: string, accountId: string, periodStart: string, periodEnd: string) => ({ id, accountId, periodStart, periodEnd });
    const accounts = [
      { id: "a", firstMonth: "2026-07" },
      { id: "b", firstMonth: "2026-07" },
      { id: "c", firstMonth: "2026-10" },
    ];
    const { slots, others } = monthSlots("2026-09", accounts, [
      st("1", "a", "2026-08-15", "2026-09-14"),
      st("2", "a", "2026-07-01", "2026-07-31"),
      st("3", "archived", "2026-09-01", "2026-09-30"),
    ]);
    expect(slots.map((s) => [s.account.id, s.statements.map((x) => x.id), s.missing])).toEqual([
      ["a", ["1"], false],
      ["b", [], true],
      ["c", [], false],
    ]);
    expect(others.map((s) => s.id)).toEqual(["3"]);
  });
});

describe("encryption at rest", () => {
  const memory = () => {
    const files = new Map<string, Uint8Array>();
    return { files, kind: "memory", put: async (k: string, b: Uint8Array) => void files.set(k, b), get: async (k: string) => files.get(k)!, remove: async (k: string) => void files.delete(k) };
  };

  it("stores files encrypted and reads them back", async () => {
    const inner = memory();
    const storage = new EncryptedFileStorage(inner);
    const pdf = new TextEncoder().encode("%PDF-1.7 IBAN ES7614650100912345678901");
    await storage.put("h/a.pdf", pdf);
    const raw = inner.files.get("h/a.pdf")!;
    expect(isEncrypted(raw)).toBe(true);
    expect(Buffer.from(raw).includes(Buffer.from("ES76"))).toBe(false);
    expect(await storage.get("h/a.pdf")).toEqual(pdf);
  });

  it("binds ciphertext to its key and passes legacy plaintext through", () => {
    const sealed = encryptBytes(new Uint8Array([1, 2, 3]), "a.pdf");
    expect(() => decryptBytes(sealed, "b.pdf")).toThrow();
    const legacy = new TextEncoder().encode("%PDF-1.4");
    expect(decryptBytes(legacy, "x.pdf")).toEqual(legacy);
  });
});

describe("dashboard periods", () => {
  it("accepts presets, months, years and ranges of at least a week", () => {
    expect(parsePeriod("1w")).toBe("1w");
    expect(parsePeriod("2026-08")).toBe("2026-08");
    expect(parsePeriod("2025")).toBe("2025");
    expect(parsePeriod("2026-03-01_2026-03-07")).toBe("2026-03-01_2026-03-07");
  });

  it("falls back to the default for unknown, malformed or too-short periods", () => {
    for (const value of [null, "ytd", "2026-13", "2026-03-01_2026-03-06", "2026-03-10_2026-03-01", "2026-03-01_x", "2026-03-01_2026-03-08_2026-04-01"]) {
      expect(parsePeriod(value)).toBe(DEFAULT_PERIOD);
    }
  });

  it("parses custom range bounds", () => {
    expect(parseRangePeriod(rangePeriod("2026-03-01", "2026-04-15"))).toEqual({ from: "2026-03-01", to: "2026-04-15" });
  });
});

describe("category colours", () => {
  it("normalises hex input to #rrggbb", () => {
    expect(normalizeHex("#57D858")).toBe("#57d858");
    expect(normalizeHex(" 57d858 ")).toBe("#57d858");
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("#57d85")).toBeNull();
    expect(normalizeHex("#zzzzzz")).toBeNull();
  });

  it("generates valid random colours", () => {
    for (let i = 0; i < 50; i++) expect(randomColor()).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("netCashFlow", () => {
  const isExpense = (id: string) => id === "restaurants" || id === "groceries";

  it("nets a reimbursement against its expense category instead of counting it as income", () => {
    const r = netCashFlow(
      [
        { amount: -10000, categoryId: "restaurants" },
        { amount: 5000, categoryId: "restaurants" },
        { amount: 200000, categoryId: "salary" },
      ],
      isExpense,
    );
    expect(r.income).toBe(200000);
    expect(r.expenses).toBe(5000);
    expect(r.byCategory.get("restaurants")).toEqual({ spent: 10000, reimbursed: 5000, cents: 5000, count: 2 });
  });

  it("counts uncategorized money in as income", () => {
    const r = netCashFlow([{ amount: 3000, categoryId: null }, { amount: -1000, categoryId: null }], isExpense);
    expect(r).toMatchObject({ income: 3000, expenses: 1000 });
  });

  it("moves an over-reimbursed category's excess to income, keeping income − expenses unchanged", () => {
    const flows = [
      { amount: -2000, categoryId: "restaurants" },
      { amount: 5000, categoryId: "restaurants" },
      { amount: -4000, categoryId: "groceries" },
    ];
    const r = netCashFlow(flows, isExpense);
    expect(r).toMatchObject({ income: 3000, expenses: 4000 });
    expect(r.byCategory.get("restaurants")?.cents).toBe(0);
    expect(r.income - r.expenses).toBe(flows.reduce((s, f) => s + f.amount, 0));
  });
});

describe("budgets", () => {
  const rows: BudgetRow[] = [
    { categoryId: "food", month: "2026-03", amountCents: 40000 },
    { categoryId: "food", month: "2026-06", amountCents: 50000 },
    { categoryId: "fun", month: "2026-04", amountCents: 10000 },
    { categoryId: "fun", month: "2026-05", amountCents: 0 },
  ];

  it("carries each budget forward until the next change, and 0 ends it", () => {
    expect(effectiveBudgets(rows, "2026-02")).toEqual(new Map());
    expect(effectiveBudgets(rows, "2026-04")).toEqual(new Map([["food", 40000], ["fun", 10000]]));
    expect(effectiveBudgets(rows, "2026-05")).toEqual(new Map([["food", 40000]]));
    expect(effectiveBudgets(rows, "2027-01")).toEqual(new Map([["food", 50000]]));
  });

  it("replaces later months when applying forward", () => {
    expect(planBudgetChange(rows, "food", "2026-04", 45000, true)).toEqual({ upserts: [{ month: "2026-04", amountCents: 45000 }], deleteAfter: "2026-04" });
  });

  it("keeps the following month unchanged when editing a single month", () => {
    expect(planBudgetChange(rows, "food", "2026-04", 45000, false).upserts).toEqual([
      { month: "2026-04", amountCents: 45000 },
      { month: "2026-05", amountCents: 40000 },
    ]);
    // The next month already has its own row (or would end up with the same amount): nothing else to write.
    expect(planBudgetChange(rows, "food", "2026-05", 30000, false).upserts).toEqual([{ month: "2026-05", amountCents: 30000 }]);
    expect(planBudgetChange(rows, "new", "2026-04", 20000, false).upserts).toEqual([
      { month: "2026-04", amountCents: 20000 },
      { month: "2026-05", amountCents: 0 },
    ]);
    expect(planBudgetChange(rows, "food", "2026-12", 50000, false).upserts).toEqual([{ month: "2026-12", amountCents: 50000 }]);
  });

  it("rates spending against the budget", () => {
    expect(budgetStatus(5000, 10000)).toBe("ok");
    expect(budgetStatus(8500, 10000)).toBe("near");
    expect(budgetStatus(10000, 10000)).toBe("near");
    expect(budgetStatus(10001, 10000)).toBe("over");
  });

  it("paces only the current month", () => {
    expect(monthPace("2026-11", "2026-11-11")).toEqual({ fraction: 11 / 30, daysLeft: 20 });
    expect(monthPace("2026-02", "2026-02-28")).toEqual({ fraction: 1, daysLeft: 1 });
    expect(monthPace("2026-10", "2026-11-11")).toBeNull();
  });

  it("suggests round budgets at or above the spending", () => {
    expect(suggestBudget(0)).toBe(0);
    expect(suggestBudget(4210)).toBe(4500);
    expect(suggestBudget(31234)).toBe(32000);
    expect(suggestBudget(32000)).toBe(32000);
    expect(suggestBudget(123456)).toBe(125000);
  });
});

describe("bank sync", () => {
  const tx = (over: Partial<ProviderTransaction> = {}): ProviderTransaction => ({
    entry_reference: "ref-1",
    transaction_amount: { currency: "EUR", amount: "12.30" },
    credit_debit_indicator: "DBIT",
    status: "BOOK",
    booking_date: "2026-11-02",
    value_date: "2026-11-03",
    creditor: { name: "MERCADONA" },
    remittance_information: ["Compra tarjeta 1234"],
    ...over,
  });

  it("parses decimal amounts to cents without float errors", () => {
    expect(decimalToCents("12.3")).toBe(1230);
    expect(decimalToCents("-0.05")).toBe(-5);
    expect(decimalToCents("1234,56")).toBe(123456);
    expect(decimalToCents("0.29")).toBe(29);
    expect(() => decimalToCents("abc")).toThrow();
  });

  it("maps provider transactions and skips pending or foreign-currency rows", () => {
    const debit = toBankRow(tx());
    expect(debit).toMatchObject({ bookedAt: "2026-11-02", valueDate: "2026-11-03", amountCents: -1230, externalId: "ref-1", description: "MERCADONA Compra tarjeta 1234" });
    expect(toBankRow(tx({ credit_debit_indicator: "CRDT", transaction_amount: { currency: "EUR", amount: "-5" }, debtor: { name: "ACME" } }))).toMatchObject({ amountCents: 500 });
    expect(toBankRow(tx({ status: "PDNG" }))).toEqual({ skip: "pending" });
    expect(toBankRow(tx({ transaction_amount: { currency: "USD", amount: "1" } }))).toEqual({ skip: "currency" });
    expect(toBankRow(tx({ booking_date: null, value_date: null, transaction_date: null }))).toEqual({ skip: "no_date" });
  });

  it("gives the same fingerprints when sync windows overlap", () => {
    const rows = [tx({ entry_reference: null }), tx({ entry_reference: null }), tx({ entry_reference: null, booking_date: "2026-11-04" }), tx()].map((t) => toBankRow(t) as BankRow);
    const full = bankFingerprints("acc", rows).map((r) => r.fingerprint);
    const later = bankFingerprints("acc", rows.slice(2)).map((r) => r.fingerprint);
    expect(new Set(full).size).toBe(4);
    expect(later.every((f) => full.includes(f))).toBe(true);
  });

  it("starts syncing the day after PDF coverage and refetches a week of overlap", () => {
    expect(minSyncFrom({ latestPeriodEnd: "2026-10-31", latestStatementTx: "2026-10-30" })).toBe("2026-11-01");
    expect(minSyncFrom({ latestPeriodEnd: null, latestStatementTx: null })).toBeNull();
    expect(syncWindow({ syncFrom: "2026-11-01", lastBankBookedAt: null, today: "2026-11-11" })).toEqual({ dateFrom: "2026-11-01", dateTo: "2026-11-11" });
    expect(syncWindow({ syncFrom: "2026-11-01", lastBankBookedAt: "2026-11-10", today: "2026-11-11" }).dateFrom).toBe("2026-11-03");
    expect(syncWindow({ syncFrom: "2026-11-01", lastBankBookedAt: "2026-11-03", today: "2026-11-11" }).dateFrom).toBe("2026-11-01");
  });

  it("sends each consent reminder once", () => {
    const now = new Date("2026-11-11T00:00:00Z");
    const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);
    expect(dueReminder(inDays(30), now, null)).toBeNull();
    expect(dueReminder(inDays(10), now, null)).toBe(14);
    expect(dueReminder(inDays(10), now, 14)).toBeNull();
    expect(dueReminder(inDays(2), now, 14)).toBe(3);
    expect(dueReminder(inDays(2), now, 3)).toBeNull();
    expect(dueReminder(inDays(-1), now, null)).toBeNull();
  });

  it("matches provider bank names to our banks", () => {
    const banks = [
      { id: "santander", name: "Santander", detectKeywords: ["SANTANDER"] },
      { id: "bbva", name: "BBVA", detectKeywords: ["BBVA"] },
      { id: "other", name: "Other", detectKeywords: [] },
    ];
    expect(matchBankId("Banco Santander", banks)).toBe("santander");
    expect(matchBankId("BBVA", banks)).toBe("bbva");
    expect(matchBankId("Revolut", banks)).toBe("other");
  });

  it("leaves PDF rows out where bank sync covers the date", () => {
    expect(coveredByBank("2026-11-02", { syncFrom: "2026-11-01", bankRange: null })).toBe(true);
    expect(coveredByBank("2026-10-31", { syncFrom: "2026-11-01", bankRange: null })).toBe(false);
    expect(coveredByBank("2026-10-15", { syncFrom: null, bankRange: { min: "2026-10-10", max: "2026-10-20" } })).toBe(true);
    expect(coveredByBank("2026-10-21", { syncFrom: null, bankRange: { min: "2026-10-10", max: "2026-10-20" } })).toBe(false);
  });
});
