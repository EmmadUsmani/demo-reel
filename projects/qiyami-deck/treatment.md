# Qiyami: the slides (edit `qiyami-deck`)

The [qiyami](../qiyami/treatment.md) reel as **six narrated slides** (`mode: 'slides'`): the player opens in slides mode with its soundtrack, and each step forward plays the real recording and its narration to the next slide and holds there. The narration can be turned off (`n`, the effects alone) and the sound muted (`m`); the presenter view (`#presenter`) shows each slide's speaker notes. Made entirely from qiyami's scenes and footage; there is nothing new to capture and no new visual.

## Slides

| # | Scene | Stop | Said on the way (the reel's lines) | Notes (for a presenter) |
|---|---|---|---|---|
| 1 | `title` (`title-card`) | its one stop | "Qiyami shows today's prayer times, and when the last third of the night begins." | what Qiyami is: free, in the browser, prayer times plus midnight and the last third |
| 2 | `session` | the countdown, labelled "Live countdown" | "Today's prayers on one screen, with a live countdown to the next." | today's times on one screen, with a live countdown |
| 3 | `session` | the night cards, labelled "Last third of the night" | "It also finds the last third of the night, for Tahajjud." | Islamic midnight and the last third of the night, for Tahajjud |
| 4 | `session` | the Qur'an and hadith panel | "Below, the Qur'an and hadith behind night prayer." | the verses and hadith on night prayer, beside the times |
| 5 | `session` | the saved page, labelled "New city, new times" | the settings, city and save lines, as the sheet plays through | calculation method, Asr school, a city override |
| 6 | `end` (`end-card`) | its one stop | "That's Qiyami, at qiyami.com." | the closing line: free at qiyami.com |

## What is specific to this edit

- **Condensed.** The reel's six session beats become four slides: the settings sheet, the Asr pick and the city search play through on the step into slide 5 (with their three lines) and are not held.
- **Each line ends before its slide.** A step stops the voice at its stop, so the beats hold longer than the reel's (`scenes/session.ts`: countdown 5.2 s, night 4.8, verses 4.0, saved 3.6; the title card 6.4 s), and each stop sits 0.6 s before its beat's hold ends, with the label fully in. `scripts/audio.ts` refuses the mix if a stop falls inside a line; at the reel's holds it would (the countdown line, by 0.33 s). Every line now ends at least 0.75 s before its stop.
- **The narration is the reel's**, voiced the same (the respellings in qiyami's treatment); the notes are authored per slide for a presenter and never spoken.
- **No ambient motion.** A held slide of the session is a still of the recording (the countdown does not tick while a slide is held); the cards' backdrops keep drifting.
- **One file for an artifact.** `bun scripts/build.ts --edit qiyami-deck --single` embeds the recording compacted: of its 1250 frames, the 76 that differ visibly from the last frame kept (by more than 16/255 on some channel of some pixel) go in as WebP, and every other frame shows the last one kept. The site's sky backdrop drifts by under 12 levels from frame to frame, so a held stretch shows its first frame; the countdown's ticks, the sheet, the typing and the save are all kept. About 15 MB.
- **Honesty notes** are qiyami's: live data filmed on 2026-11-06, San Jose chosen in the real settings sheet, nothing hidden or edited.
- **Footage** is qiyami's (`footage/qiyami`); this project has no `footage/` of its own.
