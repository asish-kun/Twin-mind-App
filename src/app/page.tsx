"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { TranscriptPanel } from "@/components/panels/TranscriptPanel";
import { SuggestionsPanel } from "@/components/panels/SuggestionsPanel";
import { ChatPanel } from "@/components/panels/ChatPanel";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useSettingsStore, useHydratedSettings } from "@/store/settingsStore";

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { hydrated } = useHydratedSettings();
  const apiKey = useSettingsStore((s) => s.apiKey);

  // First-run: open settings automatically if no key is set
  useEffect(() => {
    if (hydrated && !apiKey) setSettingsOpen(true);
  }, [hydrated, apiKey]);

  return (
    <div className="flex h-screen flex-col">
      <Header onOpenSettings={() => setSettingsOpen(true)} />
      <main className="flex-1 overflow-hidden p-4">
        <div className="grid h-full gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="min-h-0">
            <TranscriptPanel onOpenSettings={() => setSettingsOpen(true)} />
          </div>
          <div className="min-h-0">
            <SuggestionsPanel />
          </div>
          <div className="min-h-0 md:col-span-2 xl:col-span-1">
            <ChatPanel />
          </div>
        </div>
      </main>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
