import { describe, expect, test } from 'bun:test';
import { slideNotes, type Spoken } from './notes';
import { placeStops } from './stops';

const spoken: Spoken[] = [{ at: 1, text: 'First.' }, { at: 3.5, text: 'Second.' }, { at: 6, text: 'Third.' }, { at: 9, text: 'Fourth.' }];
const none = { authored: [], spoken };
const stops = [3, 8, 13];
const texts = (source: Parameters<typeof slideNotes>[0], k: number, s = stops, from = 0) => slideNotes(source, s, from, k);

describe('slideNotes, from the narration', () => {
  test('the lines that start after the previous stop, up to and including this stop', () => {
    expect(texts(none, 0)).toEqual(['First.']);
    expect(texts(none, 1)).toEqual(['Second.', 'Third.']);
    expect(texts(none, 2)).toEqual(['Fourth.']);
  });

  test('a line just after a stop belongs to the next slide, just before it to the one the stop ends', () => {
    const at = (t: number) => ({ authored: [], spoken: [{ at: t, text: 'x' }] });
    expect(texts(at(3 + 1e-3), 0)).toHaveLength(0);
    expect(texts(at(3 + 1e-3), 1)).toHaveLength(1);
    expect(texts(at(3 - 1e-3), 0)).toHaveLength(1);
  });

  test('a line exactly on a stop is on that slide only', () => {
    const on = { authored: [], spoken: [{ at: 3, text: 'x' }] };
    expect(texts(on, 0)).toEqual(['x']);
    expect(texts(on, 1)).toEqual([]);
  });

  test('before the first slide there are no notes', () => {
    expect(texts(none, -1)).toEqual([]);
    expect(texts({ authored: [{ at: 0.5, text: 'a' }], spoken }, -1)).toEqual([]);
  });

  test('the first slide counts from the start of the span (an embed), and a line at the start is in', () => {
    expect(texts(none, 0, [8], 3)).toEqual(['Second.', 'Third.']);
    expect(texts({ authored: [], spoken: [{ at: 0, text: 'x' }] }, 0, [3], 0)).toEqual(['x']);
  });

  test('every line lands on exactly one slide when the last stop is after the last line', () => {
    expect([0, 1, 2].flatMap((k) => texts(none, k, [3, 8, 13]))).toEqual(spoken.map((l) => l.text));
  });

  test('tail: the last slide also takes what is said after it; the others are unchanged', () => {
    expect(slideNotes(none, [3, 6], 0, 1, true)).toEqual(['Second.', 'Third.', 'Fourth.']);
    expect(slideNotes(none, [3, 6], 0, 1)).toEqual(['Second.', 'Third.']);
    expect(slideNotes(none, [3, 6], 0, 0, true)).toEqual(['First.']);
  });
});

describe('slideNotes, authored', () => {
  const authored: Spoken[] = [{ at: 2, text: 'Note A' }, { at: 12, text: 'Note C' }];

  test('a slide with authored notes shows them instead of the narration', () => {
    expect(texts({ authored, spoken }, 0)).toEqual(['Note A']);
    expect(texts({ authored, spoken }, 2)).toEqual(['Note C']);
  });

  test('a slide with none falls back to its narration, per slide', () => {
    expect(texts({ authored, spoken }, 1)).toEqual(['Second.', 'Third.']);
  });

  test('authored notes are not mixed with narration on the same slide', () => {
    expect(texts({ authored: [{ at: 2.5, text: 'Only me' }], spoken }, 0)).toEqual(['Only me']);
  });

  test('several notes on a slide keep their order; the boundary rules are the narration rules', () => {
    const a: Spoken[] = [{ at: 3, text: 'on the stop' }, { at: 3.1, text: 'just after' }, { at: 8, text: 'on the next' }, { at: 0, text: 'at the start' }];
    const sorted = [...a].sort((x, y) => x.at - y.at);
    expect(texts({ authored: sorted, spoken: [] }, 0)).toEqual(['at the start', 'on the stop']);
    expect(texts({ authored: sorted, spoken: [] }, 1)).toEqual(['just after', 'on the next']);
  });

  test('a slide with neither has no notes', () => {
    expect(texts({ authored: [], spoken: [] }, 1)).toEqual([]);
  });

  test('an authored note after the last stop is on no slide, unless tail', () => {
    const late = { authored: [{ at: 20, text: 'late' }], spoken: [] };
    expect(texts(late, 2)).toEqual([]);
    expect(slideNotes(late, stops, 0, 2, true)).toEqual(['late']);
  });
});

describe('slideNotes across crossfades', () => {
  // a: 0-10, b fades in over it from 8 (overlap 2), ends 20: stops land at 7.98.. (a's last) and 19.98.. (b's last)
  const timeline = [{ id: 'a', start: 0, end: 10 }, { id: 'b', start: 8, end: 20 }];
  const placed = placeStops(timeline, new Map([['a', []], ['b', []]])).map((s) => s.t);

  test('a note inside the crossfade is on the way to the later scene, not the earlier', () => {
    expect(placed[0]!).toBeLessThan(8);
    const source = { authored: [{ at: 9, text: 'during the fade' }, { at: 5, text: 'before' }], spoken: [] };
    expect(slideNotes({ authored: source.authored.sort((x, y) => x.at - y.at), spoken: [] }, placed, 0, 0)).toEqual(['before']);
    expect(slideNotes({ authored: source.authored, spoken: [] }, placed, 0, 1)).toEqual(['during the fade']);
  });

  test("narration said in the fade falls back onto the later scene's slide, too", () => {
    expect(slideNotes({ authored: [], spoken: [{ at: 8.5, text: 'said' }] }, placed, 0, 1)).toEqual(['said']);
    expect(slideNotes({ authored: [], spoken: [{ at: 8.5, text: 'said' }] }, placed, 0, 0)).toEqual([]);
  });
});
