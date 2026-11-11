import { randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, count, eq, gte, inArray, isNotNull, max, ne } from "drizzle-orm";
import { decryptText, encryptText, signPayload } from "@/lib/crypto";
import type { Db } from "@/lib/db";
import {
  accountOwners,
  accounts,
  bankConnectionAccounts,
  bankConnections,
  bankSyncRuns,
  banks,
  statements,
  transactions,
  users,
} from "@/lib/db/schema";
import {
  MAX_DAILY_RUNS,
  REMINDER_DAYS,
  accountTypeFor,
  bankFingerprints,
  consentValidUntil,
  daysLeft,
  dueReminder,
  isoDate,
  matchBankId,
  minSyncFrom,
  syncWindow,
  toBankRow,
  type BankRow,
} from "@/lib/domain/bank-sync";
import { compactIban } from "@/lib/domain/redact";
import { UserError } from "@/lib/errors";
import { autoLinkTransfers, categorizeTransactions } from "@/lib/pipeline/categorize";
import { ibanHash } from "@/lib/pipeline/process-statement";
import { BankSyncError, getBankSyncProvider, type BankSyncProvider } from "@/lib/services/bank-sync";

/** How long a user has to approve access at their bank before the callback is rejected. */
const STATE_TTL_MS = 30 * 60_000;
export const BANK_CONNECTIONS_PATH = "/settings/bank-connections";
export const BANK_CALLBACK_PATH = "/api/bank-sync/callback";

const sessionContext = (connectionId: string) => `bank-session:${connectionId}`;
const accountContext = (linkId: string) => `bank-account:${linkId}`;
const utcDayStart = (now: Date) => new Date(`${isoDate(now)}T00:00:00Z`);

// ---------------------------------------------------------------------------------------------------------------
// Connect flow
// ---------------------------------------------------------------------------------------------------------------

export type AuthState = { householdId: string; userId: string; bankName: string; bankCountry: string; connectionId?: string; exp: number; nonce: string };

export function signAuthState(state: Omit<AuthState, "exp" | "nonce">, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...state, exp: now + STATE_TTL_MS, nonce: randomUUID() })).toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

