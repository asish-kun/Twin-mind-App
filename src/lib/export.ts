import type { SessionSnapshot } from "@/types";
import { useSessionStore } from "@/store/sessionStore";
import { formatMMSS } from "@/lib/utils";

function toIso(ms: number | null): string | null {
  return ms == null ? null : new Date(ms).toISOString();
}

export function buildSnapshot(): SessionSnapshot {
  const s = useSessionStore.getState();
  const started = s.startedAt ?? Date.now();
  const ended = s.endedAt;
  return {
    session_id: s.sessionId,
    started_at: started,
    started_at_iso: new Date(started).toISOString(),
    ended_at: ended,
    ended_at_iso: toIso(ended),
    transcript: s.transcript.filter((l) => !l.pending && l.text),
    suggestion_batches: s.batches,
    chat: s.chat.filter((m) => !m.streaming),
  };
}

export function snapshotToJson(snap: SessionSnapshot): string {
  return JSON.stringify(snap, null, 2);
}

export function snapshotToText(snap: SessionSnapshot): string {
  const lines: string[] = [];
  lines.push(`# TwinMind Session — ${snap.session_id}`);
  lines.push(`Started: ${snap.started_at_iso}`);
  if (snap.ended_at_iso) lines.push(`Ended:   ${snap.ended_at_iso}`);
  lines.push("");

  lines.push("## Transcript");
  if (snap.transcript.length === 0) {
    lines.push("(no transcript)");
  } else {
    for (const l of snap.transcript) {
      lines.push(`[${formatMMSS(l.t_end)}] ${l.text}`);
    }
  }
  lines.push("");

  lines.push("## Suggestion batches");
  if (snap.suggestion_batches.length === 0) {
    lines.push("(no batches)");
  } else {
    // Render oldest first for readability (store holds newest-first)
    const chronological = [...snap.suggestion_batches].sort((a, b) => a.t - b.t);
    for (const b of chronological) {
      lines.push(`--- batch @ +${formatMMSS(b.t)}${b.meta ? `  (${b.meta.latencyMs}ms)` : ""} ---`);
      for (const it of b.items) {
        lines.push(`  [${it.type}] ${it.preview}`);
        if (it.rationale) lines.push(`      why: ${it.rationale}`);
      }
      lines.push("");
    }
  }

  lines.push("## Chat");
  if (snap.chat.length === 0) {
    lines.push("(empty)");
  } else {
    for (const m of snap.chat) {
      const who = m.role === "user" ? "User" : "TwinMind";
      lines.push(`### ${who} @ +${formatMMSS(m.t)}`);
      lines.push(m.content);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function exportJson(): void {
  const snap = buildSnapshot();
  const blob = new Blob([snapshotToJson(snap)], {
    type: "application/json;charset=utf-8",
  });
  download(blob, `twinmind-${timestamp()}-${snap.session_id}.json`);
}

export function exportText(): void {
  const snap = buildSnapshot();
  const blob = new Blob([snapshotToText(snap)], {
    type: "text/plain;charset=utf-8",
  });
  download(blob, `twinmind-${timestamp()}-${snap.session_id}.txt`);
}

export function sessionIsEmpty(): boolean {
  const s = useSessionStore.getState();
  return (
    s.transcript.every((l) => !l.text) &&
    s.batches.length === 0 &&
    s.chat.length === 0
  );
}
