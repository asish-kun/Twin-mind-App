#!/usr/bin/env python3
"""Parse AMI / ICSI NXT word-level XML into chronological turn JSON.

Usage:
    python3 parse_nxt.py ami  <words_dir> <out_dir> <meetings_json> [limit]
    python3 parse_nxt.py icsi <words_dir> <out_dir> <meetings_json> [limit]

Input per-speaker word files: <MEETING_ID>.<SPK>.words.xml
Output: <out_dir>/<MEETING_ID>.json and <meetings_json> (list of picked IDs).
"""
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict

NS = {"nite": "http://nite.sourceforge.net/"}
SKIP_TAGS = {"vocalsound", "nonvocalsound", "disfmarker", "pause", "gap", "comment"}
TURN_GAP_SEC = 1.5

# AMI scenario meeting prefixes (ES, IS, TS — scenario-based; excludes EN = "other")
AMI_SCENARIO_RE = re.compile(r"^(ES|IS|TS)\d{4}[a-d]$")


def parse_words_file(path):
    """Return list of (start, end, text) tuples, skipping non-speech."""
    try:
        tree = ET.parse(path)
    except ET.ParseError:
        return []
    root = tree.getroot()
    out = []
    for el in root.iter():
        tag = el.tag.split("}")[-1]
        if tag in SKIP_TAGS:
            continue
        if tag != "w":
            continue
        start = el.attrib.get("starttime")
        end = el.attrib.get("endtime")
        text = (el.text or "").strip()
        if not start or not end or not text:
            continue
        try:
            out.append((float(start), float(end), text))
        except ValueError:
            continue
    return out


def collapse_to_turns(per_speaker):
    """per_speaker: dict[speaker] -> [(start,end,text)]. Returns merged turn list."""
    merged = []
    for spk, words in per_speaker.items():
        for (s, e, t) in words:
            merged.append((s, e, spk, t))
    merged.sort(key=lambda x: x[0])

    turns = []
    cur = None
    for s, e, spk, text in merged:
        if cur is None:
            cur = {"t_start": s, "t_end": e, "speaker": spk, "text": text}
            continue
        same_speaker = cur["speaker"] == spk
        gap = s - cur["t_end"]
        if same_speaker and gap <= TURN_GAP_SEC:
            cur["t_end"] = e
            # Simple whitespace join; punctuation stays attached in AMI files.
            cur["text"] = (cur["text"] + " " + text).replace(" .", ".").replace(" ,", ",").replace(" ?", "?").replace(" !", "!").replace(" '", "'")
        else:
            turns.append(cur)
            cur = {"t_start": s, "t_end": e, "speaker": spk, "text": text}
    if cur:
        turns.append(cur)
    # Round times
    for t in turns:
        t["t_start"] = round(t["t_start"], 2)
        t["t_end"] = round(t["t_end"], 2)
    return turns


def group_by_meeting(words_dir, meeting_filter):
    """Return dict[meeting_id] -> dict[speaker] -> path."""
    groups = defaultdict(dict)
    for name in os.listdir(words_dir):
        if not name.endswith(".words.xml"):
            continue
        parts = name[: -len(".words.xml")].split(".")
        if len(parts) != 2:
            continue
        meeting_id, spk = parts
        if not meeting_filter(meeting_id):
            continue
        groups[meeting_id][spk] = os.path.join(words_dir, name)
    return groups


def main():
    if len(sys.argv) < 5:
        print(__doc__)
        sys.exit(1)
    source = sys.argv[1]
    words_dir = sys.argv[2]
    out_dir = sys.argv[3]
    meetings_json = sys.argv[4]
    limit = int(sys.argv[5]) if len(sys.argv) > 5 else None

    if source == "ami":
        meeting_filter = lambda mid: bool(AMI_SCENARIO_RE.match(mid))
    elif source == "icsi":
        meeting_filter = lambda mid: mid.startswith(("B", "b"))
    else:
        print(f"Unknown source: {source}")
        sys.exit(1)

    os.makedirs(out_dir, exist_ok=True)

    groups = group_by_meeting(words_dir, meeting_filter)
    # Only keep meetings with at least 2 speakers (real multi-party)
    viable = {mid: spks for mid, spks in groups.items() if len(spks) >= 2}
    meeting_ids = sorted(viable.keys())
    if limit:
        meeting_ids = meeting_ids[:limit]

    written = []
    for mid in meeting_ids:
        per_speaker = {}
        for spk, path in viable[mid].items():
            words = parse_words_file(path)
            if words:
                per_speaker[spk] = words
        if len(per_speaker) < 2:
            continue
        turns = collapse_to_turns(per_speaker)
        if not turns:
            continue
        duration = max(t["t_end"] for t in turns)
        doc = {
            "id": mid,
            "source": source,
            "duration_sec": round(duration, 2),
            "speakers": sorted(per_speaker.keys()),
            "turns": turns,
        }
        with open(os.path.join(out_dir, f"{mid}.json"), "w") as f:
            json.dump(doc, f, separators=(",", ":"))
        written.append({"id": mid, "duration_sec": doc["duration_sec"], "turns": len(turns), "speakers": len(per_speaker)})

    with open(meetings_json, "w") as f:
        json.dump(written, f, indent=2)

    total_turns = sum(m["turns"] for m in written)
    print(f"[{source}] wrote {len(written)} meetings, {total_turns} turns total → {out_dir}")


if __name__ == "__main__":
    main()
