# demo-reel — narrated product demo videos from a real, running app

An engine for short product demo videos made from real footage of a running web app. Headless Chrome captures the app as 2× plates, or records its own motion frame by frame on a virtual clock, along with the boxes of the elements on screen. A deterministic Canvas2D renderer puts that footage in a browser window over a soft backdrop and adds a camera, a cursor, labels pinned to the real elements, narration and UI sounds. Every frame is a function of time, so the browser preview and the 1080p60 (or 4K) export are identical.

No music, ever: the soundtrack is a locally voiced narrator (Kokoro, open weights) plus quiet synthesised UI sounds placed by the scenes themselves.

- **How to make a video**, start to finish, with the checks it must pass: [`docs/WORKFLOW.md`](docs/WORKFLOW.md)
- **The house style** (look, motion, voice, sound, honesty rules): [`docs/STYLE.md`](docs/STYLE.md)
- **The engine's APIs** (capture, recorder, scenes, themes, rendering): [`docs/ENGINE.md`](docs/ENGINE.md)
- **Each edit's treatment**: [`docs/edits/`](docs/edits/)

## Layout

- `capture/` — Playwright (playwright-core, system Chrome) scripts that drive the real app and write `footage/<name>/`.
- `footage/` — the captured plates (gitignored) and their `manifest.json` (committed).
- `app/` — the renderer (TypeScript + Canvas2D, bun + Vite): `src/engine/` (timeline, window/camera/cursor, drawing, theme), `src/scenes/` (one module per beat, plus reusable title, chapter and end cards), `src/timeline.ts` (the edits and their themes).
- `scripts/render.ts` — offline renderer (headless Chrome → raw frames over WebSocket → ffmpeg); `scripts/audio.ts` — the soundtrack (narration + sound effects, placed by the scenes' own cues).
- `out/` — renders, stills and contact sheets (gitignored).

## Requirements

[bun](https://bun.sh), Google Chrome (driven through `playwright-core`'s `chrome` channel) and ffmpeg. The fonts (Inter, Instrument Serif; SIL OFL) come from npm. Kokoro's model downloads from Hugging Face on the first `audio.ts` run.

## Quick start

```sh
bun install
bun capture/todomvc.ts                          # films todomvc.com's React app (~40 s)
bunx vite                                        # preview: http://localhost:5180/?edit=todomvc
bun scripts/audio.ts --edit todomvc              # narration + sound effects → out/audio-todomvc/mix.wav
bun scripts/render.ts video --edit todomvc --audio out/audio-todomvc/mix.wav --out out/todomvc.mp4
```

## The edits

| Edit | What it shows | Footage | Length |
|---|---|---|---|
| `todomvc` | [TodoMVC](https://todomvc.com)'s React app: three todos added, one completed, the Active filter. One recorded session; wears TodoMVC's own red through an edit theme. | `bun capture/todomvc.ts` (a recorded clip) | 0:27 |
| `vite` | [Vite](https://vite.dev)'s homepage: a push into the install command, then a scroll to the features. Shots only, in the default theme. | `bun capture/vite.ts` (one full-page plate) | 0:19 |

They're short worked examples of the two ways to film: a frame-by-frame recording of the app's own motion (`todomvc`), and still plates the renderer moves over (`vite`). Both film public open-source sites, so they re-record anywhere with a network connection. Point `BASE_URL` at a local build to film that instead.

To make your own, follow [`docs/WORKFLOW.md`](docs/WORKFLOW.md): write a treatment, a capture script, a scene or two and a timeline entry.
