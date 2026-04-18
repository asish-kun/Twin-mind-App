import type { SuggestionItem } from "@/lib/schema";

export interface SuggestRequestBody {
  prompt: string;
  window: string;
  summary: string;
  sessionSeconds: number;
  priorBatchTypes: string[];
}

export interface SuggestResponse {
  items: SuggestionItem[];
  repaired: boolean;
  model: string;
  latencyMs: number;
}

export class SuggestError extends Error {
  status: number;
  code: string;
  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.code = code;
    this.status = status;
  }
}

export async function fetchSuggestions(
  body: SuggestRequestBody,
  apiKey: string,
  signal?: AbortSignal,
): Promise<SuggestResponse> {
  const res = await fetch("/api/suggest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-groq-key": apiKey,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let payload: { error?: string; message?: string } = {};
    try {
      payload = await res.json();
    } catch {
      // ignore
    }
    throw new SuggestError(
      payload.error ?? "suggest_failed",
      res.status,
      payload.message,
    );
  }
  return (await res.json()) as SuggestResponse;
}

export async function fetchSummary(
  window: string,
  previousSummary: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/summary", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-groq-key": apiKey,
    },
    body: JSON.stringify({ window, previousSummary }),
    signal,
  });
  if (!res.ok) throw new Error(`summary_${res.status}`);
  const json = (await res.json()) as { summary: string };
  return json.summary;
}
