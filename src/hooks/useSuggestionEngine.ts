"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { renderTranscriptWindow } from "@/lib/context";
import { fetchSuggestions, fetchSummary, SuggestError } from "@/lib/suggestClient";
import { useSessionStore } from "@/store/sessionStore";
import { useSettingsStore } from "@/store/settingsStore";
import type { Suggestion } from "@/types";

const LENGTH_DELTA_THRESHOLD = 80; // chars of new transcript to bother refreshing
const SUMMARY_EVERY_N_BATCHES = 3;

/** Jaccard similarity on lowercased word tokens; 0..1 */
function jaccard(a: string, b: string): number {
  const toks = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean),
    );
  const A = toks(a);
  const B = toks(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function nearDuplicateBatch(
  newPreviews: string[],
  prevPreviews: string[],
): boolean {
  if (prevPreviews.length === 0 || newPreviews.length === 0) return false;
  // Pair each new with its best match in prev; avg similarity ≥ 0.9 means dupe.
  let sum = 0;
  for (const np of newPreviews) {
    let best = 0;
    for (const pp of prevPreviews) {
      const s = jaccard(np, pp);
      if (s > best) best = s;
    }
    sum += best;
  }
  const avg = sum / newPreviews.length;
  return avg >= 0.9;
}

export interface SuggestionEngineHandle {
  secondsUntilNext: number;
  generating: boolean;
  generateNow: () => Promise<void>;
}

export function useSuggestionEngine(opts?: {
  onBadKey?: () => void;
}): SuggestionEngineHandle {
  const apiKey = useSettingsStore((s) => s.apiKey);
  const prompt = useSettingsStore((s) => s.prompts.liveSuggestion);
  const windowSec = useSettingsStore((s) => s.contextWindows.suggestionsWindowSec);
  const intervalSec = useSettingsStore((s) => s.suggestionIntervalSec);

  const isRecording = useSessionStore((s) => s.isRecording);
  const startedAt = useSessionStore((s) => s.startedAt);
  const addBatch = useSessionStore((s) => s.addBatch);
  const setPendingBatch = useSessionStore((s) => s.setPendingBatch);
  const setLastBatchAt = useSessionStore((s) => s.setLastBatchAt);
  const setRunningSummary = useSessionStore((s) => s.setRunningSummary);

  const [generating, setGenerating] = useState(false);
  const [nextTickAt, setNextTickAt] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(Date.now());

  const abortRef = useRef<AbortController | null>(null);
  const lastTranscriptLenRef = useRef(0);
  const batchCountRef = useRef(0);

  const generate = useCallback(
    async (_manual: boolean) => {
      if (!apiKey) {
        opts?.onBadKey?.();
        toast.error("Add a Groq API key in Settings first.");
        return;
      }
      const sessionState = useSessionStore.getState();
      const { transcript, batches, runningSummary, startedAt: sAt } = sessionState;
      if (!sAt) return;

      const nowSec = (Date.now() - sAt) / 1000;
      const slice = renderTranscriptWindow(transcript, nowSec, windowSec);
      const transcriptLen = transcript.reduce((n, l) => n + (l.text?.length ?? 0), 0);

      // Only apply "nothing new" skip to automatic ticks, not manual clicks
      if (!_manual) {
        const delta = transcriptLen - lastTranscriptLenRef.current;
        if (batches.length > 0 && delta < LENGTH_DELTA_THRESHOLD) {
          return;
        }
      }

      // Cancel any prior in-flight
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setGenerating(true);
      setPendingBatch(true);
      const clientStarted = performance.now();

      const priorBatchTypes = batches
        .slice(0, 3)
        .flatMap((b) => b.items.map((i) => i.type));

      try {
        const resp = await fetchSuggestions(
          {
            prompt,
            window: slice.text,
            summary: runningSummary,
            sessionSeconds: nowSec,
            priorBatchTypes,
          },
          apiKey,
          abortRef.current.signal,
        );

        const items: Suggestion[] = resp.items.slice(0, 3).map((it) => ({
          id: nanoid(6),
          type: it.type,
          preview: it.preview,
          rationale: it.rationale || undefined,
        }));

        // Dedupe vs last batch
        const prevPreviews = batches[0]?.items.map((i) => i.preview) ?? [];
        const newPreviews = items.map((i) => i.preview);
        if (nearDuplicateBatch(newPreviews, prevPreviews)) {
          // Surface silently — we just skip adding a batch.
          return;
        }

        const batchId = nanoid(8);
        const clientLatencyMs = Math.round(performance.now() - clientStarted);
        addBatch({
          id: batchId,
          t: nowSec,
          items,
          meta: {
            t_window_start: slice.startSec,
            t_window_end: slice.endSec,
            model: resp.model,
            latencyMs: resp.latencyMs,
            clientLatencyMs,
            repaired: resp.repaired,
          },
        });
        setLastBatchAt(nowSec);
        lastTranscriptLenRef.current = transcriptLen;
        batchCountRef.current += 1;

        // Every Nth batch, refresh the running summary (non-blocking)
        if (batchCountRef.current % SUMMARY_EVERY_N_BATCHES === 0) {
          void fetchSummary(slice.text, runningSummary, apiKey)
            .then((sumText) => {
              if (sumText) setRunningSummary(sumText, nowSec);
            })
            .catch(() => undefined);
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") return;
        if (err instanceof SuggestError) {
          if (err.status === 401) {
            toast.error("Bad Groq API key.");
            opts?.onBadKey?.();
          } else if (err.status === 429) {
            toast.warning("Groq rate-limited — will retry on next tick.");
          } else if (err.code === "invalid_json") {
            toast.error("Model returned invalid JSON twice — dropping batch.");
          } else {
            toast.error(`Suggest failed: ${err.code}`);
          }
        } else {
          toast.error("Suggestion request failed.");
        }
      } finally {
        setGenerating(false);
        setPendingBatch(false);
      }
    },
    [
      apiKey,
      prompt,
      windowSec,
      addBatch,
      setPendingBatch,
      setLastBatchAt,
      setRunningSummary,
      opts,
    ],
  );

  const generateNow = useCallback(async () => {
    setNextTickAt(Date.now() + intervalSec * 1000);
    await generate(true);
  }, [generate, intervalSec]);

  // Auto-tick
  useEffect(() => {
    if (!isRecording) return;
    // First batch fires once we have 15 s of audio — wait for it
    const firstDelay = Math.min(intervalSec, 30) * 1000;
    setNextTickAt(Date.now() + firstDelay);
    const t0 = window.setTimeout(() => {
      void generate(false);
      setNextTickAt(Date.now() + intervalSec * 1000);
    }, firstDelay);
    const id = window.setInterval(() => {
      void generate(false);
      setNextTickAt(Date.now() + intervalSec * 1000);
    }, intervalSec * 1000);
    return () => {
      window.clearTimeout(t0);
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [isRecording, intervalSec, generate]);

  // 1-Hz clock only when recording, just for the countdown pill
  useEffect(() => {
    if (!isRecording) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isRecording]);

  const secondsUntilNext = isRecording
    ? Math.max(0, Math.ceil((nextTickAt - nowMs) / 1000))
    : 0;

  // Reset internal counters when session starts/stops (detect via startedAt change)
  useEffect(() => {
    lastTranscriptLenRef.current = 0;
    batchCountRef.current = 0;
  }, [startedAt]);

  return { secondsUntilNext, generating, generateNow };
}
