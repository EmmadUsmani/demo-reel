# Hoppscotch — treatment (edit `hoppscotch`)

A 38-second reel of [Hoppscotch](https://hoppscotch.io), the open-source API client. A **recorded session**: a title card, one clip played in beats, and an end card, in the default theme.

## Story

| Scene | Beat | Narration | Footage |
|---|---|---|---|
| `title` (`title-card`) | polaroids of the parameter table and of the response, "Hoppscotch", "an open-source API client" | "Hoppscotch is an open-source client for trying out web APIs." | clip `session`, marks `param2`, `sent2` |
| `session` (`scenes/session.ts`) | wide on the pre-filled request ("The request") | "Here's a request, already pointed at a public echo service." | `start` (held 4.2 s) |
| | a query parameter typed in ("Query parameter") | "Add a query parameter: a name, then a value." | `start` → `param1` |
| | Send pressed | "Press Send." | `param1` → `sent1` |
| | the response ("It worked", then "Echoed back") | "A status of two hundred, so the request worked." / "And your parameter is echoed back under args." | `sent1` (held 3.0 s + 2.9 s) |
| | a second parameter, sent again; both echoed ("Both of them") | "Add a second one, and send again." / "Now both parameters come back, just as sent." | `sent1` → `param2` → `sent2` (held 3.2 s) |
| `end` (`end-card`) | the finished request, "Hoppscotch", "open source, at hoppscotch.io", four chips | "That's Hoppscotch. Thanks for watching!" | clip `session`, mark `sent2` |

## What is specific to this reel

- **The request goes to Hoppscotch's own public echo endpoint** (`echo.hoppscotch.io`, pre-filled in the app), which mirrors the request back. Nothing is mocked: the status, time, size and JSON are the real response from that call.
- **Only the top of the response is ever on screen.** Below the first dozen lines the echo lists this headless browser's request headers (`accept`, `host`, `sec-ch-ua`, `referer`...). They hold no account data or IP address, but they are noise, so the capture never scrolls the response and the camera stays in the upper part. Those first header lines are visible in the wide frames.
- **Signed out, nothing saved.** The app is used as a visitor, in a fresh browser context; the "Save My Workspace" and "Login" buttons are the product's own and are left alone.
- **The "Time" reading is the app's own** and varies take to take (it shows long decimals). It is left as the app shows it.
- **The status label ring** wraps the whole Status / Time / Size row, from the smallest element that holds all three.
- **The opening label** ("The request", under the URL) partly covers the tab row beneath it for the first few seconds; it was left, as every placement covers some of the page.
- **`jumps` reports no pops.** Not sped up. Left out: headers, body, authorization, collections, GraphQL and realtime tabs.
- **The MP4's frames match the stills at 43 dB** on a dense-text frame (x264 CRF 16), slightly under the 45 dB guide figure for flat frames; the frame was read at full size and is sharp.

## Capture needs

- Network access to hoppscotch.io and echo.hoppscotch.io.
- `bun projects/hoppscotch/capture.ts` takes about 90 seconds, records 14 s, and throws if the echo doesn't reflect a parameter.
