import { NextResponse } from "next/server";
import Groq from "groq-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  const key = req.headers.get("x-groq-key");
  if (!key) {
    return NextResponse.json({ error: "missing_api_key" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("audio");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "audio_required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "empty_audio" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "audio_too_large" }, { status: 413 });
  }

  const lang = (form.get("language") as string | null) ?? "en";
  const prompt = (form.get("prompt") as string | null) ?? undefined;

  const extensionFromMime: Record<string, string> = {
    "audio/webm": "webm",
    "audio/webm;codecs=opus": "webm",
    "audio/ogg": "ogg",
    "audio/ogg;codecs=opus": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
  };
  const mime = file.type || "audio/webm";
  const ext = extensionFromMime[mime] ?? "webm";

  const groq = new Groq({ apiKey: key });

  try {
    const named = new File([file], `chunk.${ext}`, { type: mime });
    const result = await groq.audio.transcriptions.create({
      file: named,
      model: "whisper-large-v3",
      language: lang,
      response_format: "verbose_json",
      temperature: 0,
      ...(prompt ? { prompt } : {}),
    });

    const text = (result as { text?: string }).text ?? "";
    const duration = (result as { duration?: number }).duration ?? 0;
    return NextResponse.json({ text: text.trim(), duration });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status ?? 500;
    const message =
      (err as { error?: { message?: string }; message?: string })?.error?.message ??
      (err as { message?: string })?.message ??
      "transcription_failed";
    const code =
      status === 401
        ? "bad_api_key"
        : status === 429
          ? "rate_limited"
          : status >= 500
            ? "groq_error"
            : "transcription_failed";
    return NextResponse.json({ error: code, message }, { status });
  }
}
