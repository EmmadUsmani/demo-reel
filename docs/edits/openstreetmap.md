# OpenStreetMap — treatment (edit `openstreetmap`)

A 34-second reel of [OpenStreetMap](https://www.openstreetmap.org), the free map of the world made by its community. A **recorded session**: a title card, one clip played in beats, and an end card, in the default theme.

## Story

| Scene | Beat | Narration | Footage |
|---|---|---|---|
| `title` (`title-card`) | polaroids of the pinned result and of the street map, "OpenStreetMap", "the free map of the world", "Open data · made by its community" | "OpenStreetMap is a free map of the world, made by its community." | clip `session`, marks `found`, `done` |
| `session` (`openstreetmap-session`) | wide on the map, a search typed ("Search any place") | "Type a place name, and press Enter." | `start` → `results` |
| | the map flies to the city and pins it ("A pin on the result") | "The map flies to the city and drops a pin on it." | `results` → `found` (held 3.4 s) |
| | three zoom clicks ("Zoom in") | "Zoom in a level at a time, all the way down to the streets." | `found` → `zoomed` |
| | street level, the credit line ("Mapped by contributors") | "Every street here is open data, mapped by its community." | `zoomed` → `done` (held 4.2 s) |
| `end` (`end-card`) | the street map, "OpenStreetMap", "open data, at openstreetmap.org", four chips | "That's OpenStreetMap. Thanks for watching!" | clip `session`, mark `done` |

## What is specific to this reel

- **Everything is the live site**, signed out, in a fresh browser context. The map tiles come from OpenStreetMap's own tile servers, so a take needs a network and looks slightly different as the map is edited.
- **The result's own page is never opened.** Clicking a search result opens the object's page (a relation id, changeset ids and a table of raw tags). That's internal data, so the session stays on the results list and the pinned map.
- **The welcome panel is left as a first-time visitor sees it**, until the search replaces it.
- **The credit label** points at the map's own "© OpenStreetMap contributors" attribution; the claim "Credited on every map" is the site's attribution practice, not the reel's.
- **`jumps` flags two frames at 9.7 s, both legitimate:** when Enter lands, the sidebar switches from the welcome panel to the results instantly and the map starts its fly-to. Map pans and zooms are the site's own animation, so frame-to-frame change is high there by nature.
- **The pin close-up** shows a sliver of the sidebar's red result marker at the left edge; it is the site's own UI.
- **The MP4's frames match the stills at about 42 dB** on a map-tile frame (dense detail at x264 CRF 16), under the 45 dB figure for flat frames; the frame was read at full size. The audio lag is 0.
- Not sped up. Left out: layers, directions, editing, the object pages, and logging in.

## Capture needs

- Network access to openstreetmap.org and its tile servers.
- `bun capture/openstreetmap.ts` takes about 70 seconds and records 14 s.
