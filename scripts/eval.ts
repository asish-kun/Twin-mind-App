#!/usr/bin/env tsx
/**
 * Prompt evaluation harness.
 *
 * Reads hand-annotated meeting transcripts from ../eval/datasets/processed/,
 * slides a window through the transcript at the configured cadence, calls the
 * Groq SDK directly (bypasses Next.js), and writes per-meeting result JSON
 * plus a summary across the run.
 *
 * Usage:
 *   GROQ_API_KEY=... npm run eval -- --meetings ES2002a,Bmr001 --limit 10
 *   GROQ_API_KEY=... npm run eval -- --source ami --limit 5
 *   GROQ_API_KEY=... npm run eval -- --interval 30 --window 180
 */

import fs from "node:fs";
import path from "node:path";
import Groq from "groq-sdk";
import { parseSuggestionResponse } from "../src/lib/schema";
import { LIVE_SUGGESTION_PROMPT } from "../src/lib/defaults";

const DATASETS_ROOT = path.resolve(__dirname, "../../eval/datasets/processed");
const RUNS_ROOT = path.resolve(__dirname, "../../eval/runs");
const MODEL = "openai/gpt-oss-120b";

interface Turn {
  t_start: number;
  t_end: number;
  speaker: string;
  text: string;
}

interface Meeting {
  id: string;
  source: "ami" | "icsi";
  duration_sec: number;
  speakers: string[];
  turns: Turn[];
}

interface Args {
  meetings?: string[];
  source?: "ami" | "icsi";
  limit: number;
  interval: number;
  windowSec: number;
  maxTimepoints: number;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    limit: 5,
    interval: 30,
    windowSec: 180,
    maxTimepoints: 8,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const val = argv[i + 1];
    if (flag === "--meetings" && val) {
      a.meetings = val.split(",").map((s) => s.trim()).filter(Boolean);
      i++;
    } else if (flag === "--source" && (val === "ami" || val === "icsi")) {
      a.source = val;
      i++;
    } else if (flag === "--limit" && val) {
      a.limit = Math.max(1, parseInt(val, 10));
      i++;
    } else if (flag === "--interval" && val) {
      a.interval = Math.max(5, parseInt(val, 10));
      i++;
    } else if (flag === "--window" && val) {
      a.windowSec = Math.max(30, parseInt(val, 10));
      i++;
    } else if (flag === "--points" && val) {
      a.maxTimepoints = Math.max(1, parseInt(val, 10));
      i++;
    }
  }
  return a;
}

function loadMeeting(id: string): Meeting {
  for (const src of ["ami", "icsi"] as const) {
    const p = path.join(DATASETS_ROOT, src, `${id}.json`);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8")) as Meeting;
    }
  }
  throw new Error(`Meeting not found: ${id}`);
}

function listMeetings(source?: "ami" | "icsi"): string[] {
  const sources = source ? [source] : (["ami", "icsi"] as const);
  const ids: string[] = [];
  for (const s of sources) {
    const dir = path.join(DATASETS_ROOT, s);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".json")) ids.push(f.replace(/\.json$/, ""));
    }
  }
  return ids.sort();
}

