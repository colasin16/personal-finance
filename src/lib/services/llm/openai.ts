import {
  categorizationResultSchema,
  extractedStatementSchema,
  type CategorizationInput,
  type CategoryOption,
  type LlmProvider,
} from "./types";

const nullable = (type: string) => ({ type: [type, "null"] });

const STATEMENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["periodStart", "periodEnd", "currency", "openingBalance", "closingBalance", "transactions"],
  properties: {
    periodStart: { ...nullable("string"), description: "YYYY-MM-DD" },
    periodEnd: { ...nullable("string"), description: "YYYY-MM-DD" },
    currency: { ...nullable("string"), description: "ISO 4217 code" },
    openingBalance: nullable("number"),
    closingBalance: nullable("number"),
    transactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "valueDate", "description", "amount", "balanceAfter"],
        properties: {
          date: { type: "string", description: "Booking date, YYYY-MM-DD" },
          valueDate: { ...nullable("string"), description: "YYYY-MM-DD" },
          description: { type: "string" },
          amount: { type: "number", description: "Signed amount, negative for money leaving the account" },
          balanceAfter: nullable("number"),
        },
      },
    },
  },
};

const CATEGORIZATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "categorySlug", "confidence"],
        properties: {
          id: { type: "string" },
          categorySlug: nullable("string"),
          confidence: { type: "number", description: "0..1" },
        },
      },
    },
  },
};

/**
 * Any OpenAI-compatible chat completions endpoint with structured outputs
 * (OpenAI, Azure OpenAI, or a local Ollama via LLM_BASE_URL=http://localhost:11434/v1).
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name: string;

  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.LLM_MODEL ?? "gpt-4o-mini",
    private readonly baseUrl = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
  ) {
    this.name = `openai-compatible:${model}`;
  }

  private async complete(system: string, user: string, schemaName: string, schema: object): Promise<unknown> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`LLM request failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    return JSON.parse(body.choices[0]?.message.content ?? "{}");
  }

  async extractStatement(text: string) {
    const json = await this.complete(
      [
        "You extract bank statement data into JSON.",
        "Return every transaction exactly once, in the order printed.",
        "Amounts are signed: money leaving the account is negative, money coming in is positive.",
        "Dates must be YYYY-MM-DD. Use null when a value is not printed. Never invent transactions.",
        "periodStart/periodEnd are the dates the statement covers. The date the document was issued or generated (e.g. 'Fecha de emisión') is not the period end: a September statement is often issued in October.",
      ].join(" "),
      text,
      "bank_statement",
      STATEMENT_JSON_SCHEMA,
    );
    return extractedStatementSchema.parse(json);
  }

  async categorize(items: CategorizationInput[], categories: CategoryOption[]) {
    if (items.length === 0) return [];
    const json = await this.complete(
      [
        "You categorize personal bank transactions for a household budget.",
        "Pick the best category slug from the list, or null if unsure.",
        "Confidence is 0..1. Negative amounts are expenses, positive are income.",
        `Categories: ${categories.map((c) => `${c.slug} (${c.name}, ${c.kind})`).join("; ")}`,
      ].join("\n"),
      JSON.stringify(items.map((i) => ({ id: i.id, description: i.description, merchant: i.merchant, amount: i.amountCents / 100 }))),
      "categorization",
      CATEGORIZATION_JSON_SCHEMA,
    );
    const slugs = new Set(categories.map((c) => c.slug));
    return categorizationResultSchema
      .parse(json)
      .results.map((r) => (r.categorySlug && !slugs.has(r.categorySlug) ? { ...r, categorySlug: null, confidence: 0 } : r));
  }
}
