import { describe, expect, test } from 'bun:test';
import { applyCam, arrow, button, camAt, card, copy, emoji, rise, WIDE, wrap, type Cam } from './slide';
import { C } from './palette';
import { H, W } from './scene';
import { expectCleanLog, fakeContext, range, snapshot } from '../testing/fake-canvas';

describe('wrap', () => {
  // the fake measures text at half the font size per character: 10px font -> 5 px a character
  const g = fakeContext();

  test('keeps a short line whole', () => {
    expect(wrap(g, 'hello world', 500)).toEqual(['hello world']);
  });

  test('breaks at spaces so no line is wider than the limit', () => {
    const lines = wrap(g, 'one two three four five six seven eight', 80);
    expect(lines.join(' ')).toBe('one two three four five six seven eight');
    for (const line of lines) expect(g.measureText(line).width).toBeLessThanOrEqual(80);
    expect(lines.length).toBeGreaterThan(1);
  });

  test('a word wider than the limit gets its own line instead of being dropped', () => {
    expect(wrap(g, 'a supercalifragilistic b', 40)).toEqual(['a', 'supercalifragilistic', 'b']);
  });

  test('empty text is no lines', () => {
    expect(wrap(g, '', 100)).toEqual([]);
  });
});

describe('camAt', () => {
  const a: Cam = { x: 400, y: 300, zoom: 1 }, b: Cam = { x: 1400, y: 800, zoom: 4 };

  test('holds the first camera before and the last after', () => {
    expect(camAt(-1, [[0, a], [2, b]])).toEqual(a);
    const end = camAt(5, [[0, a], [2, b]]);
    expect(end.x).toBe(1400);
    expect(end.zoom).toBeCloseTo(4);
  });

  test('moves the focus linearly and the zoom in log space (an even push)', () => {
    const mid = camAt(1, [[0, a], [2, b, (t) => t]]);
    expect(mid.x).toBeCloseTo(900);
    expect(mid.y).toBeCloseTo(550);
    expect(mid.zoom).toBeCloseTo(2);
  });

  test('WIDE is the whole slide', () => {
    expect(WIDE).toEqual({ x: W / 2, y: H / 2, zoom: 1 });
  });
});

describe('applyCam', () => {
  test('the camera\'s focus lands at the middle of the screen', () => {
    const g = fakeContext();
    applyCam(g, { x: 700, y: 500, zoom: 2 });
    const [sx, sy] = g.toDevice(700, 500);
    expect(sx).toBeCloseTo(W / 2);
    expect(sy).toBeCloseTo(H / 2);
  });

  test('a push onto an edge element never shows past the slide', () => {
    for (const zoom of [1.5, 2, 4]) {
      for (const [x, y] of [[0, 0], [W, H], [W, 0], [0, H], [W / 2, H]]) {
        const g = fakeContext();
        applyCam(g, { x: x!, y: y!, zoom });
        const [left, top] = g.toDevice(0, 0);
        const [right, bottom] = g.toDevice(W, H);
        expect(left).toBeLessThanOrEqual(1e-9);
        expect(top).toBeLessThanOrEqual(1e-9);
        expect(right).toBeGreaterThanOrEqual(W - 1e-9);
        expect(bottom).toBeGreaterThanOrEqual(H - 1e-9);
      }
    }
  });

  test('the wide camera is the identity', () => {
    const g = fakeContext();
    applyCam(g, WIDE);
    expect(g.matrix).toEqual([1, 0, 0, 1, 0, 0]);
  });
});

describe('copy', () => {
  const lines = ['first', 'second', 'third'];
  const alphas = (p: number) => {
    const g = fakeContext();
    copy(g, lines, 100, 200, 40, p);
    return g.calls('fillText').map((c) => c.alpha);
  };

  test('draws nothing visible at p = 0 and every line fully at p = 1', () => {
    expect(alphas(0).every((a) => a === 0)).toBe(true);
    expect(alphas(1).every((a) => a === 1)).toBe(true);
  });

  test('lines rise in one after another', () => {
    const [a, b, c] = alphas(0.5);
    expect(a!).toBeGreaterThan(b!);
    expect(b!).toBeGreaterThan(c!);
  });

  test('each line sits one line height lower than the last, and rises into place', () => {
    const g = fakeContext();
    copy(g, lines, 100, 200, 40, 1);
    expect(g.calls('fillText').map((c) => c.args[2])).toEqual([200, 240, 280]);
    const early = fakeContext();
    copy(early, lines, 100, 200, 40, 0.2);
    expect(early.calls('fillText')[0]!.args[2]).toBeGreaterThan(200);
  });

  test('multiplies the alpha already in force and puts it back', () => {
    const g = fakeContext();
    g.globalAlpha = 0.5;
    copy(g, lines, 0, 0, 40, 1);
    expect(g.calls('fillText').every((c) => c.alpha === 0.5)).toBe(true);
    expect(g.globalAlpha).toBe(0.5);
  });

  test('is clean for p beyond 0..1', () => {
    for (const p of [-1, 0, 0.3, 1, 3]) {
      const g = fakeContext();
      copy(g, lines, 0, 0, 40, p);
      expectCleanLog(g);
    }
  });
});

