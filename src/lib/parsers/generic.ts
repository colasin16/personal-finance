import type { ExtractedStatement } from "@/lib/services/llm/types";
import { CLOSING_RE, OPENING_RE, parseDate, parseTable, toLines, type Period } from "./common";

const PERIOD_RE =
  /(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*(?:al|a|-|–|to|hasta)\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})/i;
const PERIOD_HINT_RE = /(periodo|period|del |from|extracto|statement)/i;

/** "Periodo del 01/09/2026 al 30/09/2026"-style lines (not rows nor balance lines). */
function findPeriod(text: string): Period {
  for (const line of toLines(text)) {
    if (parseDate(line.split(" ")[0] ?? "") || OPENING_RE.test(line) || CLOSING_RE.test(line)) continue;
    if (!PERIOD_HINT_RE.test(line)) continue;
    const m = PERIOD_RE.exec(line);
    if (m) return { start: parseDate(m[1]!), end: parseDate(m[2]!) };
  }
  return { start: null, end: null };
}

/**
 * Fallback for banks without a dedicated parser: the "date [value date] description amount [balance]"
 * table layout used by most European banks.
 */
export function parseGenericStatement(text: string): ExtractedStatement {
  return parseTable(text, findPeriod(text));
}
