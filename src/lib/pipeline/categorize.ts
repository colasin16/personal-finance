import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { accounts, categories, categoryRules, transactions } from "@/lib/db/schema";
import { findMatchingRule, ruleMatches, type MatchType } from "@/lib/domain/rules";
import { findMentionedAccount, findTransferPairs } from "@/lib/domain/transfers";
import { normalizeDescription } from "@/lib/domain/text";
import { getLlm, type LlmProvider } from "@/lib/services/llm";

export const LLM_CONFIDENCE_THRESHOLD = 0.6;

/** Latest user-chosen category per merchant ("merchant memory"). */
async function merchantMemory(db: Db, householdId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ merchant: transactions.merchant, categoryId: transactions.categoryId, createdAt: transactions.createdAt })
    .from(transactions)
    .where(and(eq(transactions.householdId, householdId), eq(transactions.categorizedBy, "user")))
    .orderBy(transactions.createdAt);
  const memory = new Map<string, string>();
  for (const row of rows) if (row.merchant && row.categoryId) memory.set(normalizeDescription(row.merchant), row.categoryId);
  return memory;
}

const householdAccounts = (db: Db, householdId: string) =>
  db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.householdId, householdId));

/**
 * Categorizes transactions in order of precedence: household rules → another of our accounts named in the
 * description (a transfer, even before its other side is imported) → merchant memory → LLM.
 * Never overrides choices made by a user or transfer links. Low-confidence results are flagged for review.
 */
export async function categorizeTransactions(
  db: Db,
  householdId: string,
  transactionIds: string[],
  llm: LlmProvider = getLlm(),
) {
  if (transactionIds.length === 0) return { byRule: 0, byAccountName: 0, byMerchant: 0, byLlm: 0, flagged: 0 };

  const [householdCategories, rules, memory, ownAccounts, pending] = await Promise.all([
    db.select().from(categories).where(eq(categories.householdId, householdId)),
    db.select().from(categoryRules).where(eq(categoryRules.householdId, householdId)),
    merchantMemory(db, householdId),
    householdAccounts(db, householdId),
    db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, householdId),
          inArray(transactions.id, transactionIds),
          or(isNull(transactions.categorizedBy), and(ne(transactions.categorizedBy, "user"), ne(transactions.categorizedBy, "transfer"))),
        ),
      ),
  ]);

  const slugToId = new Map(householdCategories.map((c) => [c.slug, c.id]));
  const ruleHits = new Map<string, number>();
  const updates: {
    id: string;
    categoryId: string | null;
    by: "rule" | "transfer" | "merchant" | "llm" | null;
    ruleId?: string;
    confidence: number;
    flag: string | null;
  }[] = [];
  const forLlm: typeof pending = [];

  for (const tx of pending) {
    const rule = findMatchingRule(rules, { description: tx.descriptionRaw, merchant: tx.merchant });
    if (rule) {
      updates.push({ id: tx.id, categoryId: rule.categoryId, by: "rule", ruleId: rule.id, confidence: 1, flag: null });
      ruleHits.set(rule.id, (ruleHits.get(rule.id) ?? 0) + 1);
      continue;
    }
    const transfersId = slugToId.get("transfers");
    if (transfersId && findMentionedAccount(`${tx.descriptionRaw} ${tx.merchant ?? ""}`, ownAccounts, tx.accountId)) {
      updates.push({ id: tx.id, categoryId: transfersId, by: "transfer", confidence: 0.9, flag: null });
      continue;
    }
    const remembered = tx.merchant ? memory.get(normalizeDescription(tx.merchant)) : undefined;
    if (remembered) {
      updates.push({ id: tx.id, categoryId: remembered, by: "merchant", confidence: 0.95, flag: null });
      continue;
    }
    forLlm.push(tx);
  }

  const options = householdCategories.map((c) => ({ slug: c.slug, name: c.name, kind: c.kind }));
  for (let i = 0; i < forLlm.length; i += 50) {
    const batch = forLlm.slice(i, i + 50);
    const results = await llm.categorize(
      batch.map((t) => ({ id: t.id, description: t.descriptionRaw, merchant: t.merchant, amountCents: t.amountCents })),
      options,
    );
    const byId = new Map(results.map((r) => [r.id, r]));
    for (const tx of batch) {
      const result = byId.get(tx.id);
      const categoryId = result?.categorySlug ? (slugToId.get(result.categorySlug) ?? null) : null;
      const confidence = categoryId ? (result?.confidence ?? 0) : 0;
      const confident = confidence >= LLM_CONFIDENCE_THRESHOLD;
      updates.push({
        id: tx.id,
        categoryId: confident ? categoryId : null,
        by: confident ? "llm" : null,
        confidence,
        flag: confident ? null : categoryId ? "low_confidence" : "uncategorized",
      });
    }
  }

  for (const u of updates) {
    await db
      .update(transactions)
      .set({
        categoryId: u.categoryId,
        categorizedBy: u.by,
        ruleId: u.ruleId ?? null,
        categoryConfidence: u.confidence,
        flagged: u.flag !== null,
        flagReason: u.flag,
      })
      .where(eq(transactions.id, u.id));
  }
  for (const [ruleId, hits] of ruleHits) {
    await db.update(categoryRules).set({ hits: sql`${categoryRules.hits} + ${hits}` }).where(eq(categoryRules.id, ruleId));
  }

  return {
    byRule: updates.filter((u) => u.by === "rule").length,
    byAccountName: updates.filter((u) => u.by === "transfer").length,
    byMerchant: updates.filter((u) => u.by === "merchant").length,
    byLlm: updates.filter((u) => u.by === "llm").length,
    flagged: updates.filter((u) => u.flag).length,
  };
}

