export type TransferCandidate = {
  id: string;
  accountId: string;
  bookedAt: string; // YYYY-MM-DD
  amountCents: number;
};

export type TransferPair = { outgoing: TransferCandidate; incoming: TransferCandidate; daysApart: number };

const DAY_MS = 86_400_000;

function daysBetween(a: string, b: string): number {
  return Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS);
}

/**
 * Finds movements between two of our own accounts: same absolute amount, opposite sign,
 * different accounts, within `maxDays`. Each transaction is used at most once, closest dates first.
 */
export function findTransferPairs(candidates: TransferCandidate[], maxDays = 3): TransferPair[] {
  const incomingByAmount = new Map<number, TransferCandidate[]>();
  for (const c of candidates) {
    if (c.amountCents <= 0) continue;
    const list = incomingByAmount.get(c.amountCents) ?? [];
    list.push(c);
    incomingByAmount.set(c.amountCents, list);
  }

  const options: TransferPair[] = [];
  for (const out of candidates) {
    if (out.amountCents >= 0) continue;
    for (const inc of incomingByAmount.get(-out.amountCents) ?? []) {
      if (inc.accountId === out.accountId) continue;
      const daysApart = daysBetween(out.bookedAt, inc.bookedAt);
      if (daysApart <= maxDays) options.push({ outgoing: out, incoming: inc, daysApart });
    }
  }
  options.sort((a, b) => a.daysApart - b.daysApart || a.outgoing.bookedAt.localeCompare(b.outgoing.bookedAt));

  const used = new Set<string>();
  const pairs: TransferPair[] = [];
  for (const option of options) {
    if (used.has(option.outgoing.id) || used.has(option.incoming.id)) continue;
    used.add(option.outgoing.id);
    used.add(option.incoming.id);
    pairs.push(option);
  }
  return pairs;
}

/**
 * Possible other sides of `tx` for a manual link: the mirror amount in another account,
 * within `maxDays`, closest dates first.
 */
export function rankTransferMatches<T extends TransferCandidate>(tx: TransferCandidate, candidates: T[], maxDays = 31, limit = 10): T[] {
  return candidates
    .filter((c) => c.id !== tx.id && c.accountId !== tx.accountId && c.amountCents === -tx.amountCents)
    .map((c) => ({ c, days: daysBetween(c.bookedAt, tx.bookedAt) }))
    .filter(({ days }) => days <= maxDays)
    .sort((a, b) => a.days - b.days || a.c.bookedAt.localeCompare(b.c.bookedAt))
    .slice(0, limit)
    .map(({ c }) => c);
}

export type NamedAccount = { id: string; name: string };

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Another of our accounts named, as whole words, in a description (e.g. an N26 "Hacia Ahorro Vacaciones"
 * row when an account is called "Ahorro Vacaciones"). Longest name wins; names under 4 characters are ignored.
 */
export function findMentionedAccount<A extends NamedAccount>(description: string, accounts: A[], ownAccountId: string): A | null {
  const text = normalize(description);
  const matches = accounts.filter((account) => {
    const name = normalize(account.name);
    return account.id !== ownAccountId && name.length >= 4 && new RegExp(`(^|[^A-Z0-9])${escapeRegex(name)}($|[^A-Z0-9])`).test(text);
  });
  return matches.sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}
