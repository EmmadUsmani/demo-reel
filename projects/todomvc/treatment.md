# TodoMVC — treatment (edit `todomvc`)

A 27-second reel of [TodoMVC](https://todomvc.com)'s React app: the open-source reference todo app that is built the same way in many web frameworks. It's a worked example of a **recorded session**: a title card, one clip played in four beats, and an end card. It is in the house style ([`docs/STYLE.md`](../../docs/STYLE.md)); this file covers only what is specific to this reel.

## Story

| Scene | Beat | Narration | Footage |
|---|---|---|---|
| `title` (`title-card`) | polaroids of the list and the filter bar, "TodoMVC", "one todo app, in every framework", an "Open source · the React version" chip | "TodoMVC is one small todo app, built in many web frameworks." | clip `session`, marks `added`, `filtered` |
| `session` (`scenes/session.ts`) | wide on the empty app, push in; three todos typed and entered | "Type what needs doing, and press Enter." | clip `session`, `start` → `added` |
| | held on the list ("Added with Enter") | "Each one joins the list, with a count of what's left." | `added` (held 2 s) |
| | the first todo ticked off ("Done, crossed out") | "Tick one off when it's done." | `added` → `done` |
| | the Active filter ("Only what's left"), then pull back | "Then filter to what's still open." | `done` → `filtered` (held 1.6 s) → end |
| `end` (`end-card`) | the filtered app, "TodoMVC", "open source, at todomvc.com", four chips | "That's TodoMVC. Thanks for watching!" | clip `session`, mark `filtered` |

## What is specific to this reel

- **Theme.** The edit wears TodoMVC's own brick red (`TODOMVC_RED` in `timeline.ts`) instead of the default indigo, to show per-edit theming.
- **The site's "learn" sidebar is removed before filming.** It's the TodoMVC site's documentation panel, not the app, so the capture removes it and the app sits centred. Nothing in the app itself is touched.
- **Fresh state every take.** A new browser context means an empty list; the script throws if it isn't.
- **The pointer leaves the filter after clicking it**, so the "Only what's left" label below it is clear.
- **`jumps` flags four frames, all legitimate:** the three Enter presses and the Active click. TodoMVC updates its list instantly, with no transition.

## Capture needs

- Network access to todomvc.com (or `BASE_URL` pointing at a local build of the React example).
- `bun projects/todomvc/capture.ts` runs in about 40 seconds and fails if the list isn't empty at the start, the todo doesn't complete, or the filter doesn't show two items.