/** Transactions (not set by a user) that a rule would recategorize. */
export async function previewRule(
  db: Db,
  householdId: string,
  rule: { matchType: MatchType; pattern: string; categoryId: string },
) {
  const rows = await db
    .select({
      id: transactions.id,
      descriptionRaw: transactions.descriptionRaw,
      merchant: transactions.merchant,
      categoryId: transactions.categoryId,
      categorizedBy: transactions.categorizedBy,
    })
    .from(transactions)
    .where(and(eq(transactions.householdId, householdId), isNull(transactions.transferGroupId), isNull(transactions.excludedAt)));
  return rows.filter(
    (t) => t.categorizedBy !== "user" && t.categoryId !== rule.categoryId && ruleMatches(rule, { description: t.descriptionRaw, merchant: t.merchant }),
  );
}

export async function applyRuleRetroactively(db: Db, householdId: string, ruleId: string) {
  const [rule] = await db
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.id, ruleId), eq(categoryRules.householdId, householdId)));
  if (!rule) return 0;
  const matches = await previewRule(db, householdId, rule);
  if (matches.length === 0) return 0;
  await db
    .update(transactions)
    .set({ categoryId: rule.categoryId, categorizedBy: "rule", ruleId: rule.id, categoryConfidence: 1, flagged: false, flagReason: null })
    .where(inArray(transactions.id, matches.map((m) => m.id)));
  await db.update(categoryRules).set({ hits: sql`${categoryRules.hits} + ${matches.length}` }).where(eq(categoryRules.id, rule.id));
  return matches.length;
}

const TRANSFER_HINT = /(TRANSFERENCIA|TRANSF\.?|TRASPASO|TRANSFER)/;

export async function linkTransfer(db: Db, householdId: string, outgoingId: string, incomingId: string) {
  const [transferCategory] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.householdId, householdId), eq(categories.slug, "transfers")));
  const groupId = crypto.randomUUID();
  await db
    .update(transactions)
    .set({
      transferGroupId: groupId,
      categoryId: transferCategory?.id ?? null,
      categorizedBy: "transfer",
      categoryConfidence: 1,
      flagged: false,
      flagReason: null,
    })
    .where(and(eq(transactions.householdId, householdId), inArray(transactions.id, [outgoingId, incomingId])));
  return groupId;
}

export async function unlinkTransfer(db: Db, householdId: string, transferGroupId: string) {
  const rows = await db
    .update(transactions)
    .set({ transferGroupId: null, categorizedBy: null, categoryId: null })
    .where(and(eq(transactions.householdId, householdId), eq(transactions.transferGroupId, transferGroupId)))
    .returning({ id: transactions.id });
  await categorizeTransactions(db, householdId, rows.map((r) => r.id));
}

/** Unlinked opposite movements between our own accounts. */
export async function findTransferSuggestions(db: Db, householdId: string, accountIds?: string[]) {
  const ownAccounts = await householdAccounts(db, householdId);
  const rows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      bookedAt: transactions.bookedAt,
      amountCents: transactions.amountCents,
      descriptionRaw: transactions.descriptionRaw,
      categorizedBy: transactions.categorizedBy,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        isNull(transactions.transferGroupId),
        isNull(transactions.excludedAt),
        accountIds ? inArray(transactions.accountId, accountIds) : undefined,
      ),
    );
  const candidates = rows.filter((r) => r.categorizedBy !== "user");
  const byId = new Map(candidates.map((r) => [r.id, r]));
  // Does one side's description name the account on the other side?
  const namesOther = (tx: { descriptionRaw: string; accountId: string }, otherAccountId: string) =>
    findMentionedAccount(tx.descriptionRaw, ownAccounts.filter((a) => a.id === otherAccountId), tx.accountId) !== null;
  return findTransferPairs(candidates).map((pair) => {
    const outgoing = byId.get(pair.outgoing.id)!;
    const incoming = byId.get(pair.incoming.id)!;
    return {
      ...pair,
      outgoingDescription: outgoing.descriptionRaw,
      incomingDescription: incoming.descriptionRaw,
      likely:
        TRANSFER_HINT.test(normalizeDescription(outgoing.descriptionRaw)) ||
        TRANSFER_HINT.test(normalizeDescription(incoming.descriptionRaw)) ||
        namesOther(outgoing, incoming.accountId) ||
        namesOther(incoming, outgoing.accountId),
    };
  });
}

/** Links pairs that are obviously transfers (both sides found and described as a transfer); others become suggestions. */
export async function autoLinkTransfers(db: Db, householdId: string) {
  const suggestions = await findTransferSuggestions(db, householdId);
  let linked = 0;
  for (const s of suggestions) {
    if (!s.likely) continue;
    await linkTransfer(db, householdId, s.outgoing.id, s.incoming.id);
    linked++;
  }
  return linked;
}
