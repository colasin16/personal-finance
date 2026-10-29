import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const extractedTransactionSchema = z.object({
  date: isoDate,
  valueDate: isoDate.nullable(),
  description: z.string().min(1),
  /** Signed decimal amount in the statement currency: negative = money out. */
  amount: z.number(),
  balanceAfter: z.number().nullable(),
});

export const extractedStatementSchema = z.object({
  periodStart: isoDate.nullable(),
  periodEnd: isoDate.nullable(),
  currency: z.string().length(3).nullable(),
  openingBalance: z.number().nullable(),
  closingBalance: z.number().nullable(),
  transactions: z.array(extractedTransactionSchema),
});

export type ExtractedStatement = z.infer<typeof extractedStatementSchema>;
export type ExtractedTransaction = z.infer<typeof extractedTransactionSchema>;

export const categorizationResultSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      categorySlug: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export type CategorizationInput = { id: string; description: string; merchant: string | null; amountCents: number };
export type CategoryOption = { slug: string; name: string; kind: "expense" | "income" | "transfer" };
export type CategorizationResult = z.infer<typeof categorizationResultSchema>["results"][number];

export type ExtractionHints = { bankId?: string | null };

export interface LlmProvider {
  readonly name: string;
  /** `text` must already be redacted of personal identifiers. */
  extractStatement(text: string, hints?: ExtractionHints): Promise<ExtractedStatement>;
  categorize(items: CategorizationInput[], categories: CategoryOption[]): Promise<CategorizationResult[]>;
}
