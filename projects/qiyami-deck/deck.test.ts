// The Qiyami slides, end to end without a browser: a narrated deck (slides mode, with its soundtrack), the slides
// its treatment lists, authored notes on every slide (none falls back to narration), each note on its slide, and
// the reel's narration with each line on its way to a slide. scripts/audio.ts checks no stop cuts a line.
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
  ['title', 'Qiyami is a free prayer-time calculator'],
  ['session', 'The dashboard puts today’s prayer times'],
  ['session', 'It also works out Islamic midnight'],
  ['session', 'Below the times sit the Qur’an verses'],
  ['session', 'Settings pick a calculation method'],
  ['end', 'That is Qiyami'],
];

describe('qiyami-deck', () => {
  let loaded: Awaited<ReturnType<typeof project>>;
  beforeAll(async () => { loaded = await project('qiyami-deck'); });
  const stops = () => loaded.engine.stops();
  const authored = () => loaded.engine.notes().map(({ at, text }) => ({ at, text }));
  const spoken = () => loaded.engine.narration().map(({ at, text, caption }) => ({ at, text: caption ?? text }));
  const notesOf = (k: number) => slideNotes({ authored: authored(), spoken: spoken() }, stops().map((s) => s.t), 0, k);

  test('opens in slides mode with its soundtrack: a narrated deck, not a silent one', () => {
    expect(loaded.edit.mode).toBe('slides');
    expect(loaded.edit.deck).toBeUndefined();
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

  test("the narration is the reel's: the same lines, in the same order", async () => {
    const reel = await project('qiyami');
    const said = (lines: { text: string }[]) => lines.map((l) => l.text);
    expect(said(loaded.engine.narration())).toEqual(said(reel.engine.narration()));
  });

  test('every line starts on the way to a slide, after the slide before it', () => {
    const at = stops().map((s) => s.t);
    for (const line of loaded.engine.narration()) {
      const slide = at.findIndex((t) => t > line.at);
      expect(slide, line.id).toBeGreaterThanOrEqual(0);
    }
  });
});
