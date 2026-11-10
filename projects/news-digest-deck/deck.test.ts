// The pilot deck, end to end without a browser: it is a deck, it has the slides its treatment lists, every
// slide has authored notes (none falls back to narration), and each note lands on the slide it is for.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { slideNotes } from '@engine/notes';
import { installBrowser, project } from '../testing/browser';

let restore: () => void;
beforeAll(() => { restore = installBrowser(); });
afterAll(() => restore());

/** What each slide's notes should be: the slide's scene, and what its notes begin with. */
const SLIDES: [scene: string, begins: string][] = [
  ['title', 'This is News Digest'],
  ['product', 'Every morning at seven'],
  ['product', 'Behind it is an admin console'],
  ['product', 'That is the whole product'],
  ['factory', 'Now the factory'],
  ['guardrails', 'The agent works inside fences'],
  ['end', 'One VM, one agent'],
];

describe('news-digest-deck', () => {
  let loaded: Awaited<ReturnType<typeof project>>;
  beforeAll(async () => { loaded = await project('news-digest-deck'); });
  const stops = () => loaded.engine.stops();
  const authored = () => loaded.engine.notes().map(({ at, text }) => ({ at, text }));
  const spoken = () => loaded.engine.narration().map(({ at, text, caption }) => ({ at, text: caption ?? text }));
  const notesOf = (k: number) => slideNotes({ authored: authored(), spoken: spoken() }, stops().map((s) => s.t), 0, k);

  test('is a deck', () => {
    expect(loaded.edit.deck).toBe(true);
  });

  test('has the slides its treatment lists: one stop each, on the scenes named', () => {
    expect(stops().map((s) => s.scene)).toEqual(SLIDES.map(([scene]) => scene));
    const table = readFileSync(path.join(import.meta.dir, 'treatment.md'), 'utf8').split('\n').filter((l) => /^\| \d+ \|/.test(l));
    expect(table.length).toBe(stops().length);
  });

  test('every slide has authored notes of one to three short sentences, and none is narration', () => {
    const narration = new Set(spoken().map((l) => l.text));
    stops().forEach((_, k) => {
      const notes = notesOf(k);
      expect(notes.length, `slide ${k + 1}`).toBe(1);
      expect(authored().some((n) => n.text === notes[0]), `slide ${k + 1} falls back to narration`).toBe(true);
      expect(narration.has(notes[0]!), `slide ${k + 1}`).toBe(false);
      expect(notes[0]!.match(/[.!?](\s|$)/g)!.length, `slide ${k + 1}`).toBeLessThanOrEqual(3);
    });
  });

  test('each note lands on the slide it is written for', () => {
    SLIDES.forEach(([, begins], k) => expect(notesOf(k)[0], `slide ${k + 1}`).toStartWith(begins));
  });

  test('every authored note is shown on some slide, once', () => {
    const shown = stops().flatMap((_, k) => notesOf(k));
    expect(shown.sort()).toEqual(authored().map((n) => n.text).sort());
  });

  test('the cards say nothing: the narration is only what the reused scenes hold', () => {
    const scenes = new Set(loaded.engine.narration().map((l) => l.scene));
    expect([...scenes].sort()).toEqual(['guardrails', 'product']);
  });
});
