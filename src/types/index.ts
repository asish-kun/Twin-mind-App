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

export interface SuggestionBatch {
  id: string;
  /** Seconds from session start */
  t: number;
  items: Suggestion[];
}

export interface ChatMessage {
  id: string;
  /** Seconds from session start */
  t: number;
  role: "user" | "assistant";
  content: string;
  sourceSuggestionId?: string;
  pending?: boolean;
}

export interface SessionSnapshot {
  session_id: string;
  started_at: number;
  ended_at: number | null;
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
