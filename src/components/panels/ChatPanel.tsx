"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";
import { Send, Square, Copy, Check, RotateCcw } from "lucide-react";
import {
  AnimatedBorder,
  type AnimatedBorderHandle,
} from "@/components/animated/AnimatedBorder";
import { ColumnHeader } from "@/components/layout/ColumnHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatMMSS } from "@/lib/utils";
import { useSessionStore } from "@/store/sessionStore";
import type { ChatMessage } from "@/types";

interface ChatPanelProps {
  sendChat: (text: string) => void;
  streaming: boolean;
  onAbort: () => void;
  onRetry: (messageId: string) => void;
}

export function ChatPanel({ sendChat, streaming, onAbort, onRetry }: ChatPanelProps) {
  const messages = useSessionStore((s) => s.chat);
  const borderRef = useRef<AnimatedBorderHandle>(null);

  // Flash on new user message arrival (i.e., whenever a new user message is appended)
  const lastUserId = useRef<string | null>(null);
  useEffect(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    if (lastUserId.current === lastUser.id) return;
    lastUserId.current = lastUser.id;
    borderRef.current?.flash();
  }, [messages]);

  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Autosize textarea up to ~6 rows
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 24 * 6 + 16; // ~6 rows
    el.style.height = `${Math.min(max, el.scrollHeight)}px`;
  }, [draft]);

  // Sticky auto-scroll
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const threshold = 80;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = () => {
    if (!draft.trim() || streaming) return;
    sendChat(draft);
    setDraft("");
  };

  return (
    <AnimatedBorder
      ref={borderRef}
      state={streaming ? "stream" : "idle"}
      tone="indigo"
      className="flex h-full flex-col"
    >
      <div className="flex h-full flex-col">
        <ColumnHeader
          index={3}
          title="Chat (Detailed Answers)"
          status="Session-only"
        />

        <div
          ref={listRef}
          className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
        >
          {messages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="max-w-sm text-center text-sm text-muted-foreground">
                Click a suggestion to expand it, or ask anything about the meeting.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <MessageBubble key={m.id} message={m} onRetry={onRetry} />
            ))
          )}
        </div>

        <div className="border-t border-border/60 bg-background/60 p-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask anything about the meeting…"
              rows={1}
              className="min-h-0 resize-none py-2"
              disabled={streaming}
            />
            {streaming ? (
              <Button variant="destructive" onClick={onAbort} className="gap-1.5">
                <Square className="h-4 w-4 fill-white" />
                Stop
              </Button>
            ) : (
              <Button onClick={submit} disabled={!draft.trim()} className="gap-1.5">
                <Send className="h-4 w-4" />
                Send
              </Button>
            )}
          </div>
          <p className="mt-1.5 pl-1 text-[11px] text-muted-foreground">
            Enter to send, Shift+Enter for newline.
          </p>
        </div>
      </div>
    </AnimatedBorder>
  );
}

function MessageBubble({
  message,
  onRetry,
}: {
  message: ChatMessage;
  onRetry: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "group relative max-w-[85%] rounded-xl px-3.5 py-2 text-sm leading-relaxed shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-card text-foreground",
          message.errored && "ring-1 ring-rose-300",
        )}
      >
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-widest opacity-70">
          <span>{isUser ? "You" : "TwinMind"}</span>
          <span className="font-mono tabular-nums">+{formatMMSS(message.t)}</span>
          {message.firstTokenMs !== undefined && !isUser && (
            <span className="font-mono tabular-nums opacity-80">
              {message.firstTokenMs} ms
            </span>
          )}
        </div>
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <div className="prose prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:pl-5 [&_li]:my-0.5">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: (props) => (
                  <a {...props} target="_blank" rel="noreferrer" className="underline" />
                ),
              }}
            >
              {message.content || (message.streaming ? "…" : "")}
            </ReactMarkdown>
            {message.streaming && (
              <span className="ml-0.5 inline-block h-3.5 w-[3px] animate-pulse bg-foreground align-middle" />
            )}
          </div>
        )}
        {!isUser && !message.streaming && message.content && !message.errored && (
          <button
            onClick={copy}
            aria-label="Copy"
            className="absolute -top-2 right-2 hidden rounded-md border border-border bg-background p-1 text-muted-foreground shadow-sm hover:text-foreground group-hover:inline-flex"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        )}
        {!isUser && message.errored && (
          <button
            onClick={() => onRetry(message.id)}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-muted"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        )}
      </div>
    </motion.div>
  );
}
