export interface Chunk {
  blob: Blob;
  /** Seconds from recording start */
  t_start: number;
  t_end: number;
  seq: number;
  mimeType: string;
}

export type RecorderError =
  | "no_browser_support"
  | "permission_denied"
  | "no_device"
  | "unknown";

const CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      // ignore
    }
  }
  return null;
}

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    pickMimeType() !== null
  );
}

type ChunkHandler = (chunk: Chunk) => void;
type LevelHandler = (rms: number) => void;

export interface LiveRecorderOptions {
  chunkSeconds: number;
  onChunk: ChunkHandler;
  onLevel?: LevelHandler;
  onError?: (err: RecorderError, detail?: unknown) => void;
}

export class LiveRecorder {
  private opts: LiveRecorderOptions;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private ac: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelTimer: number | null = null;
  private startedAt = 0;
  private seq = 0;
  private mimeType = "audio/webm";

  constructor(opts: LiveRecorderOptions) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    if (!isRecordingSupported()) {
      this.opts.onError?.("no_browser_support");
      throw new Error("no_browser_support");
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
    } catch (e: unknown) {
      const name = (e as { name?: string })?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        this.opts.onError?.("permission_denied", e);
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        this.opts.onError?.("no_device", e);
      } else {
        this.opts.onError?.("unknown", e);
      }
      throw e;
    }

    this.mimeType = pickMimeType() ?? "audio/webm";
    this.recorder = new MediaRecorder(this.stream, {
      mimeType: this.mimeType,
      audioBitsPerSecond: 32_000,
    });
    this.startedAt = performance.now();
    this.seq = 0;

    this.recorder.ondataavailable = (ev: BlobEvent) => {
      if (!ev.data || ev.data.size === 0) return;
      const now = performance.now();
      const seq = this.seq++;
      const tEnd = (now - this.startedAt) / 1000;
      const tStart = Math.max(0, tEnd - this.opts.chunkSeconds);
      this.opts.onChunk({
        blob: ev.data,
        t_start: tStart,
        t_end: tEnd,
        seq,
        mimeType: this.mimeType,
      });
    };

    this.recorder.onerror = (e) => {
      this.opts.onError?.("unknown", e);
    };

    // Analyser for waveform bars
    if (this.opts.onLevel) {
      try {
        const AC: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        this.ac = new AC();
        const src = this.ac.createMediaStreamSource(this.stream);
        this.analyser = this.ac.createAnalyser();
        this.analyser.fftSize = 512;
        src.connect(this.analyser);
        const buf = new Uint8Array(this.analyser.frequencyBinCount);
        const tick = () => {
          if (!this.analyser) return;
          this.analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i]! - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buf.length);
          this.opts.onLevel?.(rms);
          this.levelTimer = requestAnimationFrame(tick);
        };
        this.levelTimer = requestAnimationFrame(tick);
      } catch {
        // level monitoring is optional
      }
    }

    this.recorder.start(this.opts.chunkSeconds * 1000);
  }

  stop(): void {
    try {
      this.recorder?.stop();
    } catch {
      // ignore
    }
    this.recorder = null;

    if (this.levelTimer !== null) {
      cancelAnimationFrame(this.levelTimer);
      this.levelTimer = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.ac) {
      void this.ac.close().catch(() => undefined);
      this.ac = null;
    }
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
  }
}
