import Groq from "groq-sdk";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "openai/gpt-oss-120b";

const PriorMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
});

const BodySchema = z.object({
  mode: z.enum(["detailed", "chat"]),
  message: z.string().min(1).max(4000),
  systemPrompt: z.string().min(10).max(8000),
  transcriptWindow: z.string().max(16_000).default(""),
  runningSummary: z.string().max(4000).default(""),
  priorChat: z.array(PriorMessageSchema).max(12).default([]),
  sessionSeconds: z.number().finite().nonnegative().default(0),
  /** For "detailed" mode: the clicked suggestion preview (already embedded in message, but useful as trace). */
  suggestionType: z.string().optional(),
});

function renderHeader(input: z.infer<typeof BodySchema>) {
  const mmss = `${Math.floor(input.sessionSeconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(input.sessionSeconds % 60)
    .toString()
    .padStart(2, "0")}`;
  const pieces = [`Meeting elapsed: ${mmss}`];
  if (input.runningSummary) pieces.push(`Summary so far:\n${input.runningSummary}`);
  pieces.push(
    input.transcriptWindow
      ? `Transcript window:\n${input.transcriptWindow}`
      : "Transcript window: (empty)",
  );
  return pieces.join("\n\n");
}

export async function POST(req: Request) {
  const key = req.headers.get("x-groq-key");
  if (!key) {
    return new Response(JSON.stringify({ error: "missing_api_key" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "invalid_body", message: (e as Error).message }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const groq = new Groq({ apiKey: key });
  const encoder = new TextEncoder();

  const sys = body.systemPrompt;
  const header = renderHeader(body);

  // Chat history: interleave prior user/assistant exchanges (already trimmed by client)
  const priorMessages = body.priorChat.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const messages = [
    { role: "system" as const, content: sys },
    { role: "system" as const, content: header },
    ...priorMessages,
    { role: "user" as const, content: body.message },
  ];

  const maxTokens = body.mode === "detailed" ? 800 : 500;
  const temperature = body.mode === "detailed" ? 0.5 : 0.4;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const abortController = new AbortController();
      req.signal.addEventListener("abort", () => abortController.abort());

      const started = performance.now();
      let firstTokenAt = 0;
      try {
        const iter = await groq.chat.completions.create(
          {
            model: MODEL,
            temperature,
            max_completion_tokens: maxTokens,
            stream: true,
            messages,
          },
          { signal: abortController.signal },
        );

        for await (const chunk of iter) {
          if (abortController.signal.aborted) break;
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) {
            if (firstTokenAt === 0) firstTokenAt = performance.now();
            controller.enqueue(encoder.encode(delta));
          }
        }
        const totalMs = Math.round(performance.now() - started);
        const firstMs = firstTokenAt ? Math.round(firstTokenAt - started) : -1;
        console.log(
          `[chat/${body.mode}] first=${firstMs}ms total=${totalMs}ms`,
        );
        controller.close();
      } catch (err: unknown) {
        // Encode a sentinel error tail the client can surface.
        const status = (err as { status?: number })?.status;
        const code =
          status === 401
            ? "bad_api_key"
            : status === 429
              ? "rate_limited"
              : (err as { name?: string })?.name === "AbortError"
                ? "aborted"
                : "chat_failed";
        try {
          controller.enqueue(
            encoder.encode(`\n\n[[TWINMIND_ERROR:${code}]]`),
          );
        } catch {
          // ignore
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
