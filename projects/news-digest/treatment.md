# News Digest: the agent factory

A slide-led reel for engineers about [news-digest](https://github.com/EmmadUsmani/news-digest), a
private daily news briefing, and, mostly, the **agent factory** that builds it: one Codex agent in a
supervisor loop on an exe.dev VM, on a $100/month ChatGPT plan, steered through files in the repo.
About 8½ minutes. Product footage supports the explanation; the explanation is the point.

## Why this edit breaks the house shape

The house style is a short feature reel made of footage. This one is a technical pitch: most beats
are **animated diagrams and charts** drawn by the scenes (in `kit.ts`), with real footage between
them. The diagrams are slides, not UI: no screen is mocked or redrawn. Where a slide quotes a file
(the iteration prompt, STEERING.md's ranked list, a Budget line, a summary), the text comes from the
repo or the VM's logs and is labelled as abridged where it is.

Other deliberate differences, for this edit only:

- **Narration at Kokoro speed 1.1** (`measure.ts` and `audio.ts --speed 1.1`). At 1.0 the reel ran
  ten minutes; 1.1 is still a natural pace and suits a dense, technical audience.
- **Every beat is held for its measured line.** There are ~70 lines, so `measure.ts` voices each one
  and writes `vo-lengths.json`; `Narrated` (kit.ts) lays each scene out from those lengths. A line
  can never overrun: edit `script.ts`, re-run `measure.ts`, and the picture moves with it.
- **Diagram secondary text is 20–24 px** (sub-labels inside boxes and on edges); every label meant to
  be read on its own is ≥ 26 px or sits in a zoomed camera.

## Story

| Scene | Beat | Lines | Picture |
|---|---|---|---|
| `hook` | The claim, what it runs on, the closed loop, how fast | h1, h3–h6 | Kinetic type; three spec cards; a loop with five stations; 198 iterations and 198 commits a day (real) |
| `title` | Title card | title | Polaroids of the agent's own screenshots |
| `product` | The product in thirty seconds | p1, p3, p4 | Reader (brief, a story, posts) then the admin overview, camera only |
| `factory` | Chapter: The agent factory | — | |
| `overview` | The factory at a glance; the closed loop | f1a–f1g | VM diagram: systemd → supervisor → codex exec → working copy / live app → observe; GitHub; gateway |
| `fresh` | No long-running chat | f2a–f2e | A struck-out endless chat; three iterations whose contexts fill and are wiped; repo as memory; the summary baton |
| `loop` | One iteration | f3a–f3g | State machine with a token walking it; four result branches |
| `prompt` | The prompt | f4b–f4f | ITERATION_PROMPT.md (abridged) with lines lit; real Budget line (iteration 1003) and summary (1557) |
| `velocity` | Velocity | v1–v4 | ≈8 min ring; per-day iteration/commit bars; commits-per-hour heatmap (9 days × 24 h); cumulative lines and commits |
| `memory` | Chain of command | f5b–f5e | Owner / both / agent files; an agent edit to MISSION.md reverted; STEERING.md rules |
| `steering` | The humans' half of the loop | f6a–f6f | Six-station closed loop: lead session → diagnose → approve → push → next iteration → ack |
| `github` | The real files | f7a–f7c | Live GitHub: STEERING.md's Current order, an ack, the commit list scrolling |
| `pacing` | Economics | f9a–f9h | $100 plan and weekly allowance; 106 quota hits on day one; the **real weekly quota curve** against the pace band, vs an unpaced ghost; the Budget line; tokens and cost |
| `guardrails` | Guardrails outside the model | f10a | Four fences around Codex |
| `evidence` | It checks its own work | f11a, f12a | Wall of 96 of its screenshots pulling out; its Grafana agent dashboard |
| `hood` | Chapter: Under the hood | — | |
| `runtime` | Where it runs | a1b–a1d | VM topology; Docker on loopback; ports to the outside |
| `collect` | Collection | a2a, a2c | A day's timeline in Pacific time; push into 06:30–07:00 |
| `pipeline` | The edition pipeline | a3b–a3g | Six stages, four topic lanes in parallel, fallback path |
| `budgets` | The product's AI budget | a4a–a4f | Anthropic (Haiku/Sonnet) and xAI (grok-4.3) caps; the reserve/settle ledger; ≈30¢ an edition |
| `observe` | Observability | a6a | Logs/metrics/alerts flow; three dashboard polaroids |
| `end` | End card | end | |

## Honesty notes

- **The app is private** (behind the exe.dev login), so its UI, admin pages and Grafana are the
  **build agent's own Playwright screenshots of production**, committed to `docs/screenshots/`
  (Nov 3–7), upscaled 2× and cropped by `capture.ts`. The camera moves over them; there are no rings
  or labels on them, because there is no DOM to measure. Each such beat has an on-screen footnote.
- **GitHub is filmed live** (public repo). The commit list mixes the agent's commits with lead-session
  commits ("EmmadUsmani and claude"); the narration says only that commits land minutes apart.
- **Numbers** come from `stats.json` (`stats.ts`: git history plus the supervisor's `supervisor.log`
  and `usage.tsv` on the VM, read-only), as of the capture on Nov 9, 2026 ~18:00 UTC. Per-day figures
  use Pacific days; Nov 1 (from 09:00) and Nov 9 are partial and drawn lighter.
  - "About two hundred a day": the Nov 2–8 averages (198 iterations, 198 commits).
  - "Over a hundred quota hits in two days": 106 `result=usage` lines on Nov 1–2.
  - The quota curve is the weekly % after every iteration for the week Nov 2 13:52 → Nov 9 13:52 UTC.
  - "≈ $26": $100 × the 8.04 days the series covers ÷ 30.4 — a pro-rata share of a flat fee, not a bill.
    Cents per million tokens and per commit divide that by the logged totals.
  - "≈ 30¢ an edition": Nov 3 ($0.34, 43 calls) and Nov 6 ($0.29, 37 calls).
- **"Every line of its code was written by an AI agent"**: lead-session commits (prefixed `Lead:`) touch
  only steering and docs, never `apps/` or `packages/`; the owner's bootstrap commit held the mission
  and harness, not app code.
- **The $100/month figure is the owner's**; the handbook names the plan as ChatGPT Pro.
- **Particles in `pipeline`** illustrate narrowing, not counts. The `memory` slide's ranked list is
  paraphrased from STEERING.md's Current order on Nov 9; its ack line is quoted (truncated).

## Capture needs

```sh
ND_REPO=~/projects/news-digest bun projects/news-digest/capture.ts   # agent screenshots + live GitHub
ND_REPO=~/projects/news-digest bun projects/news-digest/stats.ts     # git + VM logs (ssh, read-only)
bun projects/news-digest/measure.ts                                  # voice every line, write vo-lengths.json
bun scripts/audio.ts --edit news-digest --speed 1.1
bun scripts/render.ts video --edit news-digest --audio out/audio-news-digest/mix.wav --out out/news-digest.mp4
```

`stats.ts` needs ssh access to the VM (`ND_VM`, default `news-digest.exe.xyz`); `stats.json` is
committed, so rendering does not. Left out for length (the edit ran 9½ minutes with them): the lead playbook's steering-traps table and
the hexagonal-architecture slide. Also left out: the reader's mobile layout, X embeds up close, the DB
explorer and the handbook site (all private), and the account and public-access work in progress.
