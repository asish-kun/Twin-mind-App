"use client";

import { useEffect, useState } from "react";
import { Mic, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/sessionStore";
import { formatMMSS } from "@/lib/utils";

interface HeaderProps {
  onOpenSettings: () => void;
}

export function Header({ onOpenSettings }: HeaderProps) {
  const isRecording = useSessionStore((s) => s.isRecording);
  const startedAt = useSessionStore((s) => s.startedAt);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isRecording) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isRecording]);

  const elapsed = startedAt ? (now - startedAt) / 1000 : 0;

  return (
    <header className="flex items-center justify-between border-b border-border/70 bg-background/70 px-6 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Mic className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold leading-none tracking-tight">
            TwinMind
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">
            Live Suggestions
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {isRecording && (
          <div className="flex items-center gap-2 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-rose-400 opacity-75" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-rose-500" />
            </span>
            REC {formatMMSS(elapsed)}
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={onOpenSettings} className="gap-1.5">
          <SettingsIcon className="h-4 w-4" />
          Settings
        </Button>
      </div>
    </header>
  );
}