function formatMMSS(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function renderWindow(turns: Turn[], endSec: number, windowSec: number): string {
  const lo = Math.max(0, endSec - windowSec);
  const inRange = turns.filter((t) => t.t_end >= lo && t.t_end <= endSec);
  return inRange
    .map((t) => `[${formatMMSS(t.t_end)}] ${t.speaker}: ${t.text}`)
    .join("\n");
}

async function callSuggest(
  groq: Groq,
  prompt: string,
  window: string,
  sessionSeconds: number,
  priorTypes: string[],
) {
  const mmss = formatMMSS(sessionSeconds);
  const userMsg = [
    `Meeting elapsed: ${mmss}`,
    priorTypes.length
      ? `Last few batches used these types (try to vary): ${priorTypes.join(", ")}`
      : "",
    window
      ? `Recent transcript (most recent last):\n${window}`
      : "Recent transcript: (no speech yet)",
    `Return JSON with exactly 3 items. Respond with JSON only.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const started = performance.now();
  const completion = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.4,
    max_completion_tokens: 700,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: userMsg },
    ],
  });
  const latencyMs = Math.round(performance.now() - started);
  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = parseSuggestionResponse(raw);
  return { raw, parsed, latencyMs };
}

async function evalMeeting(
  meeting: Meeting,
  groq: Groq,
  args: Args,
  prompt: string,
): Promise<{
  id: string;
  source: string;
  duration_sec: number;
  timepoints: Array<{
    session_sec: number;
    window_chars: number;
    window_preview: string;
    latency_ms: number;
    parsed_ok: boolean;
    repaired: boolean;
    items: Array<{ type: string; preview: string; rationale?: string }>;
    raw_if_failed?: string;
  }>;
}> {
  console.log(`\n▶ ${meeting.id}  (${meeting.source}, ${Math.round(meeting.duration_sec)}s, ${meeting.turns.length} turns)`);

  const timepoints: Array<{
    session_sec: number;
    window_chars: number;
    window_preview: string;
    latency_ms: number;
    parsed_ok: boolean;
    repaired: boolean;
    items: Array<{ type: string; preview: string; rationale?: string }>;
    raw_if_failed?: string;
  }> = [];

  const priorTypes: string[] = [];
  const startAt = Math.min(args.interval, meeting.duration_sec);
  const step = args.interval;
  const maxTp = args.maxTimepoints;

  let count = 0;
  for (let t = startAt; t <= meeting.duration_sec && count < maxTp; t += step) {
    const window = renderWindow(meeting.turns, t, args.windowSec);
    if (!window.trim()) continue;
    const { raw, parsed, latencyMs } = await callSuggest(
      groq,
      prompt,
      window,
      t,
      priorTypes.slice(-6),
    );
    const ok = parsed.ok;
    const tp = {
      session_sec: t,
      window_chars: window.length,
      window_preview: window.slice(-400),
      latency_ms: latencyMs,
      parsed_ok: ok,
      repaired: ok ? parsed.repaired : false,
      items: ok ? parsed.value.items : [],
      raw_if_failed: ok ? undefined : raw.slice(0, 600),
    };
    timepoints.push(tp);
    if (ok) priorTypes.push(...parsed.value.items.map((i) => i.type));
    console.log(
      `  +${formatMMSS(t)}  ${latencyMs}ms  ${ok ? parsed.value.items.map((i) => i.type[0]).join("") : "FAIL"}`,
    );
    count++;
  }

  return {
    id: meeting.id,
    source: meeting.source,
    duration_sec: meeting.duration_sec,
    timepoints,
  };
}

async function main() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error(
      "GROQ_API_KEY env var required. Run:\n  GROQ_API_KEY=gsk_... npm run eval -- ...",
    );
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const groq = new Groq({ apiKey });

  let ids: string[];
  if (args.meetings && args.meetings.length) {
    ids = args.meetings;
  } else {
    ids = listMeetings(args.source).slice(0, args.limit);
  }

  if (ids.length === 0) {
    console.error("No meetings found. Did you run the dataset pipeline?");
    process.exit(1);
  }

  const runTs = new Date()
    .toISOString()
    .replace(/[:T]/g, "-")
    .slice(0, 16);
  const outDir = path.join(RUNS_ROOT, runTs);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\nEval run → ${outDir}`);
  console.log(`Meetings: ${ids.join(", ")}`);
  console.log(
    `interval=${args.interval}s  window=${args.windowSec}s  timepoints/meeting=${args.maxTimepoints}\n`,
  );

  const allResults: Awaited<ReturnType<typeof evalMeeting>>[] = [];

  for (const id of ids) {
    let m: Meeting;
    try {
      m = loadMeeting(id);
    } catch (e) {
      console.error(`  skip ${id}: ${(e as Error).message}`);
      continue;
    }
    try {
      const result = await evalMeeting(m, groq, args, LIVE_SUGGESTION_PROMPT);
      fs.writeFileSync(
        path.join(outDir, `${id}.json`),
        JSON.stringify(result, null, 2),
      );
      allResults.push(result);
    } catch (e) {
      console.error(`  ${id} failed: ${(e as Error).message}`);
    }
  }

  // Summary across meetings
  const allTps = allResults.flatMap((r) => r.timepoints);
  const okTps = allTps.filter((t) => t.parsed_ok);
  const typeCounts: Record<string, number> = {};
  for (const t of okTps) {
    for (const it of t.items) {
      typeCounts[it.type] = (typeCounts[it.type] ?? 0) + 1;
    }
  }
  const avgLatency =
    allTps.length > 0
      ? Math.round(allTps.reduce((s, t) => s + t.latency_ms, 0) / allTps.length)
      : 0;
  const p95Latency = (() => {
    if (allTps.length === 0) return 0;
    const sorted = [...allTps].map((t) => t.latency_ms).sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
  })();

  const summary = {
    run_timestamp: runTs,
    args,
    meetings_evaluated: allResults.length,
    timepoints: allTps.length,
    parsed_ok: okTps.length,
    repaired_on_retry: okTps.filter((t) => t.repaired).length,
    parse_rate: allTps.length ? okTps.length / allTps.length : 0,
    avg_latency_ms: avgLatency,
    p95_latency_ms: p95Latency,
    type_distribution: typeCounts,
  };

  fs.writeFileSync(
    path.join(outDir, "_summary.json"),
    JSON.stringify(summary, null, 2),
  );

  console.log("\n--- summary ---");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
