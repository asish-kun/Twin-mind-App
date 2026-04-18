import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "openai/gpt-oss-120b";

const BodySchema = z.object({
  window: z.string().max(16_000),
  previousSummary: z.string().max(4_000).default(""),
});

const SYSTEM = `You maintain a terse running summary of an in-progress meeting.
Given the previous summary and the most recent transcript window, return an updated summary.

Rules:
- 1 to 2 sentences, max 50 words total.
- Capture WHAT the meeting is about + the most recent decision/question/direction.
- Do NOT describe the participants or meta-observations ("they discussed..."). State the substance.
- If nothing meaningful has been said, return the previous summary unchanged.
- Return plain text only. No quotes, no preamble.`;

export async function POST(req: Request) {
  const key = req.headers.get("x-groq-key");
  if (!key) {
    return NextResponse.json({ error: "missing_api_key" }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
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
      temperature: 0.2,
      max_completion_tokens: 120,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            body.previousSummary
              ? `Previous summary:\n${body.previousSummary}`
              : "Previous summary: (none yet)",
            "",
            body.window
              ? `Most recent transcript:\n${body.window}`
              : "Most recent transcript: (nothing meaningful)",
          ].join("\n"),
        },
      ],
    });
    const latencyMs = Math.round(performance.now() - started);
    const text = (completion.choices[0]?.message?.content ?? "").trim();
    return NextResponse.json({ summary: text, model: MODEL, latencyMs });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status ?? 500;
    const message =
      (err as { error?: { message?: string }; message?: string })?.error?.message ??
      (err as { message?: string })?.message ??
      "summary_failed";
    const code =
      status === 401
        ? "bad_api_key"
        : status === 429
          ? "rate_limited"
          : status >= 500
            ? "groq_error"
            : "summary_failed";
    return NextResponse.json({ error: code, message }, { status });
  }
}
