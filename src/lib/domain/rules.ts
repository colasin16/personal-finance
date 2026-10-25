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

/** Highest priority matching rule (lower number wins; ties go to the longest, most specific pattern). */
export function findMatchingRule<R extends CategoryRule>(rules: R[], subject: RuleSubject): R | null {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority || b.pattern.length - a.pattern.length);
  return sorted.find((rule) => ruleMatches(rule, subject)) ?? null;
}

export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}
