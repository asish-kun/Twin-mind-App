import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { z } from "zod";
import { parseSuggestionResponse } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "openai/gpt-oss-120b";
const MAX_WINDOW_CHARS = 16_000;

const BodySchema = z.object({
  prompt: z.string().min(10).max(8000),
  window: z.string().max(MAX_WINDOW_CHARS).default(""),
  summary: z.string().max(4000).default(""),
  sessionSeconds: z.number().finite().nonnegative().default(0),
  priorBatchTypes: z.array(z.string()).max(30).default([]),
});

function buildUserMessage(input: z.infer<typeof BodySchema>) {
  const { window, summary, sessionSeconds, priorBatchTypes } = input;
  const mmss = `${Math.floor(sessionSeconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(sessionSeconds % 60)
    .toString()
    .padStart(2, "0")}`;
  const parts = [
    `Meeting elapsed: ${mmss}`,
    summary ? `Running summary:\n${summary}` : "",
    priorBatchTypes.length
      ? `Last few batches used these types (try to vary): ${priorBatchTypes.join(", ")}`
      : "",
    window
      ? `Recent transcript (most recent last):\n${window}`
      : "Recent transcript: (no speech yet)",
    `Return JSON with exactly 3 items. Respond with JSON only.`,
  ].filter(Boolean);
  return parts.join("\n\n");
}

export async function POST(req: Request) {
  const key = req.headers.get("x-groq-key");
  if (!key) {
    return NextResponse.json({ error: "missing_api_key" }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    const json = await req.json();
    body = BodySchema.parse(json);
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_body", message: (e as Error).message },
      { status: 400 },
    );
  }

  const groq = new Groq({ apiKey: key });
  const started = performance.now();

  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      max_completion_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: body.prompt },
        { role: "user", content: buildUserMessage(body) },
      ],
    });

    const latencyMs = Math.round(performance.now() - started);
    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = parseSuggestionResponse(raw);
    console.log(
      `[suggest] ${MODEL} ${latencyMs}ms parsed=${parsed.ok ? "ok" : "FAIL"}${parsed.ok && parsed.repaired ? " repaired" : ""}`,
    );

    if (!parsed.ok) {
      // One retry: explicitly ask to fix the JSON
      const retry = await groq.chat.completions.create({
        model: MODEL,
        temperature: 0.1,
        max_completion_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: body.prompt },
          { role: "user", content: buildUserMessage(body) },
          { role: "assistant", content: raw },
          {
            role: "user",
            content:
              'Your previous response was not valid JSON matching {"items":[{type,preview,rationale}]}. Return valid JSON only, no prose.',
          },
        ],
      });
      const retryRaw = retry.choices[0]?.message?.content ?? "";
      const retryParsed = parseSuggestionResponse(retryRaw);
      if (!retryParsed.ok) {
        return NextResponse.json(
          {
            error: "invalid_json",
            rawFirst: raw.slice(0, 500),
            rawRetry: retryRaw.slice(0, 500),
          },
          { status: 502 },
        );
      }
      return NextResponse.json({
        items: retryParsed.value.items,
        repaired: true,
        model: MODEL,
        latencyMs: Math.round(performance.now() - started),
      });
    }

    return NextResponse.json({
      items: parsed.value.items,
      repaired: parsed.repaired,
      model: MODEL,
      latencyMs,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status ?? 500;
    const message =
      (err as { error?: { message?: string }; message?: string })?.error?.message ??
      (err as { message?: string })?.message ??
      "suggest_failed";
    const code =
      status === 401
        ? "bad_api_key"
        : status === 429
          ? "rate_limited"
          : status >= 500
            ? "groq_error"
            : "suggest_failed";
    return NextResponse.json({ error: code, message }, { status });
  }
}
