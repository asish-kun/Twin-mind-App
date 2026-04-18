"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { SUGGESTION_META } from "@/lib/suggestionMeta";
import type { Suggestion } from "@/types";

interface SuggestionCardProps {
  suggestion: Suggestion;
  visited?: boolean;
  onClick: (s: Suggestion) => void;
}

export function SuggestionCard({ suggestion, visited, onClick }: SuggestionCardProps) {
  const meta = SUGGESTION_META[suggestion.type];
  const Icon = meta.icon;

  const handle = () => onClick(suggestion);

  return (
    <motion.button
      type="button"
      onClick={handle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handle();
        }
      }}
      layout
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.995 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className={cn(
        "group w-full rounded-xl border bg-card p-3.5 text-left shadow-sm ring-1 ring-transparent transition-colors",
        "hover:shadow-md hover:ring-1",
        meta.tone.ring.replace("ring-", "hover:ring-"),
        visited && "opacity-60",
      )}
      aria-label={`${meta.label}: ${suggestion.preview}`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1",
            meta.tone.bg,
            meta.tone.text,
            meta.tone.ring,
          )}
        >
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
      </div>
      <p className="text-[13.5px] font-medium leading-snug text-foreground">
        {suggestion.preview}
      </p>
      {suggestion.rationale && (
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          {suggestion.rationale}
        </p>
      )}
    </motion.button>
  );
}
