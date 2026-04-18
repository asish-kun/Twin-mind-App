"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { Settings } from "@/types";

interface SettingsState extends Settings {
  setApiKey: (key: string) => void;
  setPrompt: (key: keyof Settings["prompts"], value: string) => void;
  setContextWindow: (key: keyof Settings["contextWindows"], value: number) => void;
  setChunkSeconds: (sec: number) => void;
  setSuggestionIntervalSec: (sec: number) => void;
  resetDefaults: () => void;
  resetPrompt: (key: keyof Settings["prompts"]) => void;
  /** True after storage hydration — use to avoid SSR mismatch. */
  _hasHydrated: boolean;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      _hasHydrated: false,
      setApiKey: (apiKey) => set({ apiKey }),
      setPrompt: (key, value) =>
        set((s) => ({ prompts: { ...s.prompts, [key]: value } })),
      setContextWindow: (key, value) =>
        set((s) => ({ contextWindows: { ...s.contextWindows, [key]: value } })),
      setChunkSeconds: (chunkSeconds) => set({ chunkSeconds }),
      setSuggestionIntervalSec: (suggestionIntervalSec) =>
        set({ suggestionIntervalSec }),
      resetDefaults: () =>
        set({
          ...DEFAULT_SETTINGS,
          apiKey: "",
        }),
      resetPrompt: (key) =>
        set((s) => ({
          prompts: { ...s.prompts, [key]: DEFAULT_SETTINGS.prompts[key] },
        })),
    }),
    {
      name: "twinmind-settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        apiKey: state.apiKey,
        prompts: state.prompts,
        contextWindows: state.contextWindows,
        chunkSeconds: state.chunkSeconds,
        suggestionIntervalSec: state.suggestionIntervalSec,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state._hasHydrated = true;
      },
    },
  ),
);

export function useHydratedSettings(): { hydrated: boolean } {
  const hydrated = useSettingsStore((s) => s._hasHydrated);
  return { hydrated };
}
