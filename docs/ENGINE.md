# Engine guide

Every video is a web app (`app/`, TypeScript + Canvas2D, run with bun + Vite) that renders any time `t` deterministically at 1920×1080 (`?scale=2` for a true 3840×2160). The same code drives the live preview and the offline 60 fps export: a timeline of scenes, pure-function frames, headless Chrome streaming raw frames to ffmpeg.

## Edits and themes

One engine renders several videos. Each video is a **project** in `projects/<name>/`, and its **edit** is `projects/<name>/timeline.ts`, whose default export is `{ timeline, theme? }`. `app/src/timeline.ts` collects them all (a glob over `projects/*/timeline.ts`), so a new project needs no registration. Choose one with `?edit=<name>` in the preview and `--edit <name>` in `render.ts` / `audio.ts` (default: the first one registered; the audio lands in `out/audio-<edit>/`).
- A project's timeline builds its entries with `const E = entries(import.meta.glob('./scenes/*.ts'))` (`@engine/edit`): `E(id, 'name')` loads the project's own `scenes/name.ts`, else the shared `app/src/scenes/name.ts`. An entry's `params` configure a reusable scene: `title-card`, `chapter`, `end-card` (each documents its params at the top of the file).
- A project can reuse another's entries by importing its default export and editing the result of `timeline()`.
- A new project is one directory: `capture.ts`, `timeline.ts`, `scenes/`, `footage/` (written by the capture), and `treatment.md`. Scenes import the engine through the `@engine/` alias (`@engine/clip-scene`, `@engine/draw`...).
- A **theme** (`palette.ts` `Theme`) overrides any colour token (`colors`), the three font roles (`fonts`), and adds font files (`fontFiles`). `main.ts` applies it before the scenes load, and every drawing helper reads `C` / `FONT` at render time. The default is a neutral indigo with Inter and Instrument Serif.
- See `docs/WORKFLOW.md` for the whole process.

## Pipeline

1. **Capture** (`projects/<name>/capture.ts`, on the shared toolkit in `capture/`): headless Chrome drives the real app and writes `projects/<name>/footage/`: DPR-2 PNG plates plus `manifest.json` with each plate's scroll offset and the boxes (document CSS px) of the elements scenes aim at.
2. **Compose** (`projects/<name>/scenes/`, plus the shared cards in `app/src/scenes/`): scenes draw plates into a browser window, move the camera, cursor and callouts by those boxes.
3. **Render** (`scripts/render.ts`): stills, contact sheets, a motion check, and the video.

## Running things

```sh
bun install
bun projects/todomvc/capture.ts  # films a public site; BASE_URL=<url> films another build
bunx vite                        # preview at http://localhost:5180/?edit=todomvc&t=12
```

Preview keys: space play/pause, ←/→ ±1 s (shift ±5 s), `,`/`.` one frame, `[`/`]` previous/next scene, `l` loop the scene, `h` hide the UI.

Render (starts its own no-reload Vite server if 5180 isn't up):

```sh
bun scripts/render.ts stills --edit todomvc --t 2.9,6.9 --out out/wip/x     # then LOOK at the PNGs
bun scripts/render.ts sheet --edit todomvc --from 0 --to 25 --n 20 --out out/sheets/x.png
bun scripts/render.ts jumps --edit todomvc --from 0 --to 25                 # frame-to-frame change; flags pops
bun scripts/render.ts video --edit todomvc --out out/todomvc.mp4            # 1080p60, x264 CRF 16, BT.709-tagged
```

`--only id1,id2` loads just those timeline entries. `--samples N` averages N sub-frames over the shutter for motion blur (N× the render time). `--scale 2` renders 4K.

## Verifying a render

Stills and sheets show composition; they can't show motion. After every change:

1. `stills` at the beats you touched, read at full size (label collisions, crops, focus).
2. `sheet --cuts` around every scene boundary (double exposures, jumps at cuts).
3. `jumps` over the range: a pop is a frame that changes far more than its neighbours (a plate swap that doesn't line up, a camera key that snaps). "no pops" is the bar; an app's own instant state change is the legitimate exception.
4. After encoding, pull frames out of the MP4 with ffmpeg and compare with the stills: flat areas should match within ±1 level.

## Capturing footage

`capture/lib.ts`:
- `launch({ prepare, hide, colorScheme })`: Chrome at 1440×900, DPR 2, with the virtual clock installed. `prepare(context)` runs before any page opens (seed localStorage so one-time hints read as dismissed, load a saved sign-in session); `hide` adds CSS selectors to keep out of every shot.
- `baseUrl(fallback)`: the app's origin, `BASE_URL` overriding the script's default.
- `settle(page)`: network idle, fonts, in-view images decoded, fade-ins done; hides chat bubbles, cookie banners and dev overlays.
- `loadWholePage(page)`: walks the viewport down so lazy images load, for full-page shots.
- `liftMarquee()` / `hideMarquee()`: lift a CSS marquee out of the page so the renderer can replay it (see below).
- Signing in is the capture script's job: fill the real form with a demo account (credentials from the environment), or use your app's dev-only login route.

```ts
const footage = new Footage('vite');
await footage.shot(page, 'hero', { cta: page.getByRole('link', { name: 'Get Started' }) });
await footage.shot(page, 'page', boxes, { fullPage: true, maxHeight: 2600 });
footage.save();
```

- The viewport is 1440×900 at DPR 2: a laptop layout, sharp up to a 2× camera push.
- Locate elements by role, accessible name or test id, never by coordinates.
- A full-page plate scrolled by the renderer is faithful only when the page has no sticky or fixed elements in view; if it does, record the scroll as a clip (`rec.wheel`) instead.
- Anything animated on the page that must keep moving (a logo marquee) is hidden in the plates and lifted out on its own, so the renderer can replay it on the video's clock: `hideMarquee(page, track)` before the shots, `footage.extras.marquee = await liftMarquee(page, footage, track, loopSeconds)` last, `view.marquee(page, railBox, t)` in the scene.
- `projects/*/footage/**/*.png` and `*.jpg` are gitignored (large, regenerable); `manifest.json` is committed.

## Recording the app's motion (clips)

Stills can't carry the app's own motion (an item flying into a list, a drag, a sheet sliding in), so those beats are **recorded frame by frame on a virtual clock** (`capture/clock.ts`, `capture/record.ts`), the way deterministic web-capture tools work:

- An init script takes over the page's clock: `setTimeout`/`setInterval`, `requestAnimationFrame`, `performance.now`/`Date`, and every CSS transition / animation and Web Animation (`document.getAnimations()`). Live, it follows real time and the app behaves normally.
- `Recorder.start()` freezes it. Each frame: the real input for that frame (`page.mouse.move` along an eased path, a press, a key), then `advance(1/60 s)`, then `settle()` (framework commits, fetches answer, images in view decode, bounded so anything stuck past 2.5 s is ignored), then a JPEG screenshot. So 60 recorded frames are exactly one second of the app's motion.
- Headless screenshots have no OS pointer: every frame logs the pointer position, whether the button is down, the URL (where it changes) and any keystroke. The renderer draws its cursor there, makes a click sound on each press and a key tap on each keystroke, and fills the address bar from the real URL.
- `rec.type(text)` types a character at a time; `rec.key('Enter')` presses one named key; both log a key cue.
- `rec.mark(name, { key: locator })` records element boxes at a frame (and the page's scroll then), for the scene to aim at.
- One script records a whole session as consecutive clips, carrying the pointer across, so consecutive clips hard-cut seamlessly. A `Recorder` built with `{ dry: true }` rehearses a clip live (same inputs, no frames) to reach a later clip's starting state quickly. Save the manifest after every clip.
- A click that loads a new page (a form submit, a link, a redirect) goes through `rec.clickThrough(ready)`. The new document's clock starts live and a plain `click()` races the navigation, so the load itself isn't filmed: the next frame is the new page after `ready` has run on it.
- Scroll or zoom with `rec.wheel(deltaY)` in CSS px: Chrome divides a synthetic wheel delta by the device pixel ratio, so a raw `page.mouse.wheel(0, 20)` arrives as 10 at DPR 2. Each notch is logged on its frame and `ClipScene` adds a `wheel` cue for it.
- Never `waitFor` an element mid-recording: the clock is frozen between frames, so anything behind a timer (a debounced search) never comes. `rec.until(locator)` keeps stepping until it shows.
- The virtual clock finishes an animation it has stepped to its end. A paused animation never resolves its `finished` promise, and UI libraries wait on it before unmounting an exiting tooltip or panel; without this they stay on screen forever.
- Gotchas: a drag path that crosses other elements under pointer capture leaves their hover/tooltip state stuck (enter without leave), so route drags clear of them and nudge the pointer after a drop; a panel rendered twice needs the copy that is actually on top; anything that changes server-side state is the demo's own UI action, never a direct write. The clip's own ends are always `'start'` and `'end'` in `player.play()` / `hold()`, even if you also named a mark `start`.

Check a clip with `bun capture/peek.ts <project> <clip> [frames]` (a contact sheet of the JPEGs, plus its marks).

In a scene, `ClipScene` (`engine/clip-scene.ts`) does the shared work. `plan(player)` lays out playback as segments (`player.play(fromMark, toMark, rate)`, `player.hold(seconds)`), so a beat can be held for its narration (or sped up) without re-recording; `player.timeOf(mark)` and `this.presses` anchor narration, cues and camera keys to the recording itself. `source.host` rewrites the address bar's host (a dev server's `localhost:3000` reads as the product's domain). Frames decode lazily (an LRU of a dozen 2880×1800 bitmaps) in `prepare(t)`, which the engine awaits before every draw.

## Writing a scene

One file in the project's `scenes/`, default-exporting a `Scene` subclass, named by an entry in the project's `timeline.ts`:

```ts
export default class MyScene extends Scene {
  private view!: AppView;
  async init() { this.view = new AppView(await loadFootage('vite'), 'vite.dev'); }
  render(f: Frame) {
    const { view, g } = this;
    const shot = view.footage.shots.page!;
    view.camera = cameraAt(f.lt, [[0, view.wide], [1.2, view.aim(shot.boxes.install!, 1.8), ease.inOutQuart]]);
    backdrop(g, f.t);
    view.draw(g, (page) => view.plate(page, shot));
    highlight(g, view.screenBox(shot.boxes.install!), prog(f.lt, 1.2, 1.5));
  }
}
```

- `render()` draws the whole frame and must depend only on `f.t` / `f.lt` (use `mulberry32` for scatter, never `Math.random` or clocks).
- **Three spaces** (`engine/view.ts`): *page* (the app's document CSS px, where the captured boxes live), *world* (the 1920×1080 composition the window sits in), *screen* (world through the camera). `view.draw()` paints in page space; draw callouts and the cursor in screen space with `view.screenBox()` / `view.screenOfPage()` so they stay a constant size.
- `view.scrollY` scrolls the page; `view.plate(page, shot, alpha)` paints whatever part of a shot is in view, so a full-page shot scrolls and viewport shots swap in at their own offset (crossfade them by alpha for a click's result).
- Camera: `view.wide`, `view.aim(box, zoom, dx, dy)`, keyframed with `cameraAt(t, [[time, camera, ease, hop], ...])`; `hop` pulls the zoom back mid-move. Wrap a close-up in `insideWindow(view, camera)` to keep it on the window.
- Cursor: `cursorAt(t, [[time, x, y, ease], ...])` in page px (moves bow slightly like a hand), `pressAt`, `sinceClick`, drawn with `cursor()` and `clickRipple()` sized by `Math.sqrt(view.magnification)`.
- Polaroids for cards: `loadCard({ footage, shot | clip+at, key, pad })` in `scenes/cards.ts` crops a captured element out of a plate or a clip frame.
- Overlapping timeline entries crossfade; touching entries hard-cut. A scene whose content should leave before a crossfade animates its own exit (the title card does).
- The timeline is laid out end to end: an entry runs for its `dur`, or for as long as its scene's `duration()` says (a clip scene: its playback plan), and starts `overlap` seconds before the previous one ends. Holding a beat longer moves everything after it.

## Sound

Scenes declare their sound next to their animation, from the same constants, so it is in sync by construction:

```ts
narration(): Line[] { return [{ id: 'hero', at: 0.4, until: 4.4, text: 'It starts with one command.' }]; }
cues(): Cue[] { return [...cameraCues(this.cameraKeys()), { kind: 'pop', t: LABEL_IN }, { kind: 'click', t: CLICK }]; }
```

- `notes(): Note[]` (`{ at, text }`, `at` scene-local) are speaker notes for a deck, written per slide and never spoken. A slide's notes are the notes timed on the way to it (after the previous stop, up to and including its own); a slide with none shows the narration said on the way instead, so an edit without `notes()` is unchanged (`engine/notes.ts`, used by the player, the presenter view and `scripts/slides.ts` alike). `engine.notes()` lists them in video time, and the export API's `notes` sits beside `narration`.
- `at` is when the speech starts (scene-local); the line must be finished by `until`. Hold a beat for as long as its line takes to say: `scripts/audio.ts` prints each line's measured length and refuses to mix when one overruns.
- Cue kinds (`Cue` in `engine/scene.ts`): `click`, `key`, `wheel` (one scroll notch: derive them from the scroll curve when the renderer scrolls a plate), `pop` (a label arriving), `tick` (a chip), `chime` (the title), `swish` (a card flying in), `land` (a window settling), `drop`, `whoosh-in` / `-out` / `-across` (a camera move: `cameraCues(keys)` makes one per move, by how the zoom changes). Each takes `pan`, `gain` and `pitch`.

```sh
bun scripts/audio.ts --edit todomvc                             # → out/audio-todomvc/mix.wav, vo.wav, sfx.wav, sheet.png
bun scripts/render.ts video --edit todomvc --audio out/audio-todomvc/mix.wav --out out/todomvc.mp4
```

- **Narration** is voiced locally by Kokoro (open weights, Apache-2.0; `kokoro-js`, model downloaded from Hugging Face on first use) with `--voice af_heart` (`--speed` to taste), and cached per line in `out/audio-<edit>/vo/` by text and voice. Check how a brand word will be said with the `phonemizer` package (espeak-ng IPA) before respelling it.
- **Effects** are synthesised in the script (seeded noise, swept biquads, decaying partials), so the soundtrack is as deterministic as the frames.
- **Mix:** effects ducked about 5 dB under the voice, normalised to −16 LUFS integrated with a −1.5 dBFS lookahead limiter.
- **Check without listening:** `sheet.png` shows both stems against time with the scene windows, every cue and every line marked; measure the balance with `ffmpeg -i out/audio-<edit>/vo.wav -af ebur128 -f null -` (and the same for `sfx.wav`); after muxing, decode the MP4's audio and cross-correlate it with `mix.wav` around a click: the lag must be 0.
- On an overrun, Bun 1.4 may print a crash report as `audio.ts` exits after onnxruntime has loaded. The overrun message above it is the real result.

## The HTML player

The same engine plays an edit in a browser: `app/player.html` draws every frame live (the frames the MP4 is made of) while the soundtrack plays alongside, and the soundtrack keeps the time, so picture and sound can't drift apart.

```sh
bun scripts/audio.ts --edit news-digest --speed 1.1   # writes mix.wav, effects.wav and captions.json for the player too
bun scripts/build.ts --edit news-digest               # → out/web-news-digest/: index.html, assets/, footage/, audio/
bunx vite preview --outDir $PWD/out/web-news-digest --port 5190
```

- **A built player is one static folder** that works from any path (relative URLs): only that edit's code (`virtual:edits` in `vite.config.ts`), the plates its manifest names, and the soundtrack as constant-bitrate MP3 (a format every browser plays and hosts such as Claude artifacts serve). On the dev server, `http://localhost:5180/player.html?edit=<name>` plays the same page with `audio.ts`'s WAVs.
- **Sound:** two tracks, `mix` and `effects` (the effects alone, not ducked under a voice), so the narration can be switched off. Without a soundtrack the player plays silently on the wall clock; if the browser pauses the sound (media keys, headphones), the video pauses with it.
- **Captions** come from `captions.json`, each line timed to its speech. A line's on-screen text is its `caption` (`Line.caption`, the cards' `caption` param), so respellings written for Kokoro ("Reddis", "A.P.I.") read as the words are written; without one it is the spoken `text`.
- **The poster**, the frame shown before the first play, is `Edit.poster` (`{ scene, at }`); `Edit.title` names the page.
- **Slides mode** (`?mode=slides`, or the Slides toggle / `v`): the video as a deck. Each step forward plays from one stop to the next, narration included, and holds there; back jumps to the previous stop at once; `?slide=<n>` opens on a slide. Speaker notes (`s`) are the slide's authored `Scene.notes()`, else the lines said on the way to it, in their written form.
- **A deck** is an edit with `Edit.deck: true`: a presentation, where the presenter clicks through and speaks. The player opens in slides mode with the narration off and asks for no soundtrack at all (no `audio/` or `captions.json` requests), playing silently on the wall clock. An explicit URL choice wins: `?mode=video`, `?narration=1`. Nothing is synced between views: each is a static page the presenter steps by hand.
- **Presenter view** (`?view=presenter`, or `#presenter`; `#presenter-<n>` opens on slide n): the same page for the person presenting. It shows the slide on screen (the live canvas, stepped like slides mode, a step playing from stop to stop), a still of the next slide (drawn once per slide change through the engine, then the current frame again), the slide's notes in large type, k / N, a stopwatch (starts on the first step forward; pause and reset) and the time of day, and big Previous / Next buttons; →/space/Enter forward, ←/Backspace back, Home/End. On a phone in portrait the notes take the room and Next sits large at the bottom. The Share box links to it (on the slide on screen), and has an Open link.
- **Stops** are where a deck pauses: `Scene.stops()` (scene-local), the moments each beat is fully built. A scene that names none stops on its last frame, and no stop lands in a crossfade (`engine/stops.ts`). The shared cards stop before they clear; news-digest's `Narrated` stops 0.7 s before each beat ends, before the change into the next beat begins. Check them with a sheet at `__video.stops`, the times the export API lists.
- **Embeds:** `?scene=<id>` loads and plays that one entry: its range, its stops, its stretch of the soundtrack. Share (in the controls) gives links to the moment and the slide, and an `<iframe>` for the scene on screen.
- **Keys:** space or `k` play/pause, ←/→ ±5 s (shift: one frame), `n` narration, `c` captions, `m` mute, `f` full screen, `v` slides. In slides: →/space/Enter forward, ← back, Home/End, `s` notes. URL: `?t=<s>`, `?captions=1`, `?narration=0|1`.
- **Hosts with strict rules** (a Claude artifact: media and fonts only from data, only a `#name` passed to the page): fonts load as fetched data; a track the page may not stream is fetched and played from memory (it loads whole first); `#slides`, `#slide-<n>`, `#scene-<id>`, `#presenter` and `#presenter-<n>` stand in for the query. The Share box's links point at wherever the page itself is served, which inside an artifact's frame isn't the claude.ai link.
- **Size:** a slide-led edit is small (news-digest: about 19 MB, most of it plates and sound). Edits built on recorded clips ship every PNG frame and are hundreds of MB: fine on your own host, too big for most others until clips are encoded as video.
- **Tests:** unit tests next to the code in `app/src/player/`; browser tests in `e2e/` (`controls`, `links`, `layout`, `player`, `slides`, `presenter`, `deck`, `preview`), run by `bun run test:e2e`. See README.md, "Tests".

