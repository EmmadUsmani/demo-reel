# News Digest: the deck (edit `news-digest-deck`)

An eight-slide **pilot of the deck mode** (`deck: true`): the player opens in slides mode, plays silently, and a presenter view (`#presenter`) shows each slide's speaker notes. It is made entirely from [news-digest](../news-digest/treatment.md)'s own scenes and footage; there is nothing new to capture and no new visual. It exists to prove the deck features end to end, not to be a full presentation.

## Slides

| # | Scene | Stop | Notes (what the presenter says) |
|---|---|---|---|
| 1 | `title` (`title-card`) | its one stop | what News Digest is; every line of code written by an agent |
| 2 | `product` | beat 1 | the morning edition: a brief, top stories, posts from X and Bluesky |
| 3 | `product` | beat 2 | the admin console: sources, spend, edition cost |
| 4 | `product` | beat 3 | that is the product; the interesting part is how it is built |
| 5 | `factory` (`chapter`) | its one stop | one Codex agent in a loop on one VM, on a $100/month plan |
| 6 | `guardrails` | its one stop | the four fences outside the model |
| 7 | `observe` | the built diagram, packets flowing | logs and metrics on the same VM, Grafana on top; the packets are live |
| 8 | `end` (`end-card`) | its one stop | the closing line of the news-digest script |

## What is specific to this deck

- **Reused scenes, authored notes.** `scenes/product.ts`, `scenes/guardrails.ts` and `scenes/observe.ts` extend news-digest's scene and add `notes()`, each note at a stop of the scene. The three cards take their notes from the `notes` param. Every slide has authored notes; none falls back to narration.
- **Ambient motion.** The cards' backdrops and bobbing polaroids, `guardrails`' pulsing rings, and `observe`'s flowing packets run on `Frame.ambient`, so a held slide keeps moving while the presenter talks (and the progress bar says whether the slide has finished playing). `observe` is the slide where it shows most: its one stop is the built diagram, held with packets flowing along every edge; the dashboards that follow in the video fly in on the step to the closing slide.
- **No narration, no soundtrack.** The cards have no `line`; the reused `Narrated` scenes still hold each beat for its measured line (`vo-lengths.json`), so stepping plays a whole beat. That pacing is news-digest's, kept for the pilot.
- **Numbers** are the ones news-digest's script states ($100 a month, one VM, one agent).
- **Footage** is news-digest's (`footage/news-digest`); this project has no `footage/` of its own.
