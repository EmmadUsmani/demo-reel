# House style

Every video this engine makes follows these rules. Each edit's own treatment (`projects/<name>/treatment.md`) adds only what is specific to that edit. Where this guide and a treatment disagree, the treatment wins for that edit, and it should say why.

## What these videos are

Short product demos, 15 seconds to a few minutes, made **from the real running app**. Every pixel of UI on screen is the app itself: screenshots, or a frame-by-frame recording of its own motion. The renderer adds only what a screen recording can't:

- a calm camera that pushes into the part being talked about;
- a cursor that clicks real controls;
- labels pinned to the exact element they describe;
- a narrator.

They're often watched without sound on the first play. So the picture has to tell the story alone, and the narration makes it warmer and faster to follow.

## Honesty rules (non-negotiable)

- **Only real footage.** Never mock UI, redraw a screen or invent a state. If a beat needs a state the app doesn't show on its own (a filled form, a hover, a seeded record), produce it in the app: through the UI, through demo data, or on a filming branch. Anything the renderer replays (a scrolling marquee) is lifted out of the real page, never rebuilt.
- **Labels sit on the real element.** Place them from the captured box, never from hand-placed coordinates. Each one says what the element does in a few words, in the product's voice, and makes no claim the product doesn't make itself.
- **Say what isn't real or isn't live yet.**
  - An unreleased build is "coming soon", not "now in": say it on the title, on the end card's pill, and in the narration.
  - Hand-curated demo picks are called hand-curated.
  - A process that took a minute is labelled "Sped up".
  - Nobody watching should come away believing something works that doesn't.
- **Nothing a user shouldn't see.** No SQL, stack traces, raw ids in prose, real personal data, credentials, secrets or dev-only widgets.
  - `capture/lib.ts` hides common chat bubbles, cookie banners and dev error overlays; `launch({ hide })` adds a site's own.
  - When the app's own output can go either way (an AI answer), screen it in the capture script and re-run until it is showable.
- **No scaffolding on screen.** Drop step counters, debug badges and docs sidebars that aren't the product. If the page shows them, hide them for filming (or dismiss them through the UI), and note it in the treatment.

## Picture

### Frame and backdrop
- 1920×1080 logical, rendered at 60 fps. `--scale 2` gives a true 4K render of the same layout.
- The backdrop is a warm off-white under three soft washes (top left, top right, bottom) that breathe very slowly so a held frame is never dead (`backdrop()` in `draw.ts`). The washes take the theme's colours.