## Static slides

```sh
bun scripts/slides.ts --edit news-digest      # → out/slides-news-digest/: index.html, deck.pdf, deck.pptx, slides/*.jpg, slides.json
```

- **A still at every stop**, 1920×1080 JPEG, with the slide's speaker notes: its authored `Scene.notes()`, else the narration said on the way to it (the written captions from `audio.ts`, so run it first; without them, each line's `caption` or `text`). Same selection as the player's (`engine/notes.ts`).
- **Build steps fold:** a stop whose content the next stop in its scene keeps (it only adds a label, a node, a line on a chart) is folded into it, notes and all (`scripts/slides-plan.ts`: under 10% of its content changes). news-digest's 73 stops make 56 slides. `--builds` keeps every stop; `--threshold` moves the line.
- **Formats:** `index.html` is a deck that needs only its images (←/→, `s` notes, `#n` links) and prints one slide a page; `deck.pdf` is printed from it; `deck.pptx` (pptxgenjs) carries the notes, and Keynote and Google Slides open it. The slides are pictures: their text can't be edited.
- **Tests:** `scripts/slides-plan.test.ts`; `e2e/export.e2e.ts` runs the script and checks the stills, every narration line landing on one slide, the PDF's pages, the PowerPoint's notes and the HTML deck's paging.

