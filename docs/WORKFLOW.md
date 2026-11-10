# Making a video

This is the end-to-end process for every video this engine makes, from a brief to a checked MP4. Read alongside:
- [`STYLE.md`](STYLE.md): how every video looks and sounds;
- [`ENGINE.md`](ENGINE.md): the APIs;
- an existing project's treatment in [`projects/`](../projects/), as a worked example (`todomvc/treatment.md` for a recorded session, `vite/treatment.md` for a shots-only reel).

The short version: **brief → treatment → app state → capture → look at the footage → scenes → look at the stills, cuts and motion → narration and sound → render → check the MP4 → deliver.** Every arrow is a gate: don't move on until the check before it passes. A video is done when every check in [the checklist](#the-checklist) passes, not when it renders.

## 0. Vocabulary

- **Project**: one video, and everything specific to it, in `projects/<name>/`: `capture.ts`, `timeline.ts`, `scenes/`, `footage/` and `treatment.md`. Shared things (the engine, the reusable cards, the capture toolkit, the render and audio scripts) live outside `projects/`.
- **Edit**: a project's timeline (`projects/<name>/timeline.ts`, default export `{ timeline, theme? }`), collected automatically and chosen with `?edit=<name>` in the preview and `--edit <name>` in `render.ts` / `audio.ts`.
- **Footage**: `projects/<name>/footage/`, written by the project's one capture script `projects/<name>/capture.ts`. It holds PNG plates (`shots`), frame-by-frame recordings (`clips`, JPEG per frame), `extras` (any other image or data a scene needs), and `manifest.json`. Only the manifest is committed.
- **Scene**: one beat, one file in the project's `scenes/` (the reusable cards are shared, in `app/src/scenes/`). Its narration lines and sound cues are declared next to its animation. Title, chapter and end cards are reusable scenes configured by timeline `params`.

## 1. Brief → treatment

Pin down, in writing, before touching the app:
- **What it shows:** the product or feature (and its branch or version), and who watches.
- **Target length:** a feature reel is 20–60 s.
- **The story:** the beats in the order a person would really use the feature. Each beat is one idea, with one narration sentence and at most one or two labels.
- **The honest notes:** is it live, coming soon, behind a flag, using hand-made demo data, sped up? Did you hide anything on the page for filming (a promo banner, a docs sidebar)?
- **What the app has to be in for each beat:** the records, the user, the build.

Write it as `projects/<name>/treatment.md`, following `projects/todomvc/treatment.md`: a story table (scene → beat → narration → footage), what is specific to the edit, and what the capture needs. When the brief comes from a person, they get the treatment to react to before you spend time on capture. When running unattended, make the calls yourself and record them in the treatment.

## 2. The app, in the state the story needs

- Run the real app on the build you are demoing: a local dev server, a staging deploy, or the public site. Capture scripts take `BASE_URL` so one script films any of them.
- **Demo data.**
  - Seed the records the story needs before filming, with your app's own seed tooling. Keep the seed command in the capture script's header comment or the treatment.
  - Anything the viewer sees change on screen must change through the UI during the recording, never by a direct write mid-shot.
  - Use plausible, made-up names and companies. Never use a real customer's or user's data.
  - Sign in as a demo account. Never put real credentials in a capture script; read them from the environment, or reuse a saved session (`launch({ prepare })`).
- **Look before you write the capture.**
  - `bun capture/explore.ts <name> <url> [steps…]` screenshots a page and lists its controls with their boxes.
  - Read the screenshot. Check for dev-only noise, cookie banners, chat widgets, broken images, empty states and stale caches.

## 3. Capture

Write `projects/<name>/capture.ts`: one script per project, one session per script where possible. It imports the shared toolkit from `capture/` (`../../capture/lib`, `../../capture/record`). Pick the tool by what the beat shows:

| The beat shows | Use | Example |
|---|---|---|
| a static page, a scroll over a page | `footage.shot()` (DPR-2 PNG, plus element boxes) | `vite.ts` |
| the app's own motion: clicks, drags, typing, panels, transitions | a `Recorder` clip on the virtual clock | `todomvc.ts` |
| a real process that takes far longer than the video can (a background job, an AI run) | stills each time its visible state changes, replayed in slots | — |

