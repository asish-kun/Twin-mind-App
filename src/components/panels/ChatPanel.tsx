"use client";

import { Send } from "lucide-react";
import { AnimatedBorder } from "@/components/animated/AnimatedBorder";
import { ColumnHeader } from "@/components/layout/ColumnHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Phase 1 placeholder. Phase 2 wires streaming chat + border flash on send. */
export function ChatPanel() {
  return (
    <AnimatedBorder state="idle" tone="indigo" className="flex h-full flex-col">
      <div className="flex h-full flex-col">
        <ColumnHeader index={3} title="Chat (Detailed Answers)" status="Session-only" />

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4">
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
              Clicking a suggestion adds it here and streams a detailed answer grounded
              in the transcript. Users can also type questions directly. One chat per
              session — cleared on reload.
            </div>
          </div>

          <div className="border-t border-border/60 bg-background/60 p-3">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-end gap-2">
                    <Input placeholder="Ask anything…" disabled />
                    <Button disabled className="gap-1.5">
                      <Send className="h-4 w-4" />
                      Send
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Wired up in Phase 2.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </AnimatedBorder>
  );
}
