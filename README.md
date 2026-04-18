# TwinMind — Live Suggestions

A live meeting copilot that transcribes mic audio in near-real-time and (in Phase 2) surfaces 3 rolling, context-aware suggestions you can act on. Click a suggestion for a detailed, transcript-grounded answer in the chat column. No login, no persistence.

This is the submission for TwinMind's take-home assignment.

## Stack

- **Next.js 14** (App Router, TypeScript strict)
- **TailwindCSS 3** + **Radix UI** primitives styled in the shadcn/ui pattern
- **Framer Motion** — animated borders, transcript line entry, pulse ring
- **Zustand** — session store (in-memory) + settings store (localStorage)
- **Groq SDK** — Whisper Large V3 for STT; GPT-OSS 120B for suggestions & chat (Phase 2)
- **Deployed on Vercel**

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. On first visit the Settings modal opens — paste your [Groq API key](https://console.groq.com/keys) and click **Test** → **Save**. Then hit the mic.

## How it works (Phase 1)

| Column | What it does |
|---|---|
| **Mic & Transcript** | `MediaRecorder` emits an audio chunk every N seconds (default 25 s, configurable 10–30 s). Each chunk is POSTed to `/api/transcribe` which calls Groq Whisper Large V3. Lines append with timestamps and the list auto-scrolls (sticky unless the user scrolls up). |
| **Live Suggestions** | Placeholder; Phase 2 will generate 3-card batches every ~30 s. |
| **Chat** | Placeholder; Phase 2 wires streaming answers. |

### Prompt strategy (summary — full prompts in `src/lib/defaults.ts`)

- **Live suggestion prompt** forces a 3-item JSON array with an explicit type enum (`question / talking_point / answer / fact_check / clarification`), requires each `preview` to be a line the user could literally say (max 20 words) rather than a meta-description, and biases type selection to the immediate context (someone just asked a question → first item must be an `answer`; a statistic was stated → include a `fact_check`; jargon was used → `clarification`). Variety across types is a hard rule.
- **Detailed-answer prompt** expands a clicked suggestion: 2–4 sentence answer, up to 4 tight bullets, optional `Say: …` phrasing. Grounded in a larger transcript window (default 600 s).
- **Chat prompt** is terse, anchor-to-transcript, no filler openers.

### API key handling

The key is **never** hardcoded and never touches server env. It lives in the user's `localStorage`, and every request attaches it via the `x-groq-key` header. The API route instantiates the Groq client per request.

## Project layout

```
src/
  app/
    api/transcribe/route.ts   # multipart POST → Groq whisper-large-v3
    layout.tsx, page.tsx
  components/
    layout/                   # Header, ColumnHeader
    panels/                   # TranscriptPanel, SuggestionsPanel, ChatPanel
    animated/AnimatedBorder.tsx
    ui/                       # shadcn-style Radix primitives
    SettingsDialog.tsx
  hooks/useLiveTranscription.ts
  lib/
    recorder.ts               # LiveRecorder class — getUserMedia + MediaRecorder
    transcribeClient.ts       # client-side POST helper
    defaults.ts               # prompts + default windows
    utils.ts                  # cn, formatMMSS, maskKey
  store/
    sessionStore.ts           # transcript, batches, chat (in-memory)
    settingsStore.ts          # persisted via zustand/middleware
  types/index.ts
```

## Tradeoffs

- **No server-side key.** Pros: zero secrets risk, lets each reviewer run with their own quota. Cons: users can read the key from devtools — acceptable because it's their own key.
- **~25 s chunk cadence instead of continuous streaming.** Groq Whisper is segmented (no WebSocket streaming API); a shorter chunk gives more "liveness" at the cost of more requests. 25 s is a compromise between latency and Whisper's preference for 30 s of context.
- **In-memory session state only.** Session clears on reload; that matches the spec ("no login, no data persistence") and keeps the code simple.

## Roadmap

Phase 2 (next): `/api/suggest` + `/api/chat` (streaming), suggestion card animation, click-to-expand, JSON/TXT export button.

## Credits

Built against the TwinMind reference prototype. Meeting transcripts used for prompt evaluation come from the AMI and ICSI corpora (CC BY 4.0); parsed dataset lives in the sibling `eval/datasets/` directory.