Rules:
- Locate elements by role, accessible name, test id or a stable class. Never use coordinates.
- `rec.mark(name, { key: locator })` at every moment a scene will aim at (start, after each click, the result). Scenes aim cameras, labels and narration at marks, never at frame numbers.
- One session's consecutive clips carry the pointer across, so they hard-cut seamlessly. Save the manifest after every clip.
- Never `waitFor` mid-recording, because the clock is frozen. Use `rec.until(locator)`.
- Move the pointer off a control after clicking it when the scene will label it, the way a person would, so the label isn't under the cursor.
- Make the script **re-runnable and self-checking**. Have it throw (or exit non-zero) when the app didn't reach the expected state or the content isn't showable, rather than recording a bad take.

Run it, then **look at what it recorded**:
- `bun capture/peek.ts <project> <clip> 24`: a contact sheet of the clip, plus its marks. Open the PNG and read it. Check for the right state, tooltips stuck open, blank images, spinners, a cursor parked on something, and dev widgets.
- For shots, open the PNGs themselves.
- Re-record until the footage is clean. Fixing it in the edit is not an option, because the footage is the product.

## 4. Scenes and the timeline

- Write `projects/<name>/timeline.ts`: build entries with `const E = entries(import.meta.glob('./scenes/*.ts'))` (from `@engine/edit`) and default-export `{ timeline, theme? }` (with a `theme` if the product has its own colours). It is picked up automatically; nothing to register.
- Use the reusable cards where they fit: `title-card`, `chapter`, `end-card`, each configured by `params` (documented at the top of each file).
- Add one scene per remaining beat: `projects/<name>/scenes/<beat>.ts` (shared helpers for the project go beside them). Engine imports use the `@engine/` alias.
- Recorded clips subclass `ClipScene`:
  - `plan()` lays out the playback;
  - `cameraKeys()` aims the camera;
  - `overlay()` draws labels;
  - `narration()` holds the lines;
  - `sounds()` adds any cues beyond clicks, keys and camera moves.
- Stills subclass `Scene` and use `AppView` (`vite-page.ts`).
- Derive every time from the recording (`player.timeOf(mark)`, `this.presses`) or from named constants. Derive narration and cues from the same constants. A render must depend only on `f.t` / `f.lt`.
- Labels and rings use the marked boxes (`this.screenBox(mark, key)`).
- `bun run typecheck` must pass.
- Preview with `bunx vite` at `http://localhost:5180/?edit=<edit>`. Use `[`/`]` to jump between scenes and `l` to loop one. The preview shows scene errors in red.

## 5. Look at the picture (before any audio)

Stills show composition, sheets show cuts, and `jumps` shows motion. Run all three, and **open and read every image you produce**. A render you didn't look at is unverified.

```sh
bun scripts/render.ts stills --edit <edit> --t 1,4.5,9.2 --out out/wip/<edit>   # every beat's key moment, at full size
bun scripts/render.ts sheet  --edit <edit> --cuts --out out/sheets/<edit>-cuts.png
bun scripts/render.ts sheet  --edit <edit> --from 0 --to <dur> --n 24 --out out/sheets/<edit>.png
bun scripts/render.ts jumps  --edit <edit> --from 0 --to <dur>                    # "no pops" is the bar
```

In the stills, look for:
- labels overlapping each other, a control, the page's own text or the cursor;
- a ring that isn't on its element;
- text under 26 px;
- a close-up past the window's edge;
- a label pill that disappears into a dark app;
- the address bar reading something odd.

In the cut sheet, look for double exposures, jumps and mismatched framings across hard cuts.

`jumps` lists every pop: fix each one or explain it. An app that changes state instantly (a list that updates with no transition, a page navigation) is legitimate; note it in the treatment.

## 6. Narration and sound

```sh
bun scripts/audio.ts --edit <edit>        # → out/audio-<edit>/mix.wav, vo.wav, sfx.wav, sheet.png
```

- It prints each line's measured length against its beat and refuses to mix on an overrun. Shorten the line or hold the beat (`player.hold()`, a longer `DUR`), then re-run. The timeline moves with it.
- Open `sheet.png`. Every line should sit inside its beat window, with clicks under their presses and whooshes over camera moves. No lane should be empty where it shouldn't be.
- Check how unusual words will be said (`phonemizer`), and respell where needed.
- Loudness: the script reports the mix's integrated LUFS (target −16) and true peak (under −1.5 dBFS).

## 7. Render and check the MP4

```sh
bun scripts/render.ts video --edit <edit> --audio out/audio-<edit>/mix.wav --out out/<edit>.mp4
```

