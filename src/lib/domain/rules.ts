import { normalizeDescription } from "./text";

export type MatchType = "contains" | "regex" | "merchant";

export type CategoryRule = {
  id: string;
  matchType: MatchType;
  pattern: string;
  categoryId: string;
  priority: number;
};

export type RuleSubject = { description: string; merchant: string | null };

export function ruleMatches(rule: Pick<CategoryRule, "matchType" | "pattern">, subject: RuleSubject): boolean {
  switch (rule.matchType) {
    case "contains":
      return normalizeDescription(subject.description).includes(normalizeDescription(rule.pattern));
    case "merchant":
      return !!subject.merchant && normalizeDescription(subject.merchant) === normalizeDescription(rule.pattern);
    case "regex":
      try {
        return new RegExp(rule.pattern, "i").test(subject.description);
      } catch {
        return false;
      }
  }
}

/** Evaluation order: lower priority number first; ties go to the longest, most specific pattern. */
export function sortRules<R extends Pick<CategoryRule, "priority" | "pattern">>(rules: R[]): R[] {
  return [...rules].sort((a, b) => a.priority - b.priority || b.pattern.length - a.pattern.length);
}

/** First matching rule in evaluation order. */
export function findMatchingRule<R extends CategoryRule>(rules: R[], subject: RuleSubject): R | null {
  return sortRules(rules).find((rule) => ruleMatches(rule, subject)) ?? null;
}

export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}
