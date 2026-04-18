"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { streamChat, type ChatMode } from "@/lib/chatClient";
import { renderTranscriptWindow } from "@/lib/context";
import { suggestionLabel } from "@/lib/suggestionMeta";
import { useSessionStore } from "@/store/sessionStore";
import { useSettingsStore } from "@/store/settingsStore";
import type { Suggestion } from "@/types";

interface UseChatOptions {
  onBadKey?: () => void;
  onStreamStart?: () => void;
}

export function useChat(opts: UseChatOptions = {}) {
  const apiKey = useSettingsStore((s) => s.apiKey);
  const detailedPrompt = useSettingsStore((s) => s.prompts.detailedAnswer);
  const chatPrompt = useSettingsStore((s) => s.prompts.chat);
  const expansionWindowSec = useSettingsStore(
    (s) => s.contextWindows.expansionWindowSec,
  );
  const suggestionsWindowSec = useSettingsStore(
    (s) => s.contextWindows.suggestionsWindowSec,
  );

  const addChatMessage = useSessionStore((s) => s.addChatMessage);
  const updateChatMessage = useSessionStore((s) => s.updateChatMessage);
  const appendChatMessage = useSessionStore((s) => s.appendChatMessage);
  const markSuggestionVisited = useSessionStore((s) => s.markSuggestionVisited);
  const [streaming, setStreaming] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const id = streamingMsgIdRef.current;
    if (id) {
      updateChatMessage(id, { streaming: false });
      streamingMsgIdRef.current = null;
    }
    setStreaming(false);
  }, [updateChatMessage]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    (mode: ChatMode, userMessage: string, sourceSuggestionId?: string) => {
      if (!apiKey) {
        opts.onBadKey?.();
        toast.error("Add a Groq API key in Settings first.");
        return;
      }
      if (streaming) return; // Send is disabled while streaming, extra guard.

      const state = useSessionStore.getState();
      const startedAt = state.startedAt ?? Date.now();
      const nowSec = (Date.now() - startedAt) / 1000;

      const windowSec = mode === "detailed" ? expansionWindowSec : suggestionsWindowSec;
      const slice = renderTranscriptWindow(state.transcript, nowSec, windowSec);

      // last up to 12 prior messages (6 exchanges)
      const priorChat = state.chat
        .filter((m) => !m.streaming && !m.errored)
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));

      const userMsgId = nanoid(8);
      const assistantMsgId = nanoid(8);

      addChatMessage({
        id: userMsgId,
        t: nowSec,
        role: "user",
        content: userMessage,
        sourceSuggestionId,
      });
      addChatMessage({
        id: assistantMsgId,
        t: nowSec,
        role: "assistant",
        content: "",
        streaming: true,
      });

      streamingMsgIdRef.current = assistantMsgId;
      setStreaming(true);
      opts.onStreamStart?.();

      abortRef.current = streamChat(
        {
          mode,
          message: userMessage,
          systemPrompt: mode === "detailed" ? detailedPrompt : chatPrompt,
          transcriptWindow: slice.text,
          runningSummary: state.runningSummary,
          priorChat,
          sessionSeconds: nowSec,
        },
        apiKey,
        {
          onFirstToken: (ms) => {
            updateChatMessage(assistantMsgId, { firstTokenMs: Math.round(ms) });
          },
          onDelta: (delta) => appendChatMessage(assistantMsgId, delta),
          onDone: () => {
            updateChatMessage(assistantMsgId, { streaming: false });
            streamingMsgIdRef.current = null;
            setStreaming(false);
          },
          onError: (code, message) => {
            if (code === "bad_api_key") {
              toast.error("Bad Groq API key.");
              opts.onBadKey?.();
            } else if (code === "rate_limited") {
              toast.warning("Groq rate-limited — try again in a few seconds.");
            } else if (code !== "aborted") {
              toast.error(`Chat failed: ${message || code}`);
            }
            updateChatMessage(assistantMsgId, {
              streaming: false,
              errored: code !== "aborted",
              content:
                useSessionStore.getState().chat.find((m) => m.id === assistantMsgId)
                  ?.content ||
                (code === "aborted"
                  ? "(stopped)"
                  : "(response failed — retry)"),
            });
            streamingMsgIdRef.current = null;
            setStreaming(false);
          },
        },
      );
    },
    [
      apiKey,
      streaming,
      addChatMessage,
      updateChatMessage,
      appendChatMessage,
      detailedPrompt,
      chatPrompt,
      expansionWindowSec,
      suggestionsWindowSec,
      opts,
    ],
  );

  const sendChat = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      send("chat", t);
    },
    [send],
  );

  const expandSuggestion = useCallback(
    (batchId: string, s: Suggestion) => {
      markSuggestionVisited(batchId, s.id);
      const framed = `[${suggestionLabel(s.type)}] ${s.preview}`;
      send("detailed", framed, s.id);
    },
    [send, markSuggestionVisited],
  );

  const retry = useCallback(
    (erroredAssistantId: string) => {
      const state = useSessionStore.getState();
      const idx = state.chat.findIndex((m) => m.id === erroredAssistantId);
      if (idx < 0) return;
      // Find the nearest preceding user message
      let userMsgIdx = -1;
      for (let i = idx - 1; i >= 0; i--) {
        if (state.chat[i]?.role === "user") {
          userMsgIdx = i;
          break;
        }
      }
      if (userMsgIdx < 0) return;
      const userMsg = state.chat[userMsgIdx]!;
      // Trim: drop from the errored assistant message onwards
      const keep = state.chat.slice(0, idx);
      useSessionStore.setState({ chat: keep });
      const mode = userMsg.sourceSuggestionId ? "detailed" : "chat";
      send(mode, userMsg.content, userMsg.sourceSuggestionId);
    },
    [send],
  );

  return { sendChat, expandSuggestion, retry, streaming, abort };
}
