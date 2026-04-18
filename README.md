# TwinMind — Live Suggestions

A live meeting copilot. Listens to mic audio, transcribes it in ~25 s chunks, and surfaces 3 rolling context-aware suggestions you can act on. Clicking a suggestion streams a detailed, transcript-grounded answer in the chat column. No login, no persistence across reload.

Take-home assignment submission for TwinMind.

> **Live demo:** https://twinmind-flax.vercel.app
> **Repo:** https://github.com/asish-kun/Twin-mind-App

## Stack

- **Next.js 14** (App Router, React 18, TypeScript strict, `noUncheckedIndexedAccess`)
- **TailwindCSS 3** + **Radix UI** primitives, shadcn/ui-style components
- **Framer Motion** — animated borders, suggestion cards, transcript entry
- **Zustand** — session (in-memory) + settings (localStorage) stores
- **Groq SDK**
  - **Whisper Large V3** for transcription
  - **GPT-OSS 120B (`openai/gpt-oss-120b`)** for suggestions, summaries, and chat (streaming + JSON mode)
- **`react-markdown`** + **`remark-gfm`** for chat answer rendering
- **Zod** for request validation and model-output salvage

## Setup

```bash
npm install
npm run dev
# open http://localhost:3000
```

On first visit the Settings modal auto-opens. Paste your [Groq API key](https://console.groq.com/keys), click **Test** → **Save**. Click the mic. Done.

### Keyboard shortcuts

- `⌘/Ctrl+K` — open Settings
- `Space` — start / stop recording (when no input is focused)

## Architecture

```
src/
  app/
    api/
      transcribe/route.ts   # multipart audio → Groq Whisper Large V3
      suggest/route.ts      # JSON-mode GPT-OSS 120B with retry-on-bad-JSON
      summary/route.ts      # compact running summary
      chat/route.ts         # streaming GPT-OSS 120B (SSE-ish raw text)
    layout.tsx, page.tsx
  components/
    animated/AnimatedBorder.tsx   # conic-gradient border primitive
    panels/
      TranscriptPanel.tsx   # mic + live transcript
      SuggestionsPanel.tsx  # batches, type breakdown tooltip
      SuggestionCard.tsx    # per-type styled card
      ChatPanel.tsx         # streaming messages, autosize textarea, retry
    layout/{Header,ColumnHeader}.tsx
    ui/                     # Radix + Tailwind primitives
    SettingsDialog.tsx      # API key / Prompts / Windows tabs
  hooks/
    useLiveTranscription.ts # getUserMedia + chunk → /api/transcribe
    useSuggestionEngine.ts  # interval + manual reload + Jaccard dedupe
    useChat.ts              # sendChat / expandSuggestion / retry
    useKeyboardShortcuts.ts
  lib/
    recorder.ts             # LiveRecorder class
    transcribeClient.ts
    suggestClient.ts
    chatClient.ts           # ReadableStream → onDelta/onFirstToken
    context.ts              # renderTranscriptWindow, transcriptTail
    schema.ts               # Zod + JSON-salvage for model output
    suggestionMeta.ts       # type → {label, icon, tone}
    defaults.ts             # the prompts — this is what graders should read
    export.ts               # JSON + TXT download
  store/{sessionStore,settingsStore}.ts
  types/index.ts
scripts/eval.ts             # prompt eval harness (runs against ../eval/datasets)
```

`./eval/datasets/` holds 50 AMI scenario meetings + 25 ICSI meetings parsed to JSON for offline prompt iteration (no audio). See [./eval/datasets/README.md](./eval/datasets/README.md).

## Prompt strategy (the part graders care about)

Full text of all three prompts lives in [`src/lib/defaults.ts`](src/lib/defaults.ts) and is **editable at runtime** in the Settings modal. Changes take effect on the next batch / message — no restart.

### 1. Live suggestion prompt

**Goal:** 3 cards of genuine value, each tailored to the last ~60 s of conversation.

**Design choices and *why*:**

| Rule | Rationale |
|---|---|
| Structured output: `{items: [{type, preview, rationale}] × 3}` via Groq JSON mode | Model guesses drop to near zero. Client can render with confidence. |
| Strict enum for `type`: `question / talking_point / answer / fact_check / clarification` | Gives the UI a reason to assign icon + colour, and gives the model a checklist to vary against. |
| Type-steering rules (if question just asked → `answer`; statistic stated → `fact_check`; jargon used → `clarification`) | Biases the model to pick the *right* type given context rather than defaulting to generic "question" cards. |
| **`preview` must be something the user could literally say** (≤20 words) | Prevents the common "Ask about the budget" anti-pattern. `preview` should *be* the question, not a description of one. |
| "Anchor to immediate context, not the whole meeting" | Stops the model from drifting to generic meeting platitudes. |
| `rationale`: one sentence, ≤15 words, why it matters *now* | Lets the user trust a card without clicking — matches the spec's "preview alone should already deliver value". |
| Variety enforced: "do not return 3 of the same type unless context demands" | Avoids 3 question cards in a row, which is the default failure mode. |
| Also passed in: last 6 batch types as "try to vary" hint | Rolling-window memory so consecutive batches feel different. |

**Temperature:** 0.4 (low enough to follow the format, high enough to pick different types). **max_completion_tokens:** 700. **Window:** 180 s by default, configurable 30–600 s.

**JSON-salvage path:** if the first response fails `zod`, the route retries **once** with an explicit "fix the JSON" continuation before giving up with a 502. In practice this catches the occasional stray line model adds before the `{`.

### 2. Detailed answer prompt (on card click)

**Goal:** expand a clicked suggestion into a short, grounded answer.

**Design choices:**
- **Larger context window** (default 600 s, configurable up to 1800 s) so the model can cite what was actually said earlier, not just the slice that produced the card.
- **Format spec:** 2–4 sentence direct answer → up to 4 supporting bullets → optional trailing `Say: …` line giving a natural phrasing.
- **No preamble / no meta** ("Great question!", "As an AI...") — explicitly banned in the prompt.
- **Honesty clause:** if the transcript doesn't support an answer, say so in one line and give a best general-knowledge take.
- Temperature 0.5, max_completion_tokens 800.

### 3. Chat prompt (user types freely)

**Goal:** short useful answer anchored to transcript when relevant.

**Design choices:**
- **Terse by default** — 2–5 sentences typical; bullets only when they help.
- **No filler openers.** No echoing the user's question back.
- **Empty-transcript handling:** the prompt explicitly instructs the model to answer from general knowledge and append `(no transcript context yet)` so the user knows whether the answer was grounded.

### Running summary (supporting prompt)

Lives in [`src/app/api/summary/route.ts`](src/app/api/summary/route.ts). Called every 3rd successful batch (non-blocking) to keep a ≤2-sentence "what this meeting is about" string that's fed to subsequent suggestion + chat calls. Lets the model keep coherent context in a long meeting without blowing the token budget on the full transcript.

### Context sizing

The transcript window is rendered as:

```
[mm:ss] line text
[mm:ss] line text
```

Then capped at ~12 000 chars (≈3000 tokens) client-side as a safety net, and again at 16 000 chars server-side. When it overflows we keep the **most recent** lines — the running summary carries the older context forward.

## The suggestion engine (hook behaviour)

- **Auto-ticks** every `suggestionIntervalSec` (default 30 s) while recording.
- **Skips** if the transcript has grown by less than 80 chars since the last batch (prevents redundant requests during silence).
- **Jaccard dedupe**: if the new batch's previews average >90% token overlap with the previous batch, the batch is silently dropped. Keeps the panel honest.
- **Reload button** bypasses the "skip if empty" check so the user can force a refresh even when no new speech arrived.
- **Abort-on-new**: if you hit Reload mid-request, the in-flight request is cancelled so stale data can't race the new one.

## Chat streaming

`/api/chat` returns a `ReadableStream<Uint8Array>` of raw text deltas. The client reads via `Response.body.getReader()` and appends deltas to the streaming assistant message in the session store. Inline error sentinel (`[[TWINMIND_ERROR:<code>]]`) is stripped from the stream; if a stream errors mid-response, the user sees a **Retry** button under the message that re-sends the last user message (with appropriate mode: `detailed` if it came from a suggestion, `chat` otherwise).

**First-token latency** is measured client-side (`performance.now()` at send → first non-empty read) and surfaced in the message meta row; also logged server-side per request.

## Export

Header → **Export** → JSON or Plain text. Files contain the full session with absolute ISO timestamps and session-relative `[mm:ss]` markers. Intended for the interview to diff runs side-by-side.

Schema (JSON):
```ts
{
  session_id, started_at, started_at_iso, ended_at, ended_at_iso,
  transcript: [{id, t_start, t_end, text}],
  suggestion_batches: [{id, t, items: [{type, preview, rationale}], meta: {...}}],
  chat: [{id, t, role, content, sourceSuggestionId?, firstTokenMs?}]
}
```

## Prompt evaluation harness

A Node script that replays hand-annotated meeting transcripts through the suggestion pipeline (bypasses Next.js for speed and reproducibility).

```bash
export GROQ_API_KEY=gsk_...
npm run eval -- --source ami --limit 5          # 5 AMI meetings
npm run eval -- --meetings ES2002a,Bmr001       # specific IDs
npm run eval -- --interval 30 --window 180 --points 8
```

Outputs land in `./eval/runs/{YYYY-MM-DD-HH-mm}/`:
- `{meeting_id}.json` — per-timepoint: window sent, latency, parsed items, raw-on-failure.
- `_summary.json` — parse rate, avg/p95 latency, distribution across the 5 types.

Use this to catch regressions when editing the prompt: run against 5 meetings, eyeball the last few batches per meeting, check `_summary.json` for type skew.

## Latency

Target numbers (measure yours on the deployed URL — actuals depend on region / Groq load):

| Hop | Target | Notes |
|---|---|---|
| Mic chunk → transcript line visible | < 1.5 s after chunk end | Groq Whisper typically 200–500 ms |
| Reload → first suggestion card rendered | < 2 s | p50 from dev: ~1.2 s; p95: ~2.3 s |
| Chat send → first streamed token | < 800 ms | Groq GPT-OSS 120B first-token is very fast |

Server routes log per-request latency to the Vercel function logs (`[suggest] 1124ms`, `[chat/detailed] first=612ms total=3840ms`). Client measurements are shown inline in the UI (suggestion card: Groq call ms in batch header; chat: first-token ms on the assistant message).

## Tradeoffs (what's NOT built, and why)

- **Speaker diarization.** Whisper-only returns unlabelled text. Adding PyAnnote on-device is out of scope for this exercise.
- **Cross-session memory.** Spec says "no login, no persistence when reloading". Settings persist (key + prompts + windows); session data does not.
- **Mobile.** Layout targets desktop 1024+. Responsive breakpoints exist (stacked at <1024) but iOS Safari `MediaRecorder` isn't exercised.
- **Shareable session link.** Export covers this use case without infrastructure.
- **Continuous WebSocket transcription.** Groq Whisper is request/response, so we chunk. A 25 s cadence is the configured default; 10 s is the floor. Shorter chunks = more liveness but more token cost and more edge artefacts.
- **Server-side API key storage.** Each user supplies their own — no shared key to leak, and zero ops burden.

## Known issues / edge cases

- Extremely quiet chunks (<1 s of speech) sometimes produce empty Whisper responses; UI shows "(silence or transcription error)" on that line and keeps going.
- On `prefers-reduced-motion`, border animations are frozen (good); the transcript line-in motion still uses a short fade (acceptable per spec).
- If you flip the `chunkSeconds` slider while recording, the change applies to the *next* session — current MediaRecorder state is immutable.

## Credits

- Built against the TwinMind reference prototype.
- Transcript evaluation corpus: AMI + ICSI (CC BY 4.0) — parsed in `./eval/datasets/`.
- Radix UI primitives; shadcn-style component patterns.