/** The state we sent to the bank, if it is ours, unexpired and untampered. */
export function verifyAuthState(raw: string | null, now = Date.now()): AuthState | null {
  const [payload, signature] = (raw ?? "").split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(signPayload(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AuthState;
    return state.exp > now ? state : null;
  } catch {
    return null;
  }
}

async function ownConnection(db: Db, householdId: string, userId: string, connectionId: string) {
  const [connection] = await db
    .select()
    .from(bankConnections)
    .where(and(eq(bankConnections.id, connectionId), eq(bankConnections.householdId, householdId)));
  if (!connection) throw new UserError("bank_connection_not_found");
  if (connection.createdBy !== userId) throw new UserError("bank_connection_not_yours");
  return connection;
}

export async function listProviderBanks(country = "ES", provider: BankSyncProvider = getBankSyncProvider()) {
  const list = await provider.listBanks(country);
  return list.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Starts a new connection (or a reconnect of `connectionId`) and returns the bank's consent URL. */
export async function startBankConnection(
  db: Db,
  ctx: { householdId: string; userId: string; origin: string; language?: string },
  input: { bankName: string; bankCountry: string; connectionId?: string },
  provider: BankSyncProvider = getBankSyncProvider(),
  now = new Date(),
) {
  if (input.connectionId) {
    const connection = await ownConnection(db, ctx.householdId, ctx.userId, input.connectionId);
    input = { ...input, bankName: connection.bankName, bankCountry: connection.bankCountry };
  }
  const bank = (await provider.listBanks(input.bankCountry)).find((b) => b.name === input.bankName);
  if (!bank) throw new UserError("bank_not_supported");
  const state = signAuthState({ householdId: ctx.householdId, userId: ctx.userId, bankName: bank.name, bankCountry: bank.country, connectionId: input.connectionId });
  return provider.startAuth({
    bank: { name: bank.name, country: bank.country },
    redirectUrl: `${ctx.origin}${BANK_CALLBACK_PATH}`,
    state,
    validUntil: consentValidUntil(now, bank.maxConsentSeconds),
    language: ctx.language,
  });
}

/** Stores the session the bank granted: a new connection with its accounts, or a fresh session on a reconnect. */
export async function completeBankConnection(db: Db, state: AuthState, code: string, provider: BankSyncProvider = getBankSyncProvider()) {
  const session = await provider.createSession(code);
  const allBanks = await db.select({ id: banks.id, name: banks.name, detectKeywords: banks.detectKeywords }).from(banks);
  const connectionId = state.connectionId ?? randomUUID();

  const shared = session.accounts.map((a) => ({
    ...a,
    ibanHash: a.iban ? ibanHash(state.householdId, a.iban) : null,
    ibanLast4: a.iban ? compactIban(a.iban).slice(-4) : null,
  }));

  if (state.connectionId) {
    const connection = await ownConnection(db, state.householdId, state.userId, state.connectionId);
    const links = await db.select().from(bankConnectionAccounts).where(eq(bankConnectionAccounts.connectionId, connection.id));
    await db.transaction(async (tx) => {
      await tx
        .update(bankConnections)
        .set({
          sessionIdEnc: encryptText(session.sessionId, sessionContext(connection.id)),
          validUntil: session.validUntil,
          status: "active",
          lastError: null,
          remindedDays: null,
        })
        .where(eq(bankConnections.id, connection.id));
      // Account uids can change with each session: keep links (and their sync_from) by IBAN, else by name.
      for (const account of shared) {
        const link = links.find((l) => (account.ibanHash ? l.ibanHash === account.ibanHash : l.name === account.name));
        if (link) {
          await tx
            .update(bankConnectionAccounts)
            .set({ providerAccountUidEnc: encryptText(account.uid, accountContext(link.id)) })
            .where(eq(bankConnectionAccounts.id, link.id));
        } else {
          await tx.insert(bankConnectionAccounts).values(newLink(state.householdId, connection.id, account));
        }
      }
    });
    return connection.id;
  }

  await db.transaction(async (tx) => {
    await tx.insert(bankConnections).values({
      id: connectionId,
      householdId: state.householdId,
      createdBy: state.userId,
      provider: provider.id,
      bankName: state.bankName,
      bankCountry: state.bankCountry,
      bankId: matchBankId(state.bankName, allBanks),
      sessionIdEnc: encryptText(session.sessionId, sessionContext(connectionId)),
      validUntil: session.validUntil,
    });
    if (shared.length) await tx.insert(bankConnectionAccounts).values(shared.map((a) => newLink(state.householdId, connectionId, a)));
  });
  return connectionId;
}

function newLink(
  householdId: string,
  connectionId: string,
  a: { uid: string; name: string; currency: string; cashAccountType: string | null; ibanHash: string | null; ibanLast4: string | null },
) {
  const linkId = randomUUID();
  return {
    id: linkId,
    connectionId,
    householdId,
    providerAccountUidEnc: encryptText(a.uid, accountContext(linkId)),
    ibanHash: a.ibanHash,
    ibanLast4: a.ibanLast4,
    name: a.name,
    currency: a.currency,
    accountType: accountTypeFor(a.cashAccountType),
  };
}

/** The day after the account's PDF coverage, or null when it has no PDF data. */
export async function accountMinSyncFrom(db: Db, accountId: string) {
  const [statementEnd] = await db
    .select({ end: max(statements.periodEnd) })
    .from(statements)
    .where(and(eq(statements.accountId, accountId), ne(statements.status, "failed")));
  const [statementTx] = await db
    .select({ last: max(transactions.bookedAt) })
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), eq(transactions.source, "statement")));
  return minSyncFrom({ latestPeriodEnd: statementEnd?.end ?? null, latestStatementTx: statementTx?.last ?? null });
}

/** Default start for accounts without PDFs: as far back as most banks share (about 90 days). */
export const defaultSyncFrom = (now: Date) => isoDate(new Date(now.getTime() - 89 * 86_400_000));

export type AccountChoice = { linkId: string; accountId: string | "new" | null; syncFrom: string | null };

/**
 * Maps the connection's accounts to app accounts and sets where each starts syncing. `syncFrom` can't be before
 * the account's PDF coverage, and can't change once bank rows exist (disconnect to start over).
 */
