"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, RotateCw } from "lucide-react";
import {
  AnimatedBorder,
  type AnimatedBorderHandle,
} from "@/components/animated/AnimatedBorder";
import { ColumnHeader } from "@/components/layout/ColumnHeader";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SuggestionCard } from "@/components/panels/SuggestionCard";
import { SUGGESTION_META } from "@/lib/suggestionMeta";
import { cn, formatMMSS } from "@/lib/utils";
import { useSessionStore } from "@/store/sessionStore";
import { useSuggestionEngine } from "@/hooks/useSuggestionEngine";
import type { Suggestion } from "@/types";

interface SuggestionsPanelProps {
  onExpandSuggestion: (batchId: string, suggestion: Suggestion) => void;
  onOpenSettings: () => void;
}

export function SuggestionsPanel({
  onExpandSuggestion,
  onOpenSettings,
}: SuggestionsPanelProps) {
  const batches = useSessionStore((s) => s.batches);
  const isRecording = useSessionStore((s) => s.isRecording);
  const pendingBatch = useSessionStore((s) => s.pendingBatch);

  const engine = useSuggestionEngine({ onBadKey: onOpenSettings });

  const borderRef = useRef<AnimatedBorderHandle>(null);
  const topBatchId = batches[0]?.id ?? null;
  const lastFlashedId = useRef<string | null>(null);

  useEffect(() => {
    if (!topBatchId) return;
    if (lastFlashedId.current === topBatchId) return;
    lastFlashedId.current = topBatchId;
    // Skip the first mount flash in a fresh session (flashing before anything is rendered is jarring)
    borderRef.current?.flash();
  }, [topBatchId]);

  const countText =
    batches.length === 0
      ? "0 batches"
      : `${batches.length} batch${batches.length === 1 ? "" : "es"}`;

  // Type breakdown for the tooltip
  const typeCounts: Record<string, number> = {};
  for (const b of batches) {
    for (const s of b.items) {
      typeCounts[s.type] = (typeCounts[s.type] ?? 0) + 1;
    }
  }
  const breakdown = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

  return (
    <AnimatedBorder
      ref={borderRef}
      state={isRecording ? (engine.generating ? "stream" : "active") : "idle"}
      tone="violet"
      className="flex h-full flex-col"
    >
      <div className="flex h-full flex-col">
        <ColumnHeader
          index={2}
          title="Live Suggestions"
          status={
            batches.length === 0 ? (
              countText
            ) : (
              <TooltipProvider delayDuration={120}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help underline decoration-dotted underline-offset-2">
                      {countText}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent align="end" className="max-w-xs">
                    <div className="space-y-1">
                      {breakdown.map(([t, n]) => (
                        <div key={t} className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-block h-1.5 w-1.5 rounded-full",
                                SUGGESTION_META[t as keyof typeof SUGGESTION_META].tone
                                  .dot,
                              )}
                            />
                            {SUGGESTION_META[t as keyof typeof SUGGESTION_META].label}
                          </span>
                          <span className="font-mono tabular-nums">{n}</span>
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          }
        />

        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
          <Button
            variant="outline"
            size="sm"
            disabled={!isRecording || engine.generating}
            className="gap-1.5"
            onClick={() => void engine.generateNow()}
          >
            {engine.generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCw className="h-3.5 w-3.5" />
            )}
            Reload suggestions
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {!isRecording
              ? "idle"
              : engine.generating
                ? "generating…"
                : `auto-refresh in ${engine.secondsUntilNext}s`}
          </span>
        </div>

        {pendingBatch && (
          <div className="relative h-0.5 overflow-hidden bg-border/40">
            <div className="absolute inset-y-0 w-1/3 animate-shimmer shimmer-bg" />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3">
          {batches.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6">
              <p className="max-w-sm text-center text-sm text-muted-foreground">
                {isRecording
                  ? "Listening… first suggestions will appear shortly."
                  : "Start the mic — suggestions appear here once you're recording."}
              </p>
            </div>
          ) : (
            <ul className="space-y-6">
              <AnimatePresence initial={false}>
                {batches.map((b, idx) => (
                  <motion.li
                    key={b.id}
                    layout
                    initial={{ opacity: 0, y: -10 }}
                    animate={{
                      opacity: idx === 0 ? 1 : 0.65,
                      y: 0,
                      scale: idx === 0 ? 1 : 0.995,
                    }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  >
                    <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      <span>Batch +{formatMMSS(b.t)}</span>
                      {b.meta?.latencyMs !== undefined && (
                        <span
                          className={cn(
                            "font-mono tabular-nums",
                            b.meta.latencyMs > 2500 ? "text-amber-600" : "",
                          )}
                        >
                          {b.meta.latencyMs} ms
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {b.items.map((s) => (
                        <SuggestionCard
                          key={s.id}
                          suggestion={s}
                          visited={b.visitedIds?.includes(s.id)}
                          onClick={(sg) => onExpandSuggestion(b.id, sg)}
                        />
                      ))}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </AnimatedBorder>
  );
}
