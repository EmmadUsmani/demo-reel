# demo-reel

A deterministic engine for code-rendered, narrated product demo videos made from footage of a real, running web app. Several videos ("edits") share it: `todomvc` (a recorded session on todomvc.com) and `vite` (a shots-only reel of vite.dev).

Before making or changing a video, read:
- [`docs/WORKFLOW.md`](docs/WORKFLOW.md): the process from brief to delivered MP4, and the checklist a video must pass;
- [`docs/STYLE.md`](docs/STYLE.md): the house style (picture, motion, narration voice, sound, honesty rules);
- [`docs/ENGINE.md`](docs/ENGINE.md): capture, recorder, scene, theme and render APIs, and their gotchas;
- `docs/edits/<edit>.md`: each edit's treatment (`todomvc.md` is a compact worked example).

Rules that are easy to break:
- Every pixel of UI is real footage of the app. Never mock or redraw a screen.
- A render you didn't look at is unverified. Open every still, sheet and contact sheet you produce.
- No music. Narration is Kokoro `af_heart`; a line that overruns its beat means the line gets shorter or the beat gets longer, never `--force`.
- Never commit footage plates, renders or secrets; only `footage/*/manifest.json`.
- `bun run typecheck` before committing.