export async function configureBankAccounts(db: Db, ctx: { householdId: string; userId: string }, connectionId: string, choices: AccountChoice[], now = new Date()) {
  const connection = await ownConnection(db, ctx.householdId, ctx.userId, connectionId);
  const links = await db.select().from(bankConnectionAccounts).where(eq(bankConnectionAccounts.connectionId, connection.id));
  const today = isoDate(now);
  const used = new Set<string>();

  for (const choice of choices) {
    const link = links.find((l) => l.id === choice.linkId);
    if (!link) throw new UserError("bank_connection_not_found");
    if (choice.accountId === null) {
      if (link.accountId && (await hasBankRows(db, link.accountId))) throw new UserError("bank_sync_from_locked");
      await db.update(bankConnectionAccounts).set({ accountId: null, syncFrom: null }).where(eq(bankConnectionAccounts.id, link.id));
      continue;
    }
    if (!choice.syncFrom || !/^\d{4}-\d{2}-\d{2}$/.test(choice.syncFrom) || choice.syncFrom > today) throw new UserError("invalid_input");

    let accountId = choice.accountId;
    if (accountId === "new") {
      accountId = await createLinkedAccount(db, ctx, connection.bankId, link);
    } else {
      const [account] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.id, accountId), eq(accounts.householdId, ctx.householdId)));
      if (!account) throw new UserError("account_not_found");
      const [other] = await db
        .select({ id: bankConnectionAccounts.id })
        .from(bankConnectionAccounts)
        .where(and(eq(bankConnectionAccounts.accountId, accountId), ne(bankConnectionAccounts.id, link.id)));
      if (other || used.has(accountId)) throw new UserError("bank_account_already_synced");
      const earliest = await accountMinSyncFrom(db, accountId);
      if (earliest && choice.syncFrom < earliest) throw new UserError("bank_sync_from_too_early", { date: earliest });
      if (link.accountId && link.syncFrom && (link.accountId !== accountId || link.syncFrom !== choice.syncFrom) && (await hasBankRows(db, link.accountId))) {
        throw new UserError("bank_sync_from_locked");
      }
    }
    used.add(accountId);
    await db.update(bankConnectionAccounts).set({ accountId, syncFrom: choice.syncFrom }).where(eq(bankConnectionAccounts.id, link.id));
  }
}

async function hasBankRows(db: Db, accountId: string) {
  const [row] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), eq(transactions.source, "bank")))
    .limit(1);
  return !!row;
}

// No RETURNING: under Row Level Security a private account is only readable once its owners exist (see createAccount).
async function createLinkedAccount(
  db: Db,
  ctx: { householdId: string; userId: string },
  bankId: string,
  link: typeof bankConnectionAccounts.$inferSelect,
) {
  const accountId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(accounts).values({
      id: accountId,
      householdId: ctx.householdId,
      bankId,
      name: link.name,
      ibanLast4: link.ibanLast4,
      ibanHash: link.ibanHash,
      currency: link.currency,
      type: link.accountType,
    });
    await tx.insert(accountOwners).values({ accountId, userId: ctx.userId, sharePct: 100 });
  });
  return accountId;
}

// ---------------------------------------------------------------------------------------------------------------
// Sync engine (system database: also runs from the cron)
// ---------------------------------------------------------------------------------------------------------------

export type SyncResult = { status: "synced" | "expired" | "error" | "limit" | "inactive"; inserted: number; skipped: number; error?: string };

async function runsToday(db: Db, connectionId: string, now: Date) {
  const [row] = await db
    .select({ n: count() })
    .from(bankSyncRuns)
    .where(and(eq(bankSyncRuns.connectionId, connectionId), gte(bankSyncRuns.startedAt, utcDayStart(now))));
  return row?.n ?? 0;
}

/** Whether the owner can press "Sync now" today without going over the bank's daily access limit. */
export async function canSyncNow(db: Db, connectionId: string, now = new Date()) {
  return (await runsToday(db, connectionId, now)) < MAX_DAILY_RUNS;
}

/**
 * Fetches new booked transactions for every mapped account and inserts them. Never updates or deletes an existing
 * row: dedupe is by fingerprint (`onConflictDoNothing`), only inserted rows are categorized, and transfers are
 * linked automatically only between rows added in this run.
 */
