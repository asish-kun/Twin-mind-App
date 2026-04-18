"use client";

import { useEffect } from "react";

interface Shortcuts {
  onOpenSettings: () => void;
  /** Optional — defaults to dispatching a `twinmind:toggle-mic` window event. */
  onToggleMic?: () => void;
}

export const TOGGLE_MIC_EVENT = "twinmind:toggle-mic";

/** Is the focused element a text-input so we should ignore plain-key shortcuts? */
function isTextTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return false;
}

export function useKeyboardShortcuts({
  onOpenSettings,
  onToggleMic,
}: Shortcuts) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenSettings();
        return;
      }
      if (e.key === " " && !mod && !isTextTarget(e.target)) {
        e.preventDefault();
        if (onToggleMic) onToggleMic();
        else window.dispatchEvent(new Event(TOGGLE_MIC_EVENT));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpenSettings, onToggleMic]);
}
