import { MockLlmProvider } from "./mock";
import { OpenAiCompatibleProvider } from "./openai";
import type { LlmProvider } from "./types";

let provider: LlmProvider | undefined;

/** Uses a real LLM when LLM_API_KEY (or OPENAI_API_KEY) is set, otherwise the offline heuristic provider. */
export function getLlm(): LlmProvider {
  if (!provider) {
    const key = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY;
    provider = key ? new OpenAiCompatibleProvider(key) : new MockLlmProvider();
  }
  return provider;
}

export function setLlmForTesting(next: LlmProvider | undefined) {
  provider = next;
}

export * from "./types";
