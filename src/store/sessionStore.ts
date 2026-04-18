"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  ChatMessage,
  SuggestionBatch,
  TranscriptLine,
} from "@/types";

interface SessionState {
  sessionId: string;
  startedAt: number | null;
  endedAt: number | null;
  isRecording: boolean;
  transcript: TranscriptLine[];
  batches: SuggestionBatch[];
  chat: ChatMessage[];

  /** Rolling one-paragraph summary of the meeting so far. */
  runningSummary: string;
  /** Session seconds at which the running summary was last refreshed. */
  summaryUpdatedAt: number;
  /** True while a suggestion batch is being generated. */
  pendingBatch: boolean;
  /** Session seconds of the last successful batch. */
  lastBatchAt: number;

  startSession: () => void;
  stopSession: () => void;
  resetSession: () => void;

  addTranscriptLine: (line: TranscriptLine) => void;
  updateTranscriptLine: (id: string, patch: Partial<TranscriptLine>) => void;

  addBatch: (batch: SuggestionBatch) => void;
  markSuggestionVisited: (batchId: string, suggestionId: string) => void;

  addChatMessage: (msg: ChatMessage) => void;
  updateChatMessage: (id: string, patch: Partial<ChatMessage>) => void;
  appendChatMessage: (id: string, delta: string) => void;

  setRunningSummary: (text: string, atSec: number) => void;
  setPendingBatch: (v: boolean) => void;
  setLastBatchAt: (atSec: number) => void;
}

const initial = {
  sessionId: nanoid(8),
  startedAt: null as number | null,
  endedAt: null as number | null,
  isRecording: false,
  transcript: [] as TranscriptLine[],
  batches: [] as SuggestionBatch[],
  chat: [] as ChatMessage[],
  runningSummary: "",
  summaryUpdatedAt: 0,
  pendingBatch: false,
  lastBatchAt: 0,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...initial,

  startSession: () =>
    set({
      ...initial,
      sessionId: nanoid(8),
      startedAt: Date.now(),
      isRecording: true,
    }),

  stopSession: () => set({ isRecording: false, endedAt: Date.now() }),

  resetSession: () =>
    set({
      ...initial,
      sessionId: nanoid(8),
    }),

  addTranscriptLine: (line) =>
    set((s) => ({ transcript: [...s.transcript, line] })),

  updateTranscriptLine: (id, patch) =>
    set((s) => ({
      transcript: s.transcript.map((l) =>
        l.id === id ? { ...l, ...patch } : l,
      ),
    })),

  addBatch: (batch) => set((s) => ({ batches: [batch, ...s.batches] })),

  markSuggestionVisited: (batchId, suggestionId) =>
    set((s) => ({
      batches: s.batches.map((b) =>
        b.id === batchId
          ? {
              ...b,
              visitedIds: Array.from(new Set([...(b.visitedIds ?? []), suggestionId])),
            }
          : b,
      ),
    })),

  addChatMessage: (msg) => set((s) => ({ chat: [...s.chat, msg] })),

  updateChatMessage: (id, patch) =>
    set((s) => ({
      chat: s.chat.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),

  appendChatMessage: (id, delta) =>
    set((s) => ({
      chat: s.chat.map((m) =>
        m.id === id ? { ...m, content: m.content + delta } : m,
      ),
    })),

  setRunningSummary: (text, atSec) =>
    set({ runningSummary: text, summaryUpdatedAt: atSec }),

  setPendingBatch: (pendingBatch) => set({ pendingBatch }),

  setLastBatchAt: (lastBatchAt) => set({ lastBatchAt }),
}));
