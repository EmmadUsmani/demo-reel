// The lines the player shows as captions and falls back on as speaker notes: the narration the edit
// declares, and the timed captions scripts/audio.ts writes next to the soundtrack.
import type { Engine } from '../engine/engine';
import type { Caption } from './moments';

/** The narration as written for the screen, each line held for its whole beat. */
export const narrationCaptions = (engine: Engine): Caption[] => engine.narration().map((line) => ({ at: line.at, end: line.until, text: line.caption ?? line.text }));

/** The authored speaker notes (Scene.notes()), in video time. */
export const authoredNotes = (engine: Engine) => engine.notes().map(({ at, text }) => ({ at, text }));

/** scripts/audio.ts times each caption to its speech: audio/<edit>/captions.json, or none when it hasn't run. */
export async function fetchCaptions(edit: string): Promise<Caption[] | undefined> {
  try {
    const response = await fetch(`audio/${edit}/captions.json`);
    if (response.ok) return (await response.json()) as Caption[];
  } catch { /* keep the beat-long captions */ }
  return undefined;
}
