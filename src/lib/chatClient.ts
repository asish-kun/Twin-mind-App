export type ChatMode = "detailed" | "chat";

export interface ChatRequestBody {
  mode: ChatMode;
  message: string;
  systemPrompt: string;
  transcriptWindow: string;
  runningSummary: string;
  priorChat: Array<{ role: "user" | "assistant"; content: string }>;
  sessionSeconds: number;
  suggestionType?: string;
}

export interface StreamCallbacks {
  onDelta: (delta: string) => void;
  onFirstToken?: (elapsedMs: number) => void;
  onDone: () => void;
  onError: (code: string, message: string) => void;
}

const ERROR_TAIL_RE = /\[\[TWINMIND_ERROR:([a-z_]+)\]\]/;

export function streamChat(
  body: ChatRequestBody,
  apiKey: string,
  cb: StreamCallbacks,
): AbortController {
  const controller = new AbortController();
  const started = performance.now();
  let firstTokenFired = false;

  (async () => {
    let res: Response;
    try {
      res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-groq-key": apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        cb.onError("aborted", "aborted");
      } else {
        cb.onError("network_error", (e as Error).message);
      }
      return;
    }

    if (!res.ok) {
      let payload: { error?: string; message?: string } = {};
      try {
        payload = await res.json();
      } catch {
        // ignore
      }
      cb.onError(
        payload.error ?? `http_${res.status}`,
        payload.message ?? `HTTP ${res.status}`,
      );
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      cb.onError("no_body", "Server returned no body");
      return;
    }
    const decoder = new TextDecoder();
    let buffered = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;

        if (!firstTokenFired) {
          firstTokenFired = true;
          cb.onFirstToken?.(performance.now() - started);
        }

        buffered += chunk;

        // Scan for inline error sentinel — if present, rewind it from deltas
        const errMatch = ERROR_TAIL_RE.exec(buffered);
        if (errMatch) {
          const pre = buffered.slice(0, errMatch.index).replace(/\n+$/, "");
          if (pre) cb.onDelta(pre);
          cb.onError(errMatch[1] ?? "chat_failed", "Model stream error");
          return;
        }
        // Emit any text that doesn't look like a partial sentinel prefix
        const tailLen = "[[TWINMIND_ERROR:".length;
        const safeEnd = Math.max(0, buffered.length - tailLen);
        const emit = buffered.slice(0, safeEnd);
        if (emit) {
          cb.onDelta(emit);
          buffered = buffered.slice(safeEnd);
        }
      }
      if (buffered && !ERROR_TAIL_RE.test(buffered)) {
        cb.onDelta(buffered);
      }
      cb.onDone();
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        cb.onError("aborted", "aborted");
      } else {
        cb.onError("stream_error", (e as Error).message);
      }
    }
  })();

  return controller;
}
