import fs from "node:fs";
import path from "node:path";

export type Turn = {
  t_start: number;
  t_end: number;
  speaker: string;
  text: string;
};

export type Meeting = {
  id: string;
  source: "ami" | "icsi";
  duration_sec: number;
  speakers: string[];
  turns: Turn[];
};

const ROOT = path.resolve(__dirname, "processed");

export function listMeetings(source?: "ami" | "icsi"): string[] {
  const sources: ("ami" | "icsi")[] = source ? [source] : ["ami", "icsi"];
  const ids: string[] = [];
  for (const s of sources) {
    const dir = path.join(ROOT, s);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".json")) ids.push(f.replace(/\.json$/, ""));
    }
  }
  return ids.sort();
}

export function loadMeeting(id: string): Meeting {
  for (const s of ["ami", "icsi"] as const) {
    const p = path.join(ROOT, s, `${id}.json`);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8")) as Meeting;
    }
  }
  throw new Error(`Meeting not found: ${id}`);
}

/** Returns turns that ended within [endSec - windowSec, endSec]. */
export function transcriptWindow(
  meeting: Meeting,
  endSec: number,
  windowSec: number,
): Turn[] {
  const lo = Math.max(0, endSec - windowSec);
  return meeting.turns.filter((t) => t.t_end >= lo && t.t_end <= endSec);
}

/** Render a window as prompt-ready text, one turn per line. */
export function renderWindow(turns: Turn[]): string {
  return turns
    .map((t) => `[${formatMMSS(t.t_start)}] ${t.speaker}: ${t.text}`)
    .join("\n");
}

function formatMMSS(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
