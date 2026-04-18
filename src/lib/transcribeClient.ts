import type { Chunk } from "@/lib/recorder";

export interface TranscribeResult {
  text: string;
  duration: number;
}

export class TranscribeError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.code = code;
    this.status = status;
  }
}

export async function transcribeChunk(
  chunk: Chunk,
  apiKey: string,
  previousTranscriptTail?: string,
): Promise<TranscribeResult> {
  const fd = new FormData();
  fd.append("audio", chunk.blob, `chunk-${chunk.seq}.webm`);
  fd.append("language", "en");
  // Feeding Whisper the tail helps it spell names consistently across chunks.
  if (previousTranscriptTail) fd.append("prompt", previousTranscriptTail);

  const res = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "x-groq-key": apiKey },
    body: fd,
  });

  if (!res.ok) {
    let body: { error?: string; message?: string } = {};
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    throw new TranscribeError(
      body.error ?? "transcription_failed",
      res.status,
      body.message,
    );
  }

  const json = (await res.json()) as TranscribeResult;
  return json;
}
