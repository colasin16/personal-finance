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
