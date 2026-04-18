"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { TranscriptPanel } from "@/components/panels/TranscriptPanel";
import { SuggestionsPanel } from "@/components/panels/SuggestionsPanel";
import { ChatPanel } from "@/components/panels/ChatPanel";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useSettingsStore, useHydratedSettings } from "@/store/settingsStore";
import { useChat } from "@/hooks/useChat";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { hydrated } = useHydratedSettings();
  const apiKey = useSettingsStore((s) => s.apiKey);

  const openSettings = useCallback(() => setSettingsOpen(true), []);

  const { sendChat, expandSuggestion, retry, streaming, abort } = useChat({
    onBadKey: openSettings,
  });

  useEffect(() => {
    if (hydrated && !apiKey) setSettingsOpen(true);
  }, [hydrated, apiKey]);

  useKeyboardShortcuts({ onOpenSettings: openSettings });

  return (
    <div className="flex h-screen flex-col bg-gradient-to-b from-slate-50 to-white">
      <Header onOpenSettings={openSettings} />
      <main className="flex-1 overflow-hidden p-4">
        <div className="grid h-full gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="min-h-0">
            <TranscriptPanel onOpenSettings={openSettings} />
          </div>
          <div className="min-h-0">
            <SuggestionsPanel
              onExpandSuggestion={expandSuggestion}
              onOpenSettings={openSettings}
            />
          </div>
          <div className="min-h-0 md:col-span-2 xl:col-span-1">
            <ChatPanel
              sendChat={sendChat}
              streaming={streaming}
              onAbort={abort}
              onRetry={retry}
            />
          </div>
        </div>
      </main>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
