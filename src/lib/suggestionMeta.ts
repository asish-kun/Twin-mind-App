import type { LucideIcon } from "lucide-react";
import {
  HelpCircle,
  MessageSquareQuote,
  CheckCheck,
  ShieldCheck,
  Lightbulb,
} from "lucide-react";
import type { SuggestionType } from "@/types";

interface MetaEntry {
  label: string;
  icon: LucideIcon;
  /** Tailwind class fragment — matches tokens defined in tailwind.config.ts sugg.* */
  tone: {
    ring: string;
    bg: string;
    text: string;
    dot: string;
  };
}

export const SUGGESTION_META: Record<SuggestionType, MetaEntry> = {
  question: {
    label: "Question",
    icon: HelpCircle,
    tone: {
      ring: "ring-sky-200",
      bg: "bg-sky-50",
      text: "text-sky-700",
      dot: "bg-sky-500",
    },
  },
  talking_point: {
    label: "Talking point",
    icon: MessageSquareQuote,
    tone: {
      ring: "ring-violet-200",
      bg: "bg-violet-50",
      text: "text-violet-700",
      dot: "bg-violet-500",
    },
  },
  answer: {
    label: "Answer",
    icon: CheckCheck,
    tone: {
      ring: "ring-emerald-200",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      dot: "bg-emerald-500",
    },
  },
  fact_check: {
    label: "Fact check",
    icon: ShieldCheck,
    tone: {
      ring: "ring-amber-200",
      bg: "bg-amber-50",
      text: "text-amber-700",
      dot: "bg-amber-500",
    },
  },
  clarification: {
    label: "Clarify",
    icon: Lightbulb,
    tone: {
      ring: "ring-cyan-200",
      bg: "bg-cyan-50",
      text: "text-cyan-700",
      dot: "bg-cyan-500",
    },
  },
};

export function suggestionLabel(type: SuggestionType): string {
  return SUGGESTION_META[type].label;
}
