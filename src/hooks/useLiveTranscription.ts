"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { LiveRecorder, type Chunk, isRecordingSupported } from "@/lib/recorder";
import { transcribeChunk, TranscribeError } from "@/lib/transcribeClient";
import { useSessionStore } from "@/store/sessionStore";
import { useSettingsStore } from "@/store/settingsStore";

interface UseLiveTranscriptionOptions {
  onBadKey?: () => void;
}

export function useLiveTranscription(opts: UseLiveTranscriptionOptions = {}) {
  const recorderRef = useRef<LiveRecorder | null>(null);
  const inFlightRef = useRef(0);
  const appendLockRef = useRef<Promise<void>>(Promise.resolve());
  const [level, setLevel] = useState(0);
  const [supported, setSupported] = useState(true);

  const apiKey = useSettingsStore((s) => s.apiKey);
  const chunkSeconds = useSettingsStore((s) => s.chunkSeconds);
  const isRecording = useSessionStore((s) => s.isRecording);
  const startSession = useSessionStore((s) => s.startSession);
  const stopSession = useSessionStore((s) => s.stopSession);
  const addTranscriptLine = useSessionStore((s) => s.addTranscriptLine);
  const updateTranscriptLine = useSessionStore((s) => s.updateTranscriptLine);
  const transcriptRef = useRef(useSessionStore.getState().transcript);
  useEffect(
    () =>
      useSessionStore.subscribe((s) => {
        transcriptRef.current = s.transcript;
      }),
    [],
  );

  useEffect(() => {
    setSupported(isRecordingSupported());
  }, []);

  const handleChunk = useCallback(
    async (chunk: Chunk) => {
      const lineId = nanoid(6);
      addTranscriptLine({
        id: lineId,
        t_start: chunk.t_start,
        t_end: chunk.t_end,
        text: "",
        pending: true,
      });

      // Tail of previous confirmed transcript, for Whisper name continuity
      const tail = transcriptRef.current
        .filter((l) => !l.pending && l.text)
        .slice(-3)
        .map((l) => l.text)
        .join(" ")
        .slice(-400);

      inFlightRef.current += 1;
      try {
        const result = await transcribeChunk(chunk, apiKey, tail || undefined);
        // Serialize finalization so ordering stays stable if one chunk resolves late
        appendLockRef.current = appendLockRef.current.then(() => {
          updateTranscriptLine(lineId, {
            text: result.text,
            pending: false,
          });
        });
      } catch (err) {
        if (err instanceof TranscribeError) {
          if (err.status === 401) {
            toast.error("Bad Groq API key. Open settings to fix.");
            opts.onBadKey?.();
            // Stop recording so we don't hammer bad key
            recorderRef.current?.stop();
            recorderRef.current = null;
            stopSession();
          } else if (err.status === 429) {
            toast.warning("Groq is rate-limiting — slowing down.");
          } else {
            toast.error(`Transcription failed: ${err.code}`);
          }
        } else {
          toast.error("Network error — retrying next chunk.");
        }
        updateTranscriptLine(lineId, {
          text: "",
          pending: false,
        });
      } finally {
        inFlightRef.current -= 1;
      }
    },
    [apiKey, addTranscriptLine, updateTranscriptLine, stopSession, opts],
  );

  const start = useCallback(async () => {
    if (!apiKey) {
      toast.error("Add your Groq API key in Settings first.");
      opts.onBadKey?.();
      return;
    }
    if (!isRecordingSupported()) {
      toast.error("This browser doesn't support audio recording.");
      return;
    }
    startSession();
    const rec = new LiveRecorder({
      chunkSeconds,
      onChunk: handleChunk,
      onLevel: (rms) => setLevel(rms),
      onError: (err) => {
        if (err === "permission_denied") {
          toast.error("Microphone permission denied.");
        } else if (err === "no_device") {
          toast.error("No microphone found.");
        } else if (err === "no_browser_support") {
          toast.error("Recording not supported in this browser.");
        }
        stopSession();
      },
    });
    try {
      await rec.start();
      recorderRef.current = rec;
    } catch {
      stopSession();
    }
  }, [apiKey, chunkSeconds, handleChunk, startSession, stopSession, opts]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    stopSession();
    setLevel(0);
  }, [stopSession]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && recorderRef.current) {
        // Keep recording on tab blur; only stop on page unload.
      }
    };
    const onUnload = () => {
      recorderRef.current?.stop();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  return { start, stop, isRecording, level, supported };
}
