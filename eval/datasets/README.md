# Meeting transcript datasets

Hand-annotated transcripts from two standard meeting corpora, parsed to a single JSON schema for prompt evaluation. **No audio** — just words + timestamps + speakers.

## What's in here

- `processed/ami/*.json` — 50 AMI scenario meetings (IDs matching `^(ES|IS|TS)\d{4}[a-d]$`)
- `processed/icsi/*.json` — 25 ICSI natural-research meetings (IDs like `Bed002`, `Bmr001`, `Bro018`)
- `ami_meetings.json`, `icsi_meetings.json` — picked-meeting manifests
- `load.ts` — TypeScript loader
- `parse_nxt.py` — the NXT-XML → JSON parser

Total: **75 meetings, ~100k turns**.

## Schema

```ts
type Turn = { t_start: number; t_end: number; speaker: string; text: string };

type Meeting = {
  id: string;                    // e.g. "ES2002a" or "Bmr001"
  source: "ami" | "icsi";
  duration_sec: number;
  speakers: string[];            // ["A", "B", "C", "D"]
  turns: Turn[];                 // merged (same-speaker, gap ≤ 1.5s)
};
```

## Usage

```ts
import { loadMeeting, transcriptWindow, renderWindow } from "./load";

const m = loadMeeting("ES2002a");
const lastThreeMin = transcriptWindow(m, 600, 180);   // t=600s, window=180s
console.log(renderWindow(lastThreeMin));
```

## Sources

- AMI manual annotations: <https://groups.inf.ed.ac.uk/ami/AMICorpusAnnotations/ami_public_manual_1.6.2.zip> (CC BY 4.0)
- ICSI + NXT annotations: <https://groups.inf.ed.ac.uk/ami/ICSICorpusAnnotations/ICSI_plus_NXT.zip> (CC BY 4.0)

## Regenerating from source

```bash
mkdir -p raw && cd raw
curl -L -O https://groups.inf.ed.ac.uk/ami/AMICorpusAnnotations/ami_public_manual_1.6.2.zip
curl -L -O https://groups.inf.ed.ac.uk/ami/ICSICorpusAnnotations/ICSI_plus_NXT.zip
unzip -q ami_public_manual_1.6.2.zip -d ami
unzip -q ICSI_plus_NXT.zip -d icsi
cd ..
python3 parse_nxt.py ami  raw/ami/words                    processed/ami  ami_meetings.json  50
python3 parse_nxt.py icsi raw/icsi/ICSIplus/Words          processed/icsi icsi_meetings.json 25
rm -rf raw
```

## Parser notes

- Reads NXT word files (`<MEETING>.<SPEAKER>.words.xml`).
- Skips non-speech: `vocalsound`, `nonvocalsound`, `disfmarker`, `pause`, `gap`, `comment`.
- Merges consecutive same-speaker words into a turn; a gap > 1.5 s or a speaker change starts a new turn.
- Punctuation normalization is light (`" ."` → `"."`, etc.); AMI tokens come with spaces around punctuation.
