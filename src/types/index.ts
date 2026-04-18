export type SuggestionType =
  | "question"
  | "talking_point"
  | "answer"
  | "fact_check"
  | "clarification";

export interface TranscriptLine {
  id: string;
  /** Seconds from session start */
  t_start: number;
  t_end: number;
  text: string;
  /** True while we're awaiting Groq. Final text arrives later. */
  pending?: boolean;
}

export interface Suggestion {
  id: string;
  type: SuggestionType;
  /** One-line, useful standalone. Rendered on the card. */
  preview: string;
  /** Optional: 1 sentence explanation the model returns. Shown as subline. */
  rationale?: string;
}

export interface SuggestionBatchMeta {
  /** Window bounds in session seconds */
  t_window_start: number;
  t_window_end: number;
  model: string;
  /** Server-measured Groq call latency */
  latencyMs: number;
  /** End-to-end: click/tick → batch visible in store. Measured client-side. */
  clientLatencyMs?: number;
  /** True if the JSON response needed a retry / repair pass */
  repaired?: boolean;
  /** Set by the Jaccard dedupe path when we recognise a near-duplicate */
  dedupedFromBatchId?: string;
}

export interface SuggestionBatch {
  id: string;
  /** Seconds from session start */
  t: number;
  items: Suggestion[];
  meta?: SuggestionBatchMeta;
  /** User has clicked at least one card in this batch */
  visitedIds?: string[];
}

export interface ChatMessage {
  id: string;
  /** Seconds from session start */
  t: number;
  role: "user" | "assistant";
  content: string;
  sourceSuggestionId?: string;
  /** Assistant message is mid-stream */
  streaming?: boolean;
  /** Stream aborted or errored */
  errored?: boolean;
  /** Latency from send to first token, when measured */
  firstTokenMs?: number;
}

export interface SessionSnapshot {
  session_id: string;
  started_at: number;
  started_at_iso: string;
  ended_at: number | null;
  ended_at_iso: string | null;
  transcript: TranscriptLine[];
  suggestion_batches: SuggestionBatch[];
  chat: ChatMessage[];
}

export interface Prompts {
  liveSuggestion: string;
  detailedAnswer: string;
  chat: string;
}

export interface ContextWindows {
  /** seconds of transcript fed to the suggestion model */
  suggestionsWindowSec: number;
  /** seconds of transcript fed to the detailed-answer model */
  expansionWindowSec: number;
}

export interface Settings {
  apiKey: string;
  prompts: Prompts;
  contextWindows: ContextWindows;
  /** seconds per MediaRecorder chunk */
  chunkSeconds: number;
  /** seconds between auto-refresh of suggestion batches */
  suggestionIntervalSec: number;
}
