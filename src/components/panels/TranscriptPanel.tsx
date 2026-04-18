"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, KeyRound, MicOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedBorder } from "@/components/animated/AnimatedBorder";
import { ColumnHeader } from "@/components/layout/ColumnHeader";
import { Button } from "@/components/ui/button";
import { cn, formatMMSS } from "@/lib/utils";
import { useSessionStore } from "@/store/sessionStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useLiveTranscription } from "@/hooks/useLiveTranscription";
import { isRecordingSupported } from "@/lib/recorder";

interface TranscriptPanelProps {
  onOpenSettings: () => void;
}

export function TranscriptPanel({ onOpenSettings }: TranscriptPanelProps) {
  const apiKey = useSettingsStore((s) => s.apiKey);
  const chunkSeconds = useSettingsStore((s) => s.chunkSeconds);
  const isRecording = useSessionStore((s) => s.isRecording);
  const startedAt = useSessionStore((s) => s.startedAt);
  const transcript = useSessionStore((s) => s.transcript);

  const [supported, setSupported] = useState(true);
  const [now, setNow] = useState(Date.now());

  const { start, stop, level } = useLiveTranscription({
    onBadKey: onOpenSettings,
  });

  useEffect(() => setSupported(isRecordingSupported()), []);

  useEffect(() => {
    if (!isRecording) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [isRecording]);

  const elapsed = startedAt ? (now - startedAt) / 1000 : 0;

  // Sticky-scroll: only auto-scroll if user is near the bottom.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 64;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [transcript]);

  const toggle = () => (isRecording ? stop() : start());

  return (
    <AnimatedBorder state={isRecording ? "active" : "idle"} tone="indigo" className="flex h-full flex-col">
      <div className="flex h-full flex-col">
        <ColumnHeader
          index={1}
          title="Mic & Transcript"
          status={isRecording ? `REC ${formatMMSS(elapsed)}` : "Idle"}
        />

        <div className="flex flex-col gap-4 p-4">
          {/* Mic button + waveform */}
          <div className="flex items-center gap-4">
            <MicButton
              recording={isRecording}
              disabled={!apiKey || !supported}
              level={level}
              onClick={toggle}
            />
            <div className="flex-1 text-xs text-muted-foreground">
              {!supported
                ? "Recording is not supported in this browser."
                : !apiKey
                  ? "Add your Groq API key in Settings to begin."
                  : isRecording
                    ? `Chunks every ~${chunkSeconds}s. Transcript appears below as each chunk is transcribed.`
                    : "Click the mic to start. Transcript auto-scrolls."}
            </div>
          </div>

          {!apiKey && (
            <Button variant="outline" size="sm" className="w-fit gap-1.5" onClick={onOpenSettings}>
              <KeyRound className="h-3.5 w-3.5" />
              Add Groq API key
            </Button>
          )}
        </div>

        <div
          ref={scrollRef}
          className="relative flex-1 overflow-y-auto px-4 pb-4"
        >
          {transcript.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No transcript yet — start the mic.
            </div>
          ) : (
            <ul className="space-y-2.5">
              <AnimatePresence initial={false}>
                {transcript.map((l) => (
                  <motion.li
                    key={l.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                    className="flex gap-3 text-sm leading-relaxed"
                  >
                    <span className="mt-0.5 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {formatMMSS(l.t_end)}
                    </span>
                    {l.pending ? (
                      <span className="block h-4 w-40 rounded shimmer-bg animate-shimmer" />
                    ) : l.text ? (
                      <span className="text-foreground">{l.text}</span>
                    ) : (
                      <span className="italic text-muted-foreground">
                        (silence or transcription error)
                      </span>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </AnimatedBorder>
  );
}

interface MicButtonProps {
  recording: boolean;
  disabled: boolean;
  level: number;
  onClick: () => void;
}

function MicButton({ recording, disabled, level, onClick }: MicButtonProps) {
  // level 0..1 driving amplitude of 5 bars
  const bars = [0.4, 0.9, 1.2, 0.8, 0.5];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={recording}
      aria-label={recording ? "Stop recording" : "Start recording"}
      className={cn(
        "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-all",
        recording
          ? "bg-rose-500 text-white shadow-lg shadow-rose-200 hover:bg-rose-600"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {recording && (
        <>
          <span className="pointer-events-none absolute inset-0 animate-pulse-ring rounded-full bg-rose-300" />
          {/* waveform bars */}
          <span className="pointer-events-none absolute -bottom-5 left-1/2 flex -translate-x-1/2 items-end gap-0.5">
            {bars.map((b, i) => {
              const h = Math.max(3, Math.min(18, level * 60 * b + 3));
              return (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-rose-400/80"
                  style={{
                    height: `${h}px`,
                    transition: "height 90ms ease-out",
                  }}
                />
              );
            })}
          </span>
        </>
      )}
      {recording ? (
        <Square className="h-5 w-5 fill-white" />
      ) : disabled && !level ? (
        <MicOff className="h-5 w-5" />
      ) : (
        <Mic className="h-5 w-5" />
      )}
    </button>
  );
}
