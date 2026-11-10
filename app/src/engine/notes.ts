// Which speaker notes a slide shows, for the player's notes and presenter view and for the static deck
// (scripts/slides.ts): the notes a scene authors (Scene.notes()), else the narration said on the way to
// the slide. Pure, so it is tested without a browser (notes.test.ts).

/** A line with the time it starts: an authored note, or a narration line as it should read on screen. */
export type Spoken = { at: number; text: string };
export type NoteSource = { authored: Spoken[]; spoken: Spoken[] };

/**
 * The lines on the way to slide `k` (0-based): after the previous stop (the first slide counts from
 * `from`), up to and including this stop. With `tail`, the last slide also takes any line after it.
 */
function onTheWay(lines: Spoken[], stops: number[], from: number, k: number, tail: boolean): Spoken[] {
  const previous = stops[k - 1];
  const last = tail && k === stops.length - 1;
  return lines.filter((l) => (previous === undefined ? l.at > from - 1e-6 : l.at > previous) && (last || l.at <= stops[k]!));
}

/** The notes of slide `k`: the authored ones when it has any, else the narration. Before the first slide (k < 0) there are none. */
export function slideNotes(source: NoteSource, stops: number[], from: number, k: number, tail = false): string[] {
  if (k < 0) return [];
  const authored = onTheWay(source.authored, stops, from, k, tail);
  return (authored.length ? authored : onTheWay(source.spoken, stops, from, k, tail)).map((l) => l.text);
}
