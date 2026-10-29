import { DEFAULT_CATEGORIES } from "@/lib/db/seed";
import { normalizeDescription } from "@/lib/domain/text";
import { parseStatement } from "@/lib/parsers";
import type {
  CategorizationInput,
  CategorizationResult,
  CategoryOption,
  ExtractionHints,
  LlmProvider,
} from "./types";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const KEYWORD_MATCHERS = DEFAULT_CATEGORIES.flatMap((category) =>
  category.keywords.map((keyword) => ({
    slug: category.slug,
    // A trailing space in a seed keyword ("BAR ", "DIA ") means "whole word only".
    re: new RegExp(`(^|[^A-Z0-9])${escapeRegex(normalizeDescription(keyword))}${keyword.endsWith(" ") ? "($|[^A-Z0-9])" : ""}`),
  })),
);

export function keywordCategorize(item: CategorizationInput, categories: CategoryOption[]): CategorizationResult {
  const available = new Map(categories.map((c) => [c.slug, c]));
  const haystack = normalizeDescription(`${item.description} ${item.merchant ?? ""}`);
  const match = KEYWORD_MATCHERS.find((k) => available.has(k.slug) && k.re.test(haystack));
  if (match) {
    const kind = available.get(match.slug)!.kind;
    // An income keyword on an outgoing payment (or the reverse) is suspicious: lower confidence.
    const consistent = kind === "transfer" || (kind === "income") === item.amountCents > 0;
    return { id: item.id, categorySlug: match.slug, confidence: consistent ? 0.8 : 0.4 };
  }
  if (item.amountCents > 0 && available.has("other-income")) {
    return { id: item.id, categorySlug: "other-income", confidence: 0.5 };
  }
  return { id: item.id, categorySlug: null, confidence: 0 };
}

export class MockLlmProvider implements LlmProvider {
  readonly name = "mock-heuristic";

  /** Offline, rule-based: routes to the bank's parser (see `@/lib/parsers`). */
  async extractStatement(text: string, hints?: ExtractionHints) {
    return parseStatement(text, hints?.bankId);
  }

  async categorize(items: CategorizationInput[], categories: CategoryOption[]) {
    return items.map((item) => keywordCategorize(item, categories));
  }
}