export async function syncConnection(
  db: Db,
  connectionId: string,
  trigger: "initial" | "cron" | "manual",
  { provider = getBankSyncProvider(), now = new Date() }: { provider?: BankSyncProvider; now?: Date } = {},
): Promise<SyncResult> {
  const [connection] = await db.select().from(bankConnections).where(eq(bankConnections.id, connectionId));
  if (!connection || connection.status !== "active" || !connection.sessionIdEnc) return { status: "inactive", inserted: 0, skipped: 0 };
  if ((await runsToday(db, connectionId, now)) >= MAX_DAILY_RUNS) return { status: "limit", inserted: 0, skipped: 0 };

  const [run] = await db
    .insert(bankSyncRuns)
    .values({ connectionId, householdId: connection.householdId, trigger, startedAt: now })
    .returning({ id: bankSyncRuns.id });
  const links = await db
    .select()
    .from(bankConnectionAccounts)
    .where(and(eq(bankConnectionAccounts.connectionId, connectionId), isNotNull(bankConnectionAccounts.accountId), isNotNull(bankConnectionAccounts.syncFrom)));

  const today = isoDate(now);
  const insertedIds: string[] = [];
  let skipped = 0;
  try {
    if (connection.validUntil && connection.validUntil <= now) throw new BankSyncError("expired", "Consent expired");
    for (const link of links) {
      const accountId = link.accountId!;
      const uid = decryptText(link.providerAccountUidEnc, accountContext(link.id));
      const [last] = await db
        .select({ at: max(transactions.bookedAt) })
        .from(transactions)
        .where(and(eq(transactions.accountId, accountId), eq(transactions.source, "bank")));
      const window = syncWindow({ syncFrom: link.syncFrom!, lastBankBookedAt: last?.at ?? null, today });
      const fetched = await provider.getTransactions(uid, window);

      const rows: BankRow[] = [];
      for (const tx of fetched) {
        const row = toBankRow(tx, link.currency);
        if ("skip" in row || row.bookedAt < link.syncFrom! || row.bookedAt > today) skipped++;
        else rows.push(row);
      }
      const dayIndex = new Map<string, number>();
      const values = bankFingerprints(accountId, rows).map((row) => {
        const position = dayIndex.get(row.bookedAt) ?? 0;
        dayIndex.set(row.bookedAt, position + 1);
        return {
          householdId: connection.householdId,
          accountId,
          statementId: null,
          bookedAt: row.bookedAt,
          valueDate: row.valueDate,
          descriptionRaw: row.description,
          merchant: row.merchant,
          amountCents: row.amountCents,
          currency: link.currency,
          balanceAfterCents: row.balanceAfterCents,
          position,
          fingerprint: row.fingerprint,
          source: "bank" as const,
          externalId: row.externalId,
        };
      });
      const inserted = values.length ? await db.insert(transactions).values(values).onConflictDoNothing().returning({ id: transactions.id }) : [];
      insertedIds.push(...inserted.map((r) => r.id));

      const balance = await provider.getBalance(uid).catch(() => null);
      await db
        .update(bankConnectionAccounts)
        .set({
          lastSyncedAt: now,
          ...(balance ? { lastBalanceCents: balance.cents, lastBalanceAt: balance.date ? new Date(`${balance.date}T00:00:00Z`) : now } : {}),
        })
        .where(eq(bankConnectionAccounts.id, link.id));
    }

    await categorizeTransactions(db, connection.householdId, insertedIds);
    await autoLinkTransfers(db, connection.householdId, { onlyIds: insertedIds });

    await db.update(bankSyncRuns).set({ finishedAt: new Date(), inserted: insertedIds.length, skipped }).where(eq(bankSyncRuns.id, run!.id));
    await db.update(bankConnections).set({ lastSyncedAt: now, lastError: null }).where(eq(bankConnections.id, connectionId));
    return { status: "synced", inserted: insertedIds.length, skipped };
  } catch (error) {
    // Rows inserted before the failure stay; categorize them so they don't sit uncategorized until the next run.
    if (insertedIds.length) await categorizeTransactions(db, connection.householdId, insertedIds).catch(() => {});
    const expired = error instanceof BankSyncError && error.kind === "expired";
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bank-sync] connection ${connectionId} failed: ${message}`);
    await db.update(bankSyncRuns).set({ finishedAt: new Date(), inserted: insertedIds.length, skipped, error: message }).where(eq(bankSyncRuns.id, run!.id));
    await db
      .update(bankConnections)
      .set({ lastError: expired ? null : message, ...(expired ? { status: "expired" as const } : {}) })
      .where(eq(bankConnections.id, connectionId));
    return { status: expired ? "expired" : "error", inserted: insertedIds.length, skipped, error: message };
  }
}

export type ReminderEmail = { to: string; locale: string; bankName: string; days: number; reminder: number; connectionId: string; validUntil: Date };

/**
 * The daily job: marks lapsed consents as expired, sends expiry reminders (14 and 3 days before) and syncs every
 * active connection that wasn't synced by the cron today. Stops at `deadline`; the rest go on the next run.
 */
export async function runDailyBankSync(
  db: Db,
  {
    now = new Date(),
    deadline = Number.POSITIVE_INFINITY,
    provider = getBankSyncProvider(),
    sendReminder,
  }: { now?: Date; deadline?: number; provider?: BankSyncProvider; sendReminder?: (email: ReminderEmail) => Promise<void> } = {},
) {
  const summary = { synced: 0, expired: 0, failed: 0, reminded: 0, pending: 0 };
  const active = await db
    .select({ connection: bankConnections, email: users.email, locale: users.locale })
    .from(bankConnections)
    .innerJoin(users, eq(users.id, bankConnections.createdBy))
    .where(eq(bankConnections.status, "active"))
    .orderBy(asc(bankConnections.lastSyncedAt));

  for (const { connection, email, locale } of active) {
    if (Date.now() > deadline) {
      summary.pending++;
      continue;
    }
    if (connection.validUntil && connection.validUntil <= now) {
      await db.update(bankConnections).set({ status: "expired" }).where(eq(bankConnections.id, connection.id));
      summary.expired++;
      continue;
    }
    const reminder = dueReminder(connection.validUntil, now, connection.remindedDays);
    if (reminder !== null && sendReminder) {
      try {
        await sendReminder({ to: email, locale, bankName: connection.bankName, days: daysLeft(connection.validUntil, now)!, reminder, connectionId: connection.id, validUntil: connection.validUntil! });
        await db.update(bankConnections).set({ remindedDays: reminder }).where(eq(bankConnections.id, connection.id));
        summary.reminded++;
      } catch (error) {
        console.error(`[bank-sync] reminder for ${connection.id} failed`, error);
      }
    }
    const [cronRun] = await db
      .select({ id: bankSyncRuns.id })
      .from(bankSyncRuns)
      .where(and(eq(bankSyncRuns.connectionId, connection.id), eq(bankSyncRuns.trigger, "cron"), gte(bankSyncRuns.startedAt, utcDayStart(now))))
      .limit(1);
    if (cronRun) continue;
    const result = await syncConnection(db, connection.id, "cron", { provider, now });
    if (result.status === "synced") summary.synced++;
    else if (result.status === "expired") summary.expired++;
    else if (result.status === "error") summary.failed++;
  }
  return summary;
}

/** Revokes the bank consent and deletes the connection. Synced transactions stay, like any other row. */
export async function disconnectBank(db: Db, ctx: { householdId: string; userId: string }, connectionId: string, provider: BankSyncProvider = getBankSyncProvider()) {
  const connection = await ownConnection(db, ctx.householdId, ctx.userId, connectionId);
  if (connection.sessionIdEnc && connection.status === "active") {
    try {
      await provider.revokeSession(decryptText(connection.sessionIdEnc, sessionContext(connection.id)));
    } catch (error) {
      // The consent lapses on its own anyway; don't keep a connection the user wants gone.
      console.error(`[bank-sync] revoking ${connection.id} failed`, error);
    }
  }
  await db.delete(bankConnections).where(eq(bankConnections.id, connection.id));
}

// ---------------------------------------------------------------------------------------------------------------
// Queries for the UI
// ---------------------------------------------------------------------------------------------------------------

export async function getBankConnections(db: Db, householdId: string, now = new Date()) {
  const connections = await db
    .select({ connection: bankConnections, ownerName: users.displayName })
    .from(bankConnections)
    .innerJoin(users, eq(users.id, bankConnections.createdBy))
    .where(eq(bankConnections.householdId, householdId))
    .orderBy(asc(bankConnections.createdAt));
  if (!connections.length) return [];
  const ids = connections.map((c) => c.connection.id);
  const links = await db
    .select({
      id: bankConnectionAccounts.id,
      connectionId: bankConnectionAccounts.connectionId,
      name: bankConnectionAccounts.name,
      ibanLast4: bankConnectionAccounts.ibanLast4,
      ibanHash: bankConnectionAccounts.ibanHash,
      accountId: bankConnectionAccounts.accountId,
      syncFrom: bankConnectionAccounts.syncFrom,
      lastBalanceCents: bankConnectionAccounts.lastBalanceCents,
      lastBalanceAt: bankConnectionAccounts.lastBalanceAt,
    })
    .from(bankConnectionAccounts)
    .where(inArray(bankConnectionAccounts.connectionId, ids))
    .orderBy(asc(bankConnectionAccounts.createdAt));
  const runs = await db
    .select({ connectionId: bankSyncRuns.connectionId, n: count() })
    .from(bankSyncRuns)
    .where(and(inArray(bankSyncRuns.connectionId, ids), gte(bankSyncRuns.startedAt, utcDayStart(now))))
    .groupBy(bankSyncRuns.connectionId);
  return connections.map(({ connection, ownerName }) => ({
    id: connection.id,
    bankName: connection.bankName,
    bankId: connection.bankId,
    createdBy: connection.createdBy,
    ownerName,
    status: connection.status,
    validUntil: connection.validUntil,
    daysLeft: daysLeft(connection.validUntil, now),
    lastSyncedAt: connection.lastSyncedAt,
    lastError: connection.lastError,
    syncsLeftToday: Math.max(0, MAX_DAILY_RUNS - (runs.find((r) => r.connectionId === connection.id)?.n ?? 0)),
    accounts: links.filter((l) => l.connectionId === connection.id),
  }));
}

export type BankConnectionView = Awaited<ReturnType<typeof getBankConnections>>[number];

/** Suggested mapping for each unconfigured account of a connection: IBAN match and the earliest allowed start. */
export async function getSetupProposals(db: Db, householdId: string, connection: BankConnectionView, now = new Date()) {
  const own = await db.select({ id: accounts.id, ibanHash: accounts.ibanHash }).from(accounts).where(eq(accounts.householdId, householdId));
  const taken = await db
    .select({ accountId: bankConnectionAccounts.accountId })
    .from(bankConnectionAccounts)
    .where(and(eq(bankConnectionAccounts.householdId, householdId), isNotNull(bankConnectionAccounts.accountId)));
  const takenIds = new Set(taken.map((t) => t.accountId));
  const minByAccount = Object.fromEntries(await Promise.all(own.map(async (a) => [a.id, await accountMinSyncFrom(db, a.id)] as const)));
  return {
    defaultSyncFrom: defaultSyncFrom(now),
    minByAccount,
    takenAccountIds: [...takenIds].filter((id): id is string => !!id),
    proposals: connection.accounts.map((link) => {
      const match = own.find((a) => link.ibanHash && a.ibanHash === link.ibanHash && !takenIds.has(a.id));
      const accountId = link.accountId ?? match?.id ?? null;
      return { linkId: link.id, accountId, matched: !link.accountId && !!match, syncFrom: link.syncFrom ?? (accountId ? minByAccount[accountId] : null) ?? defaultSyncFrom(now) };
    }),
    lockedLinkIds: (
      await Promise.all(connection.accounts.map(async (l) => (l.accountId && l.syncFrom && (await hasBankRows(db, l.accountId)) ? l.id : null)))
    ).filter((id): id is string => !!id),
  };
}

export type BankSyncStatusData = {
  /** Server time, for relative times that render the same on server and client. */
  now: Date;
  lastSyncedAt: Date | null;
  /** Active connections this user can sync. */
  ownActiveIds: string[];
  stale: { bankName: string; since: Date | null }[];
  expiringSoon: { bankName: string; days: number }[];
};

/** For `/budgets` and the dashboard: when bank data last updated, and banks whose access lapsed or is about to. */
export async function getBankSyncStatus(db: Db, householdId: string, userId: string, now = new Date()): Promise<BankSyncStatusData | null> {
  const rows = await db
    .select({
      id: bankConnections.id,
      bankName: bankConnections.bankName,
      status: bankConnections.status,
      lastSyncedAt: bankConnections.lastSyncedAt,
      createdBy: bankConnections.createdBy,
      validUntil: bankConnections.validUntil,
    })
    .from(bankConnections)
    .where(and(eq(bankConnections.householdId, householdId), inArray(bankConnections.id, mappedConnectionIds(db, householdId))));
  if (!rows.length) return null;
  const active = rows.filter((r) => r.status === "active");
  return {
    now,
    lastSyncedAt: active.map((r) => r.lastSyncedAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    ownActiveIds: active.filter((r) => r.createdBy === userId).map((r) => r.id),
    stale: rows.filter((r) => r.status !== "active").map((r) => ({ bankName: r.bankName, since: r.lastSyncedAt })),
    expiringSoon: active
      .map((r) => ({ bankName: r.bankName, days: daysLeft(r.validUntil, now) }))
      .filter((r): r is { bankName: string; days: number } => r.days !== null && r.days <= REMINDER_DAYS[0]),
  };
}

const mappedConnectionIds = (db: Db, householdId: string) =>
  db
    .selectDistinct({ id: bankConnectionAccounts.connectionId })
    .from(bankConnectionAccounts)
    .where(and(eq(bankConnectionAccounts.householdId, householdId), isNotNull(bankConnectionAccounts.accountId)));