### The app window
- A plain white browser window, 18 px radius, with a soft shadow tinted by the theme, and traffic lights.
- The address bar reads like production: `host/path`, without the protocol, `www.` or the dev host (`source.host` maps `localhost:3000` to the product's domain). Long ids get elided.
- The capture viewport is 1440×900 at DPR 2. Zoomed out, the app plays at 1:1 inside the window; close-ups go up to 2× and stay sharp.

### Colour
The theme (`palette.ts`): an accent scale for rings, dots, ripples and display type, ink `#101828` for titles, and a near-black label pill. The default is a neutral indigo. When a product has its own brand colour, give its edit a theme built from it (`todomvc` wears TodoMVC's red). Never introduce a colour that fights the product's own.

### Type
- **Instrument Serif** (`font('display')`): chapter titles.
- **Inter** (`'sans'`): the big names on title and end cards.
- **Inter** (`'text'`): labels and chrome.

Both are SIL OFL fonts installed from npm; a theme can swap in others with `fontFiles`. Label text is at least 26 px at 1080p.

### Callouts
- An accent ring (3.5 px with a soft glow) around the element, drawn in with a slight settle.
- A label pill beside it: white Inter on the label ink, with an accent dot, an optional lighter second line, and a faint hairline so it still reads over a dark app (`highlight()`, `label()`).
- One idea per label. Labels arrive with a `pop` sound and leave before the camera moves on.
- Keep them off the controls the cursor is about to use, off the page's own text, and out from under the cursor.

### Cursor
The macOS arrow, scaled with the camera the way a real screen recording would be (`√magnification`). A click squeezes it and leaves an accent ripple. In recorded clips the cursor is drawn exactly where the real pointer was, frame by frame.

### Motifs
Polaroid cards cut from real footage, the app's own chip style (for lists of features, on the end card), the tape strip, and a chapter card (display title, one line, a taped polaroid of the section's first frame).

### Structure of an edit
1. **Title card** (about 4–5 s): polaroids spring in, the name, one line of what it is, and a chip ("Open source", "Coming soon").
2. **Beats:** one idea each, in the order a person would actually use the feature. Consecutive clips of one recorded session hard-cut on matching framings. Sections are separated by chapter cards that crossfade.
3. **End card** (about 5–6 s): a polaroid, the name, one line, 3–4 chips, and a status pill when it applies. The narration names the product once more.

## Motion

- **Calm and confident.** Use strong eases: `inOutQuart` for the camera, springs (`ease.spring`, `outBack`) for arrivals, `outExpo` for type rising in.
- **No** whip pans, spins, shake, glitch, zoom-blur, or anything that draws attention to the editing.
- Camera moves go wide → push in on the thing being talked about → hold long enough to read → move on. Pans between close-ups "hop" slightly out and back in.
- A close-up never shows past the edge of the window (`insideWindow()` in `view.ts`).
- Hold every beat for as long as its narration takes. The timeline lays itself out from the scenes' own durations, so holding a beat moves everything after it.
- A recorded clip plays at 1× by default. Speeding up (typing, repeated steps) is fine when the action is obvious; if it changes how long something really takes, say so on screen.
- Crossfade between sections (`overlap` 0.4–0.5 s). Hard-cut between consecutive clips of one session, keeping the same camera across the cut.
- A scene whose content should leave before a crossfade animates its own exit.
- The bar is "no pops": `render.ts jumps` flags any frame that changes far more than its neighbours.

## Sound

**No music, ever.** The soundtrack is a narrator plus quiet, synthesised UI sounds, and nothing else.

### Narration
- **Voice:** Kokoro `af_heart` at speed 1, voiced locally (`scripts/audio.ts`). Keep it for every edit unless a treatment says otherwise.
- **Writing:**
  - One short, plain sentence per beat, conversational and in the second person ("Type what needs doing, and press Enter."). No marketing superlatives.
  - Describe what the viewer is seeing at that moment. Clicks land on the word they illustrate.
- **Write for the ear, because TTS reads literally:**
  - numbers in words ("five point one five million");
  - acronyms dotted ("A.P.I.", "H.M.R.");
  - names respelled until they sound right, while the screen keeps the real spelling.
  - Check a doubtful word with the `phonemizer` package before respelling it, and re-listen after.
- A line starts on its beat (`at`) and must finish before `until`. `audio.ts` refuses to mix a line that overruns. Shorten the line or hold the beat; never speed up the voice to fit.

### Effects
Quiet UI sounds, each tied to a motion (`Cue` kinds in `engine/scene.ts`):

| Cue | What it sounds like | When it plays |
|---|---|---|
| `click` | press and release | every recorded press |
| `key` | a tap | every keystroke |
| `wheel` | a notch | each scroll step |
| `pop` | a soft blip | a label arriving |
| `tick` | a woodblock | a chip |
| `chime` | two bell notes | the title |
| `swish` | paper | a polaroid flying |
| `land` | a low thump | a window or answer settling |
| `drop` | a thunk | an item dropped |
| `whoosh-*` | air | a camera move (`cameraCues`) |

They are synthesised, so the soundtrack is as deterministic as the frames.

### Mix
- Effects sit about 13 LU under the voice and duck about 5 dB further while it speaks.
- The mix is normalised to −16 LUFS integrated, with true peak under −1.5 dBFS.

## Pacing and length

- A feature reel is 20–60 s. A full product demo can run 3 minutes or more if every beat earns its place.
- Open on the product's name within the first 5 s. End within about 5 s of the last idea.
- Leave out optional beats rather than rushing through them, and say in the treatment what was left out.
