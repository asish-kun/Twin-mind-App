import type { TranscriptLine } from "@/types";
import { formatMMSS } from "@/lib/utils";

/** ~4 chars/token heuristic. We cap at 3000 tokens ≈ 12 000 chars. */
const MAX_WINDOW_CHARS = 12_000;

export interface WindowSlice {
  text: string;
  lineCount: number;
  charCount: number;
  startSec: number;
  endSec: number;
}

/**
 * Render the most recent `windowSec` of transcript as:
 *   [mm:ss] text
 *   [mm:ss] text
 *
 * Skips pending lines. Caps at MAX_WINDOW_CHARS to protect the context window
 * on very long windows.
 */
export function renderTranscriptWindow(
  lines: TranscriptLine[],
  nowSec: number,
  windowSec: number,
): WindowSlice {
  const lo = Math.max(0, nowSec - windowSec);
  const eligible = lines.filter(
    (l) => !l.pending && l.text && l.t_end >= lo && l.t_end <= nowSec + 0.1,
  );

  // Take from the end backwards so we always prefer the most recent content
  // if we blow the char cap.
  const picked: TranscriptLine[] = [];
  let chars = 0;
  for (let i = eligible.length - 1; i >= 0; i--) {
    const l = eligible[i]!;
    const add = `[${formatMMSS(l.t_end)}] ${l.text}\n`.length;
    if (chars + add > MAX_WINDOW_CHARS) break;
    chars += add;
    picked.unshift(l);
  }

  const text = picked
    .map((l) => `[${formatMMSS(l.t_end)}] ${l.text}`)
    .join("\n");

  const startSec = picked[0]?.t_start ?? lo;
  const endSec = picked[picked.length - 1]?.t_end ?? nowSec;

  return {
    text,
    lineCount: picked.length,
    charCount: chars,
    startSec,
    endSec,
  };
}

/**
 * Return the tail of concatenated transcript text, capped at nChars. Used for
 * Whisper continuity (name-spelling hint) and chat fallbacks.
 */
export function transcriptTail(lines: TranscriptLine[], nChars: number): string {
  let out = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!;
    if (l.pending || !l.text) continue;
    if (out.length + l.text.length > nChars) {
      out = l.text.slice(-(nChars - out.length)) + " " + out;
      break;
    }
    out = l.text + " " + out;
    if (out.length >= nChars) break;
  }
  return out.trim();
}

export function summariseBatchShape(itemTypes: string[]): string {
  const counts: Record<string, number> = {};
  for (const t of itemTypes) counts[t] = (counts[t] ?? 0) + 1;
  return Object.entries(counts)
    .map(([k, v]) => (v > 1 ? `${v}×${k}` : k))
    .join(", ");
}
