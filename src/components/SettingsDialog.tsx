"use client";

import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { useSettingsStore } from "@/store/settingsStore";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import { cn, maskKey } from "@/lib/utils";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Tab = "key" | "prompts" | "windows";

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [tab, setTab] = useState<Tab>("key");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        <DialogHeader className="border-b border-border/60 p-5">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Your Groq key and settings are stored in this browser only. No server persistence.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[70vh] min-h-[420px]">
          <nav className="w-44 shrink-0 border-r border-border/60 p-3">
            <TabButton active={tab === "key"} onClick={() => setTab("key")}>
              API key
            </TabButton>
            <TabButton active={tab === "prompts"} onClick={() => setTab("prompts")}>
              Prompts
            </TabButton>
            <TabButton active={tab === "windows"} onClick={() => setTab("windows")}>
              Windows
            </TabButton>
            <Separator className="my-3" />
            <ResetAllButton />
          </nav>
          <div className="flex-1 overflow-y-auto p-5">
            {tab === "key" && <ApiKeyTab />}
            {tab === "prompts" && <PromptsTab />}
            {tab === "windows" && <WindowsTab />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mb-1 block w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ResetAllButton() {
  const resetDefaults = useSettingsStore((s) => s.resetDefaults);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-1.5 text-muted-foreground"
      onClick={() => {
        resetDefaults();
        toast.success("Settings reset to defaults");
      }}
    >
      <RotateCcw className="h-3.5 w-3.5" />
      Reset all
    </Button>
  );
}

function ApiKeyTab() {
  const apiKey = useSettingsStore((s) => s.apiKey);
  const setApiKey = useSettingsStore((s) => s.setApiKey);
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState(apiKey);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);

  async function test() {
    if (!draft.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${draft.trim()}` },
      });
      setTestResult(res.ok ? "ok" : "fail");
      if (res.ok) toast.success("Groq key works");
      else toast.error("Groq rejected this key");
    } catch {
      setTestResult("fail");
      toast.error("Network error reaching Groq");
    } finally {
      setTesting(false);
    }
  }

  function save() {
    setApiKey(draft.trim());
    toast.success("API key saved");
  }

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <Label htmlFor="key">Groq API key</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Get one at{" "}
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            console.groq.com/keys
          </a>
          .
        </p>
        <div className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <Input
              id="key"
              type={show ? "text" : "password"}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setTestResult(null);
              }}
              placeholder="gsk_..."
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
              aria-label={show ? "Hide" : "Show"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button variant="outline" onClick={test} disabled={testing || !draft.trim()}>
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : testResult === "ok" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : testResult === "fail" ? (
              <XCircle className="h-4 w-4 text-rose-600" />
            ) : null}
            Test
          </Button>
          <Button onClick={save} disabled={!draft.trim() || draft.trim() === apiKey}>
            Save
          </Button>
        </div>
        {apiKey && (
          <p className="mt-2 text-xs text-muted-foreground">
            Saved key: <span className="font-mono">{maskKey(apiKey)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function PromptsTab() {
  const prompts = useSettingsStore((s) => s.prompts);
  const setPrompt = useSettingsStore((s) => s.setPrompt);
  const resetPrompt = useSettingsStore((s) => s.resetPrompt);

  const fields: Array<{
    key: keyof typeof prompts;
    label: string;
    hint: string;
  }> = [
    {
      key: "liveSuggestion",
      label: "Live suggestion prompt",
      hint: "Generates the 3 rolling cards. Must return JSON.",
    },
    {
      key: "detailedAnswer",
      label: "Detailed answer on click",
      hint: "Fires when a card is clicked. Longer, transcript-grounded.",
    },
    {
      key: "chat",
      label: "Chat prompt",
      hint: "Used when the user types in the chat input.",
    },
  ];

  return (
    <div className="space-y-6">
      {fields.map((f) => {
        const diverged = prompts[f.key] !== DEFAULT_SETTINGS.prompts[f.key];
        return (
          <div key={f.key}>
            <div className="mb-1 flex items-center justify-between">
              <div>
                <Label>{f.label}</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{f.hint}</p>
              </div>
              <div className="flex items-center gap-2">
                {diverged && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
                    Edited
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!diverged}
                  onClick={() => resetPrompt(f.key)}
                  className="gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
              </div>
            </div>
            <Textarea
              value={prompts[f.key]}
              onChange={(e) => setPrompt(f.key, e.target.value)}
              className="min-h-[180px] font-mono text-xs leading-relaxed"
              spellCheck={false}
            />
            <div className="mt-1 text-[11px] text-muted-foreground">
              {prompts[f.key].length.toLocaleString()} chars
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WindowsTab() {
  const chunkSeconds = useSettingsStore((s) => s.chunkSeconds);
  const suggestionIntervalSec = useSettingsStore((s) => s.suggestionIntervalSec);
  const suggWindow = useSettingsStore((s) => s.contextWindows.suggestionsWindowSec);
  const expWindow = useSettingsStore((s) => s.contextWindows.expansionWindowSec);
  const setChunkSeconds = useSettingsStore((s) => s.setChunkSeconds);
  const setSuggestionIntervalSec = useSettingsStore((s) => s.setSuggestionIntervalSec);
  const setContextWindow = useSettingsStore((s) => s.setContextWindow);

  return (
    <div className="max-w-xl space-y-6">
      <SliderRow
        label="Transcription chunk"
        suffix="s"
        hint="How often MediaRecorder emits audio chunks for transcription."
        min={10}
        max={30}
        step={1}
        value={chunkSeconds}
        onChange={setChunkSeconds}
      />
      <SliderRow
        label="Suggestion refresh interval"
        suffix="s"
        hint="How often new suggestion batches are auto-generated."
        min={15}
        max={90}
        step={5}
        value={suggestionIntervalSec}
        onChange={setSuggestionIntervalSec}
      />
      <SliderRow
        label="Live-suggestion context window"
        suffix="s"
        hint="Transcript seconds fed to the suggestion model each refresh."
        min={30}
        max={600}
        step={15}
        value={suggWindow}
        onChange={(v) => setContextWindow("suggestionsWindowSec", v)}
      />
      <SliderRow
        label="Detailed-answer context window"
        suffix="s"
        hint="Transcript seconds fed to the detailed-answer model when a card is clicked."
        min={60}
        max={1800}
        step={30}
        value={expWindow}
        onChange={(v) => setContextWindow("expansionWindowSec", v)}
      />
    </div>
  );
}

interface SliderRowProps {
  label: string;
  hint: string;
  suffix: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}

function SliderRow({
  label,
  hint,
  suffix,
  min,
  max,
  step,
  value,
  onChange,
}: SliderRowProps) {
  return (
    <div>
      <div className="mb-2 flex items-end justify-between">
        <div>
          <Label>{label}</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="font-mono text-sm tabular-nums text-foreground">
          {value}
          <span className="ml-0.5 text-muted-foreground">{suffix}</span>
        </div>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? value)}
      />
    </div>
  );
}
