# Qiyami — treatment (edit `qiyami`)

A 47-second reel of [Qiyami](https://www.qiyami.com): a free, in-browser prayer-time calculator that also shows Islamic midnight and the last third of the night (Tahajjud). A title card, one recorded session played in beats, and an end card, in the default indigo theme (the product's own logo is indigo-to-violet). Covers only what is specific to this reel; the house style is in [`docs/STYLE.md`](../../docs/STYLE.md).

## Story

| Scene | Beat | Narration | Footage |
|---|---|---|---|
| `title` (`title-card`) | polaroids of the countdown and the Tahajjud cards, "Qiyami", "prayer times and the last third of the night", "Free · in your browser" | "Qiyami shows today's prayer times, and when the last third of the night begins." | clip `session`, mark `start` |
| `session` (`scenes/session.ts`) | push in on the countdown card ("Live countdown") | "Today's prayers on one screen, with a live countdown to the next." | `start` → `countdown` (held 4 s) |
| | the Islamic-midnight / last-third cards ("Last third of the night") | "It also finds the last third of the night, for Tahajjud." | `countdown` → `night` |
| | the Qur'an and hadith panel | "Below, the Qur'an and hadith behind night prayer." | `night` → `verses` |
| | settings sheet opens, Hanafi picked | "Pick a calculation method and Asr school." | `verses` → `settings` → `city` |
| | a city typed and chosen | "Or search any city to fix your location." | `city` → `save` |
| | saved; the page re-times itself ("New city, new times") | "Save, and every time follows." | `save` → `saved` (held 3.2 s) |
| `end` (`end-card`) | the saved page, four chips | "That's Qiyami, at qiyami dot com." | clip `session`, mark `saved` |

## Honesty notes

- **Live data, filmed once.** The times, weather and countdown are the site's own for the day filmed (2026-11-06). The countdown runs on the recorder's virtual clock, so it ticks at real speed. Nothing is sped up.
- **Location.** The site guesses by IP; its own header reads "(IP Approximate Location)" at the start. The city override (San Jose, CA) is chosen through the real settings sheet during the recording. Switching Asr from Shafi to Hanafi is also done in the sheet; Asr's time moved only slightly and is not called out.
- **Why San Jose, not a faraway city.** Tried Istanbul first: the site shows a city's prayer times in the *browser's* time zone (Fajr read "7:23 PM"), which would mislead a viewer. San Jose matches the filming machine's zone (PST), so every time on screen is the true local time. Worth telling the site's owner.
- **Why not a wet city (Seattle, "Light Drizzle").** With rain, drizzle or snow the site's backdrop becomes an animation that flickers from frame to frame under the frame-by-frame recorder. The capture throws if the weather after saving is wet, so a retake never records it; the city has to be one that is dry that day.
- **The city-search list shows the first result twice** (the site's own duplicate entry). It is on screen for a moment before the save and left as the app draws it.
- **The app re-runs its city search after a pick**, so the capture waits 2 s before pressing Save, or the choice is dropped.
- Nothing on the page is hidden or edited. A React hydration warning (#418) appears in the console; it has no visible effect.
- `jumps` flags four frames, all the app's own instant changes: the settings sheet opening (27.7 s, dims the page), three typing/option frames, and the sheet closing on Save (35.5 s).

## Pronunciation

The narrator (Kokoro `af_heart`) mangles Arabic words, so the spoken lines respell them; the screen keeps the real spelling. Chosen by reading `phonemizer`'s IPA for each candidate, one stressed vowel per word:

| On screen | Spoken as | IPA the voice gets |
|---|---|---|
| Qiyami | Keeyaami | kˈiːjɑːmi (was kɪjˈɑːmi) |
| Tahajjud | Tahhajjood | tˈɑːhɐdʒˌuːd (was tˈæhɐdʒˌʌd) |
| Qur'an | Kuhrahn | kˈuːɹɑːn (was kwɚɹˈæn) |
| hadith | Haadeeth | hˈɑːdiːθ (was hˈædɪθ) |
| Asr | Ahsir | ˈɑːsɪɹ (was ˈæsɚ, "ass-er") |

Not checked by ear; re-listen and adjust the respelling if one still sounds off.

## Left out

The "Use precise GPS" button (it needs a browser permission prompt), the temperature unit, calculation-method dropdown and Ramadan-start dropdown (shown in the sheet, not changed), and the footer credit.

## Capture needs

Network access to qiyami.com plus its geocoding and weather APIs. `bun projects/qiyami/capture.ts` takes about 2.5 minutes, and throws if the header does not read the override city after saving, or if the weather there is wet.
