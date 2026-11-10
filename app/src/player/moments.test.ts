import { describe, expect, test } from 'bun:test';
import { captionAt, clockText, escapeHtml, posterTime, sceneAt, spanOf, startTime } from './moments';

const captions = [
  { at: 1, end: 3, text: 'First.' },
  { at: 3.5, end: 6, text: 'Second.' },
  { at: 6, end: 8, text: 'Third.' },
  { at: 9, end: 12, text: 'Fourth.' },
];

describe('captionAt', () => {
  test('the line whose speech covers the time; the start counts, the end does not', () => {
    expect(captionAt(captions, 1)?.text).toBe('First.');
    expect(captionAt(captions, 2.99)?.text).toBe('First.');
    expect(captionAt(captions, 3)).toBeUndefined();
    expect(captionAt(captions, 6)?.text).toBe('Third.'); // Second ends where Third starts
  });

  test('none before the first line, in a gap, or after the last', () => {
    expect(captionAt(captions, 0.5)).toBeUndefined();
    expect(captionAt(captions, 8.5)).toBeUndefined();
    expect(captionAt(captions, 12)).toBeUndefined();
    expect(captionAt([], 5)).toBeUndefined();
  });

  test('of overlapping lines, the first one listed', () => {
    expect(captionAt([{ at: 0, end: 5, text: 'a' }, { at: 2, end: 6, text: 'b' }], 3)?.text).toBe('a');
  });
});

describe('spanOf', () => {
  const timeline = [{ id: 'a', start: 0, end: 10 }, { id: 'b', start: 9, end: 20 }];
  test('the whole edit without a scene, and the scene\'s own range with one', () => {
    expect(spanOf(timeline, undefined, 20)).toEqual({ start: 0, end: 20 });
    expect(spanOf(timeline, 'b', 20)).toEqual({ start: 9, end: 20 });
  });
  test('an unknown scene throws, naming the scenes', () => {
    expect(() => spanOf(timeline, 'zz', 20)).toThrow("no scene 'zz' (scenes: a, b)");
  });
});

describe('sceneAt', () => {
  const timeline = [{ id: 'a', start: 0, end: 10 }, { id: 'b', start: 9, end: 20 }, { id: 'c', start: 20, end: 30 }];
  test('the scene on screen; in a crossfade, the later one', () => {
    expect(sceneAt(timeline, 0)).toBe('a');
    expect(sceneAt(timeline, 8.9)).toBe('a');
    expect(sceneAt(timeline, 9.5)).toBe('b');
    expect(sceneAt(timeline, 20)).toBe('c');
  });
  test('none past the end', () => {
    expect(sceneAt(timeline, 30)).toBeUndefined();
    expect(sceneAt([], 1)).toBeUndefined();
  });
});

describe('posterTime', () => {
  const timeline = [{ start: 0, end: 5 }, { start: 4, end: 9 }];
  test('the first stop, if there is one', () => {
    expect(posterTime([2.5, 6], timeline, 9)).toBe(2.5);
  });
  test('without stops, the frame before the first scene ends or the second begins', () => {
    expect(posterTime([], timeline, 9)).toBeCloseTo(4 - 1 / 60);
    expect(posterTime([], [{ start: 0, end: 3 }, { start: 4, end: 9 }], 9)).toBeCloseTo(3 - 1 / 60);
  });
  test('a single scene: its end; no scenes: the end of the span, never below 0', () => {
    expect(posterTime([], [{ start: 0, end: 6 }], 6)).toBeCloseTo(6 - 1 / 60);
    expect(posterTime([], [], 2)).toBeCloseTo(2 - 1 / 60);
    expect(posterTime([], [], 0)).toBe(0);
  });
});

describe('startTime', () => {
  const base = { from: 0, to: 100, embed: false, stops: [10, 20], timeline: [{ start: 0, end: 50 }] };
  test('an explicit t wins, clamped into the span', () => {
    expect(startTime({ ...base, t: 42 })).toBe(42);
    expect(startTime({ ...base, t: -5 })).toBe(0);
    expect(startTime({ ...base, t: 500 })).toBeCloseTo(100 - 1e-3);
    expect(startTime({ ...base, t: 0 })).toBe(0);
  });
  test('without t, the edit\'s poster, else its first stop', () => {
    expect(startTime({ ...base, poster: 33 })).toBe(33);
    expect(startTime(base)).toBe(10);
  });
  test('an embed starts on its last stop, or its start when it has none', () => {
    expect(startTime({ ...base, embed: true, from: 5, stops: [6, 9] })).toBe(9);
    expect(startTime({ ...base, embed: true, from: 5, stops: [] })).toBe(5);
    expect(startTime({ ...base, embed: true, from: 5, stops: [6], poster: 77 })).toBe(6); // the edit's poster is not an embed's
  });
  test('an embed\'s t is clamped into its own range', () => {
    expect(startTime({ ...base, embed: true, from: 40, to: 60, t: 10 })).toBe(40);
    expect(startTime({ ...base, embed: true, from: 40, to: 60, t: 70 })).toBeCloseTo(60 - 1e-3);
  });
});

describe('clockText', () => {
  test('m:ss, flooring the seconds', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(5.99)).toBe('0:05');
    expect(clockText(60)).toBe('1:00');
    expect(clockText(125.4)).toBe('2:05');
    expect(clockText(3600)).toBe('60:00');
  });
  test('never negative', () => {
    expect(clockText(-3)).toBe('0:00');
  });
});

describe('escapeHtml', () => {
  test('escapes the characters that would break out of text or an attribute', () => {
    expect(escapeHtml('<b>"A" & B</b>')).toBe('&#60;b&#62;&#34;A&#34; &#38; B&#60;/b&#62;');
  });
  test('leaves plain text, apostrophes and unicode alone', () => {
    expect(escapeHtml("It's café time")).toBe("It's café time");
  });
});
