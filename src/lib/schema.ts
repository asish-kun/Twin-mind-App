import { z } from "zod";

export const SuggestionTypeSchema = z.enum([
  "question",
  "talking_point",
  "answer",
  "fact_check",
  "clarification",
]);

export const SuggestionItemSchema = z.object({
  type: SuggestionTypeSchema,
  preview: z.string().trim().min(2).max(300),
  rationale: z.string().trim().max(240).optional().default(""),
});

export const SuggestionBatchResponseSchema = z.object({
  items: z.array(SuggestionItemSchema).min(1).max(6),
});

export type SuggestionItem = z.infer<typeof SuggestionItemSchema>;
export type SuggestionBatchResponse = z.infer<typeof SuggestionBatchResponseSchema>;

/**
 * Best-effort JSON extraction. Models occasionally wrap JSON in code fences or
 * leak a stray sentence. This grabs the outermost {...} and also handles a
 * top-level array that we wrap as {items: [...]}.
 */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Fenced block first
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1]?.trim() ?? trimmed;

  const parse = (s: string): unknown => JSON.parse(s);

  // direct
  try {
    return parse(source);
  } catch {
    // fall through
  }
  // outermost object
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return parse(source.slice(firstBrace, lastBrace + 1));
    } catch {
      // fall through
    }
  }
  // outermost array → wrap
  const firstBracket = source.indexOf("[");
  const lastBracket = source.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      const arr = parse(source.slice(firstBracket, lastBracket + 1));
      return { items: arr };
    } catch {
      // fall through
    }
  }
  throw new Error("no_json_in_response");
}

export interface SalvageResult {
  ok: true;
  value: SuggestionBatchResponse;
  repaired: boolean;
}
export interface SalvageFailure {
  ok: false;
  raw: string;
  error: string;
}

/**
 * Parse a model string into a validated batch. Returns a salvaged shape if the
 * model returned fewer / more than 3 items but the types are valid — caller
 * can decide whether to keep it. We always ask for 3 in the prompt; salvage
 * only exists so one bad response doesn't blank the UI.
 */
export function parseSuggestionResponse(raw: string): SalvageResult | SalvageFailure {
  try {
    const json = extractJson(raw);
    // Wrap bare array fallback
    const candidate = Array.isArray(json) ? { items: json } : (json as object);
    const parsed = SuggestionBatchResponseSchema.safeParse(candidate);
    if (parsed.success) {
      return { ok: true, value: parsed.data, repaired: false };
    }
    // Attempt per-item salvage
    if (
      typeof candidate === "object" &&
      candidate !== null &&
      "items" in candidate &&
      Array.isArray((candidate as { items: unknown[] }).items)
    ) {
      const items = (candidate as { items: unknown[] }).items
        .map((it) => SuggestionItemSchema.safeParse(it))
        .flatMap((r) => (r.success ? [r.data] : []));
      if (items.length >= 1) {
        return {
          ok: true,
          value: { items },
          repaired: true,
        };
      }
    }
    return { ok: false, raw, error: parsed.error.message };
  } catch (e) {
    return { ok: false, raw, error: (e as Error).message };
  }
}
