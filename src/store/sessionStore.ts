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

  startSession: () => void;
  stopSession: () => void;
  resetSession: () => void;

  addTranscriptLine: (line: TranscriptLine) => void;
  updateTranscriptLine: (id: string, patch: Partial<TranscriptLine>) => void;

  addBatch: (batch: SuggestionBatch) => void;

  addChatMessage: (msg: ChatMessage) => void;
  updateChatMessage: (id: string, patch: Partial<ChatMessage>) => void;
  appendChatMessage: (id: string, delta: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: nanoid(8),
  startedAt: null,
  endedAt: null,
  isRecording: false,
  transcript: [],
  batches: [],
  chat: [],

  startSession: () =>
    set({
      sessionId: nanoid(8),
      startedAt: Date.now(),
      endedAt: null,
      isRecording: true,
      transcript: [],
      batches: [],
      chat: [],
    }),

  stopSession: () => set({ isRecording: false, endedAt: Date.now() }),

  resetSession: () =>
    set({
      sessionId: nanoid(8),
      startedAt: null,
      endedAt: null,
      isRecording: false,
      transcript: [],
      batches: [],
      chat: [],
    }),

  addTranscriptLine: (line) =>
    set((s) => ({ transcript: [...s.transcript, line] })),

  updateTranscriptLine: (id, patch) =>
    set((s) => ({
      transcript: s.transcript.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })),

  addBatch: (batch) => set((s) => ({ batches: [batch, ...s.batches] })),

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
}));
