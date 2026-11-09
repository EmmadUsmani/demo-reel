# demo-reel

A deterministic engine for code-rendered, narrated product demo videos made from footage of a real, running web app. Each video (an "edit") is one project under `projects/`: `todomvc`, `vite`, `excalidraw`, `hoppscotch`, `openstreetmap`.

Layout is **by project**: everything specific to one video lives in `projects/<name>/` (`capture.ts`, `timeline.ts`, `scenes/`, `footage/`, `treatment.md`). Only shared code lives elsewhere: `app/src/engine/` (the engine), `app/src/scenes/` (the reusable title, chapter and end cards), `capture/` (the capture toolkit), `scripts/` (render and audio). Never put a project's files in a shared directory.

Before making or changing a video, read:
- [`docs/WORKFLOW.md`](docs/WORKFLOW.md): the process from brief to delivered MP4, and the checklist a video must pass;
- [`docs/STYLE.md`](docs/STYLE.md): the house style (picture, motion, narration voice, sound, honesty rules);
- [`docs/ENGINE.md`](docs/ENGINE.md): capture, recorder, scene, theme and render APIs, and their gotchas;
- `projects/<name>/treatment.md`: each project's treatment (`projects/todomvc/treatment.md` is a compact worked example).

Rules that are easy to break:
- Every pixel of UI is real footage of the app. Never mock or redraw a screen.
- A render you didn't look at is unverified. Open every still, sheet and contact sheet you produce.
- No music. Narration is Kokoro `af_heart`; a line that overruns its beat means the line gets shorter or the beat gets longer, never `--force`.
- Never commit footage plates, renders or secrets; only `projects/*/footage/manifest.json`.
- `bun run typecheck` and `bun run test` before committing; `bun run test:e2e` too when you change the player (`app/src/player/`, `scripts/build.ts`).
