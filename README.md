# demo-reel — narrated product demo videos from a real, running app

An engine for short product demo videos made from real footage of a running web app. Headless Chrome captures the app as 2× plates, or records its own motion frame by frame on a virtual clock, along with the boxes of the elements on screen. A deterministic Canvas2D renderer puts that footage in a browser window over a soft backdrop and adds a camera, a cursor, labels pinned to the real elements, narration and UI sounds. Every frame is a function of time, so the browser preview and the 1080p60 (or 4K) export are identical.

No music, ever: the soundtrack is a locally voiced narrator (Kokoro, open weights) plus quiet synthesised UI sounds placed by the scenes themselves.

- **How to make a video**, start to finish, with the checks it must pass: [`docs/WORKFLOW.md`](docs/WORKFLOW.md)
- **The house style** (look, motion, voice, sound, honesty rules): [`docs/STYLE.md`](docs/STYLE.md)
- **The engine's APIs** (capture, recorder, scenes, themes, rendering): [`docs/ENGINE.md`](docs/ENGINE.md)
- **Each edit's treatment**: [`docs/edits/`](docs/edits/)

## Gallery

Five edits, all filmed from real, running open-source apps. Each links to its treatment (the story, the honesty notes and what the capture needs).

| | |
|---|---|
| [![Excalidraw: drawing a flow](docs/img/ex.jpg)](docs/edits/excalidraw.md)<br>**[Excalidraw](docs/edits/excalidraw.md)** · 0:48<br>Real drags and typing on a canvas. | [![Hoppscotch: a live API request](docs/img/hop.jpg)](docs/edits/hoppscotch.md)<br>**[Hoppscotch](docs/edits/hoppscotch.md)** · 0:38<br>Two live requests, and the response echoing them. |
| [![OpenStreetMap: zooming to the streets](docs/img/osm.jpg)](docs/edits/openstreetmap.md)<br>**[OpenStreetMap](docs/edits/openstreetmap.md)** · 0:34<br>A search, a fly-to, and live map tiles. | [![TodoMVC: filtering a list](docs/img/todo.jpg)](docs/edits/todomvc.md)<br>**[TodoMVC](docs/edits/todomvc.md)** · 0:27<br>A recorded session, wearing the app's own red. |
| [![Vite: the title card](docs/img/vite.jpg)](docs/edits/vite.md)<br>**[Vite](docs/edits/vite.md)** · 0:19<br>Shots only: one full-page plate, moved over. | |

The stills above are frames of the rendered videos. The MP4s themselves are not committed (renders are gitignored); `bun capture/<edit>.ts` and the render commands below make them in a few minutes each.

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

## Troubleshooting

- **macOS: `library load disallowed by system policy` (onnxruntime or sharp) when running `audio.ts`.** Files that came from another machine or an archive carry a quarantine attribute, and macOS then refuses to load their native libraries into bun. Clear it on the installed packages: `xattr -dr com.apple.quarantine node_modules`.
- **`bun: command not found`.** Install bun first (`brew install oven-sh/bun/bun`, or see [bun.sh](https://bun.sh)).

## The edits

| Edit | What it shows | Footage | Length |
|---|---|---|---|
| `todomvc` | [TodoMVC](https://todomvc.com)'s React app: three todos added, one completed, the Active filter. One recorded session; wears TodoMVC's own red through an edit theme. | `bun capture/todomvc.ts` (a recorded clip) | 0:27 |
| `vite` | [Vite](https://vite.dev)'s homepage: a push into the install command, then a scroll to the features. Shots only, in the default theme. | `bun capture/vite.ts` (one full-page plate) | 0:19 |
| `excalidraw` | [Excalidraw](https://excalidraw.com): pick a shape, drag it out, label it, then join a rectangle, a diamond and an ellipse with arrows. | `bun capture/excalidraw.ts` (a recorded clip, real drags and typing) | 0:48 |
| `hoppscotch` | [Hoppscotch](https://hoppscotch.io): add a query parameter to a request, send it, and read the echo of it in the real response; then a second parameter. | `bun capture/hoppscotch.ts` (a recorded clip, two live requests) | 0:38 |
| `openstreetmap` | [OpenStreetMap](https://www.openstreetmap.org): search a city, watch the map fly to it, zoom down to the streets. | `bun capture/openstreetmap.ts` (a recorded clip, live map tiles) | 0:34 |

`todomvc` and `vite` are the short worked examples of the two ways to film: a frame-by-frame recording of the app's own motion, and still plates the renderer moves over. The other three are fuller recorded sessions (drawing on a canvas, a live network request, a live map). All five film public open-source sites, so they re-record anywhere with a network connection. Point `BASE_URL` at a local or self-hosted build to film that instead.

Every edit has a treatment in [`docs/edits/`](docs/edits/): its story, what is specific to it, and what the capture needs.

To make your own, follow [`docs/WORKFLOW.md`](docs/WORKFLOW.md): write a treatment, a capture script, a scene or two and a timeline entry.
