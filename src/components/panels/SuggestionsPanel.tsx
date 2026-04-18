"use client";

import { RotateCw } from "lucide-react";
import { AnimatedBorder } from "@/components/animated/AnimatedBorder";
import { ColumnHeader } from "@/components/layout/ColumnHeader";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/sessionStore";

/**
 * Phase 1 placeholder. Phase 2 swaps the body for real batches + animations.
 * Border state is already wired to batch arrival so Phase 2 can flash it.
 */
export function SuggestionsPanel() {
  const batches = useSessionStore((s) => s.batches);
  const isRecording = useSessionStore((s) => s.isRecording);

  return (
    <AnimatedBorder state={isRecording ? "stream" : "idle"} tone="violet" className="flex h-full flex-col">
      <div className="flex h-full flex-col">
        <ColumnHeader
          index={2}
          title="Live Suggestions"
          status={`${batches.length} batches`}
        />
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
          <Button variant="outline" size="sm" disabled className="gap-1.5">
            <RotateCw className="h-3.5 w-3.5" />
            Reload suggestions
          </Button>
          <span className="text-[11px] text-muted-foreground">Phase 2</span>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            Suggestions appear here once recording starts. (Engine wires up in Phase 2.)
          </p>
        </div>
      </div>
    </AnimatedBorder>
  );
}
