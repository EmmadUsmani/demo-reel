# Vite — treatment (edit `vite`)

A 19-second reel of [Vite](https://vite.dev)'s homepage, the open-source frontend build tool. It's a worked example of a **shots-only reel**: one full-page plate that the renderer pushes into and scrolls, between a title card and an end card, in the engine's **default theme**. It is in the house style ([`docs/STYLE.md`](../STYLE.md)); this file covers only what is specific to this reel.

## Story

| Scene | Beat | Narration | Footage |
|---|---|---|---|
| `title` (`title-card`) | polaroids of the headline and the install command, "Vite", "the build tool for the web", an "Open source · MIT licensed" chip | "Vite is an open-source build tool for the web." | shot `page`, boxes `headline`, `install` |
| `page` (`vite-page`) | wide, then a push into the hero; the install command called out ("One command to start") | "Vite's homepage starts with the one command that makes a project." | shot `page`, scrolled to 0 |
| | back out, scroll down to "Redefining developer experience" ("What it's built for") | "Further down: an instant dev server, and updates as you save." | shot `page`, scrolled to 1000 |
| `end` (`end-card`) | the headline, "Vite", "open source, at vite.dev", three chips | "That's Vite. Thanks for watching!" | shot `page`, box `headline` |

## What is specific to this reel

- **The scroll is the renderer's, over one full-page plate.** That's faithful here because the page has no sticky or fixed elements in view (checked before filming); a sticky header would have needed a recorded clip instead. Wheel cues are derived from the scroll curve, one notch per 100 px.
- **The promo banner is dismissed through its own close button**, as a visitor would, before the plate is shot.
- **The hero illustration animates on the real page.** The plate freezes it on whatever frame the shot lands on.
- **Dark app, light labels.** This reel is why the label pill has a faint light hairline: without it, the near-black pill disappears into Vite's dark page.
- **Content is the live site.** Re-capturing later films whatever vite.dev shows then; check the stills and the label claims again.

## Capture needs

- Network access to vite.dev (or `BASE_URL`).
- `bun capture/vite.ts` runs in about 15 seconds and fails if the banner can't be dismissed or a box isn't found.
