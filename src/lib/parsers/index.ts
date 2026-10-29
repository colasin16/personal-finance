import type { ExtractedStatement } from "./types";
import { bbvaParser } from "./bbva";
import type { StatementParser } from "./common";
import { parseGenericStatement } from "./generic";
import { ingParser } from "./ing";
import { n26Parser } from "./n26";

export { parseDate } from "./common";
export type { StatementParser } from "./common";
export type { ExtractedStatement, ExtractedTransaction } from "./types";

/** Bank-specific parsers. Add a new bank by writing a parser module and listing it here. */
const PARSERS: StatementParser[] = [ingParser, bbvaParser, n26Parser];

/**
 * The parser for a statement: the detected bank's, if the text has its layout; else any parser whose
 * layout matches (bank detection by keyword can be fooled by a transfer to another bank); else none.
 */
export function selectParser(text: string, bankId?: string | null): StatementParser | null {
  const detected = PARSERS.find((p) => p.bankId === bankId);
  if (detected?.matches(text)) return detected;
  return PARSERS.find((p) => p.matches(text)) ?? null;
}

export type ParsedStatement = ExtractedStatement & { /** The parser that read it: a bank id or "generic". */ parser: string };

export function parseStatement(text: string, bankId?: string | null): ParsedStatement {
  const parser = selectParser(text, bankId);
  const parsed = parser?.parse(text);
  return parsed && parsed.transactions.length > 0
    ? { ...parsed, parser: parser!.bankId }
    : { ...parseGenericStatement(text), parser: "generic" };
}