describe('rise', () => {
  test('draws nothing at p <= 0', () => {
    const g = fakeContext();
    rise(g, 'Headline', 100, 400, 80, 0);
    rise(g, 'Headline', 100, 400, 80, -1);
    expect(g.log).toEqual([]);
  });

  test('comes up from under its baseline and settles on it', () => {
    const y = (p: number) => { const g = fakeContext(); rise(g, 'Headline', 100, 400, 80, p); return g.calls('fillText')[0]!.args[2] as number; };
    expect(y(1)).toBe(400);
    expect(y(0.5)).toBeGreaterThan(400);
    expect(y(0.1)).toBeGreaterThan(y(0.5));
  });

  test('fades in by 2/3 of the way', () => {
    const alpha = (p: number) => { const g = fakeContext(); rise(g, 'H', 0, 400, 80, p); return g.calls('fillText')[0]!.alpha; };
    expect(alpha(2 / 3)).toBeCloseTo(1);
    expect(alpha(0.3)).toBeLessThan(1);
  });

  test('uses the display face in regular weight and the sans in bold', () => {
    const g = fakeContext();
    rise(g, 'H', 0, 400, 80, 1);
    expect(g.calls('set:font')[0]!.args[0]).toBe('400 80px "Instrument Serif"');
    const s = fakeContext();
    rise(s, 'H', 0, 400, 80, 1, { family: 'sans' });
    expect(s.calls('set:font')[0]!.args[0]).toBe('700 80px "Inter"');
  });
});

describe('card, button, emoji', () => {
  test('card fills a rounded rect on paper', () => {
    const g = fakeContext();
    card(g, 10, 20, 300, 200);
    expect(g.calls('roundRect')[0]!.args).toEqual([10, 20, 300, 200, 26]);
    expect(g.calls('set:fillStyle').at(-1)!.args[0]).toBe(C.paper);
    expectCleanLog(g);
  });

  test('button returns its width: the text plus padding on both sides, and centres on x', () => {
    const g = fakeContext();
    const w = button(g, 960, 700, 'Start', { size: 40, padX: 56 });
    expect(w).toBe(5 * 40 * 0.5 + 112);
    const [x, , width] = g.calls('roundRect')[0]!.args as number[];
    expect(x! + width! / 2).toBeCloseTo(960);
    expectCleanLog(g);
  });

  test('emoji draws one glyph at its position', () => {
    const g = fakeContext();
    emoji(g, '🚀', 100, 200, 50);
    expect(g.calls('fillText')[0]!.args).toEqual(['🚀', 100, 203]);
    expectCleanLog(g);
  });
});

describe('arrow', () => {
  const draw = (p: number) => { const g = fakeContext(); arrow(g, [100, 100], [200, 0], [300, 300], [500, 200], p); return g; };

  test('draws nothing at p <= 0', () => {
    expect(draw(0).log).toEqual([]);
  });

  test('draws on along its path: more strokes as p grows, and the head lands last', () => {
    const body = (p: number) => draw(p).calls('stroke').length;
    expect(body(0.2)).toBeLessThan(body(0.5));
    expect(body(0.5)).toBeLessThan(body(0.8));
    expect(draw(0.7).calls('scale').length).toBe(0); // no head yet
    expect(draw(1).calls('scale').length).toBe(1);
  });

  test('its first stroke starts at `from` and the last one ends at `to`', () => {
    const g = draw(1);
    expect(g.calls('moveTo')[0]!.args).toEqual([100, 100]);
    const lines = g.calls('lineTo');
    const lastBody = lines[lines.length - 3]!.args as number[]; // the head adds two lineTo
    expect(lastBody[0]).toBeCloseTo(500);
    expect(lastBody[1]).toBeCloseTo(200);
  });

  test('is clean and deterministic from nothing to done', () => {
    for (const p of range(-0.2, 1.3, 30)) {
      const a = draw(p), b = draw(p);
      expectCleanLog(a);
      expect(snapshot(a)).toEqual(snapshot(b));
    }
  });
});