Then check the file itself, not the app:
- `ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate -of compact out/<edit>.mp4`: h264 1920×1080 at 60 fps plus aac, and a duration equal to the timeline's.
- Pull 3–6 frames with `ffmpeg -ss <t> -i out/<edit>.mp4 -frames:v 1 out/wip/mp4-<t>.png` at the same times as your stills, and compare them (`ffmpeg -i a.png -i b.png -lavfi psnr -f null -`: 45 dB or more is about ±1 level).
- Audio sync: decode the MP4's audio and confirm a click lands on its press. `ffmpeg -i out/<edit>.mp4 -map 0:a -ac 1 -ar 48000 out/wip/a.wav`, then cross-correlate against `mix.wav` around a known click; the lag must be 0.
- Watch it once end to end at 1× when you can. Without a screen, read a dense sheet of the MP4's own frames, two per second: `ffmpeg -i out/<edit>.mp4 -vf "fps=2,scale=480:-1,tile=6x<rows>" -frames:v 1 out/wip/<edit>-mp4-sheet.png`, with `<rows>` at least the duration in seconds ÷ 3 (6×10 holds only 30 s, and silently drops the rest).

## 8. Deliver

- **Commit:** the project directory (`capture.ts`, `timeline.ts`, `scenes/`, `footage/manifest.json`, `treatment.md`) and a README line for the new edit (how to capture and render it, and its length). Never commit plates, renders, fonts you aren't licensed to redistribute, or secrets: `.gitignore` covers the usual ones.
- **The MP4** goes wherever the person asked; by default it's `out/<edit>.mp4`.
- **The HTML player**, when asked for one (a video that plays in a page, with narration and captions switchable): `bun scripts/build.ts --edit <name>` writes a static folder, `out/web-<name>/`. See `docs/ENGINE.md`, *The HTML player*.
- **Slides**, when asked for a deck: `bun scripts/slides.ts --edit <name>` writes the HTML deck, a PDF and a PowerPoint (which Keynote and Google Slides open), with the narration as speaker notes. Look at every slide (`slides/*.jpg`) before you send them: a stop that lands mid-transition is a scene whose `stops()` need moving.
- **The report** names:
  - the file and its length;
  - the edit's beats;
  - every honesty note (coming soon, sped up, demo data, anything hidden for filming);
  - anything you couldn't verify or chose to leave out.

## Decks

An edit can be a presentation instead of a video: set `deck: true` in its `timeline.ts` and the player opens in slides mode, silent, with a stop per slide (`Scene.stops()`). Write what the presenter says per slide, not narration:
- a scene authors `notes()`, each note timed at one of its own `stops()` (use `this.stops()[i]`, not seconds); a slide's notes are those timed after the previous stop, up to its own, and a slide with none falls back to the narration said on the way;
- the title, chapter and end cards take a `notes` param, so they need no `line`;
- to give another project's scene notes, extend it in a thin file under your own `scenes/` and override `notes()`;
- `bun scripts/build.ts --edit <name> --single` writes one `.html` (at most 16 MiB to publish as a Claude artifact); open it with `#presenter` for the presenter's view (notes, next slide, timer), or run `bun scripts/slides.ts` for the static deck.

Look at a still at every stop, and read `slides.json` to check the notes. `projects/news-digest-deck/` is the worked example (seven slides made from news-digest's scenes), with `deck.test.ts` and `e2e/pilot.e2e.ts` as its tests.

## Iterating on feedback

Change only what was asked, then re-run the checks it could have broken:
- a narration change → `audio.ts` plus the sheet;
- a timing change → `jumps` and the cut sheet over the scenes it moved;
- a re-recorded clip → `peek`, then stills of its scene.

Re-render the full video last.

## The checklist

A video is ready when all of these hold:

- [ ] Every frame of UI is real footage of the app; nothing mocked or redrawn.
- [ ] Each label sits on the element it names, says what it does, and claims nothing the product doesn't.
- [ ] Anything not live, sped up, hand-made or hidden for filming is said on screen, in the narration, or in the treatment.
- [ ] No PII, secrets, credentials, stack traces, dev widgets or internal ids anywhere in the frame.
- [ ] `bun run typecheck` passes; the preview shows no scene errors.
- [ ] Stills at every beat have been read at full size: no collisions, no off-window close-ups, text ≥ 26 px.
- [ ] The cut sheet is clean, and `jumps` reports no pops (or each is explained).
- [ ] `audio.ts` mixed without `--force`: every line fits its beat; the mix is −16 LUFS, peaks ≤ −1.5 dBFS; no music.
- [ ] The MP4 is h264 1080p60 + aac, its frames match the stills, and its audio lags the mix by 0.
- [ ] The treatment, capture script, manifest, scenes and README are committed; plates and renders are not.
