# Excalidraw — treatment (edit `excalidraw`)

A 48-second reel of [Excalidraw](https://excalidraw.com), the open-source virtual whiteboard that draws like a hand sketch. It is a **recorded session** with real drawing in it (drags on a canvas, typing into shapes): a title card, one clip played in beats, and an end card, in the default theme ([`docs/STYLE.md`](../STYLE.md) covers the rest).

## Story

| Scene | Beat | Narration | Footage |
|---|---|---|---|
| `title` (`title-card`) | polaroids of the finished flow, "Excalidraw", "a whiteboard that looks hand-drawn", "Open source · MIT licensed" | "Excalidraw is an open-source whiteboard for sketching diagrams." | clip `session`, mark `done` |
| `session` (`excalidraw-session`) | close on the toolbar, the rectangle tool picked ("Pick a shape") | "Pick a tool. Each one has a single-key shortcut." | `start` → `tool` (held 3.6 s) |
| | a rectangle dragged out and labelled "Idea" ("Type inside any shape") | "Drag out the shape, press Enter, and type a label." | `tool` → `idea` (held 2.6 s) |
| | a diamond ("Sketch") and an ellipse ("Share") drawn the same way | "Diamonds and ellipses work the same way." / "Three shapes, ready to connect." | `idea` → `share` (held 2.6 s) |
| | the arrow tool, then an arrow from shape to shape ("A linking arrow") | "Pick the arrow, and drag from one shape to the next." | `share` → `arrow` (held 3.2 s) |
| | the second arrow, the selection dropped, a push in on the finished flow | "A clean flow, and it all stays in your browser." | `arrow` → `done` (held 4 s) |
| `end` (`end-card`) | the finished canvas, "Excalidraw", "open source, at excalidraw.com", four chips | "That's Excalidraw. Thanks for watching!" | clip `session`, mark `done` |

## What is specific to this reel

- **The "Try Excalidraw+" promo button is hidden** for filming (`launch({ hide })`). It's an upsell for a paid product, not the whiteboard. Nothing else is touched.
- **Fresh state every take.** A new browser context means an empty canvas with the welcome screen, which the first shape dismisses by itself.
- **Shape boxes come from invisible markers.** Shapes are canvas pixels, so the capture drops transparent, non-interactive `div`s at the exact rectangle each drag drew and records their boxes. They add no pixels to the footage.
- **Layout clears the style panel.** Picking a tool opens Excalidraw's style panel down the left edge (about 215 px wide). The first take drew under it and lost the first shape, so the shapes start to its right.
- **"Saved in your browser"** is Excalidraw's own wording (its welcome screen says drawings are saved in the browser's storage); the narration and label repeat it and claim nothing more.
- **The arrows' attachment** is shown by the arrowheads ending on the shapes; the label says "Ends attach to each shape" and nothing about following them when moved, because the recording doesn't show that.
- **`jumps` reports no pops.**
- Not sped up. Left out: colours, text tool, export and sharing, to keep to one idea per beat.

## Capture needs

- Network access to excalidraw.com (or `BASE_URL` pointing at a self-hosted build).
- `bun capture/excalidraw.ts` takes about 90 seconds and records 21 s of footage.