## A single-file player

```sh
bun scripts/build.ts --edit news-digest --single [--out out/web-news-digest.html]
```

- **One `.html`, no server:** double-click it (`file://`), host it anywhere, or hand it to a host with strict rules (a Claude artifact). The folder build can't do that: browsers block module scripts and `fetch` from `file://`.
- **The code** is one inline `<script type="module">` (`codeSplitting: false` folds the lazily loaded scenes in) with the CSS inline and the fonts as `data:` URLs (`vite.config.ts`, `DEMO_REEL_SINGLE`). `--out` without `.html` gets it added.
- **The data** (every footage file the manifests name, `captions.json`, `mix.mp3`, `effects.mp3`) is embedded as base64 in a `<script type="application/json">`, keyed by the URL the player fetches (`footage/<project>/a.png`). A small shim ahead of the code (`scripts/single-shim.ts`) answers `fetch` for those relative URLs, 404s the other relative ones, and passes absolute URLs on. An `<audio>` given an embedded URL plays it from a blob, so no app code differs from the folder build.
- **Reused footage:** footage is named by project (`footageUrl(name)`), so a timeline reusing another project's scenes loads that project's footage. Both builds ship the footage of every project whose modules the bundle holds (`vite.config.ts` lists them, `scripts/bundled-projects.ts` decides; only a project with `footage/manifest.json` contributes).
- **Size:** base64 adds a third. news-digest is about 36 MB, over the 16 MiB a Claude artifact's page can be (the build warns, and warns again for an edit with clips, whose frames would all be embedded). It plays from `file://` and any host regardless.
- **Tests:** `scripts/single.test.ts`, `scripts/bundled-projects.test.ts`, `scripts/build.test.ts` (a real build); `e2e/single.e2e.ts` opens the file from `file://` and under an artifact's CSP.

## Toolbox

- `util.ts`: `clamp, lerp, remap, smoothstep, ease.*` (incl. `spring`, `outBack`), `prog(t, a, b, ease)`, `keys(t, [[t, v, ease], ...])`, `mulberry32`, `frameIdx`.
- `beats.ts`: `beat(t, in, out)` (a callout's presence), `union`, `grow`.
- `draw.ts`: `backdrop`, `browserWindow`, `cursor`, `clickRipple`, `highlight`, `label(g, box, text, p, side, sub, align)`, `chip`, `polaroid`, `chapterTag`, `roundRect`.
- `slide.ts`: slide-style primitives for non-footage scenes: `card`, `button`, `wrap`, `copy`, `rise`, `emoji`, `camAt` / `applyCam`, a hand-drawn `arrow`.
- `view.ts`: `AppView`, `cameraAt`, `cameraCues`, `insideWindow`, `mixCamera`.
- `palette.ts`: `C` (colour tokens), `FONT`, `font('display' | 'sans' | 'text', px, weight)`, `withAlpha`, `shadow`, `applyTheme`.
