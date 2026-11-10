import { describe, expect, test } from 'bun:test';
import { backdrop, browserWindow, chapterTag, chip, clickRipple, cursor, highlight, label, polaroid, roundRect, WINDOW_BAR } from './draw';
import { C } from './palette';
import { H, W } from './scene';
import { expectCleanLog, fakeContext, range, snapshot, textWidth } from '../testing/fake-canvas';
import { bitmap, box } from '../testing/footage';

/** Run a drawing and return the context it drew on. */
const drawn = (fn: (g: ReturnType<typeof fakeContext>) => void) => { const g = fakeContext(); fn(g); return g; };

describe('backdrop', () => {
  test('fills the whole slide with the base colour, then lays three washes over it', () => {
    const g = drawn((g) => backdrop(g, 0));
    expect(g.calls('fillRect')[0]!.args).toEqual([0, 0, W, H]);
    expect(g.calls('set:fillStyle')[0]!.args[0]).toBe(C.backdropBase);
    expect(g.calls('createRadialGradient').length).toBe(3);
  });

  test('each wash fades to transparent at the edge', () => {
    const g = drawn((g) => backdrop(g, 0));
    const gradients = g.calls('set:fillStyle').map((c) => c.args[0] as any).filter((v) => v?.kind === 'radial');
    expect(gradients.length).toBe(3);
    for (const gradient of gradients) {
      expect(gradient.stops[0][0]).toBe(0);
      expect(gradient.stops[1][1]).toMatch(/,0\)$/);
    }
  });

  test('the washes drift with t and are the same at the same t', () => {
    const centres = (t: number) => drawn((g) => backdrop(g, t)).calls('translate').map((c) => c.args);
    expect(centres(0)).not.toEqual(centres(3));
    expect(snapshot(drawn((g) => backdrop(g, 3)))).toEqual(snapshot(drawn((g) => backdrop(g, 3)))); // drawing the same t twice is the same
    expect(centres(0)).toEqual(centres(2 * Math.PI / 0.35)); // one full breath later
  });

  test('is clean at any time, including negative and huge', () => {
    for (const t of [...range(0, 30, 120), -5, 1e6]) expectCleanLog(drawn((g) => backdrop(g, t)));
  });

  test('uses the theme: a different wash colour changes the log', () => {
    const before = snapshot(drawn((g) => backdrop(g, 0)));
    const saved = C.wash1;
    C.wash1 = '#ff0000';
    const after = snapshot(drawn((g) => backdrop(g, 0)));
    C.wash1 = saved;
    expect(after).not.toEqual(before);
  });
});

describe('browserWindow', () => {
  test('paints its content once, inside a clip to the page area, with the matrix left alone', () => {
    const g = fakeContext();
    let clips = 0, calls = 0;
    browserWindow(g, 100, 50, 800, 500, 'demo.dev', () => { calls++; clips = g.calls('clip').length; });
    expect(calls).toBe(1);
    expect(clips).toBe(1);
    expect(g.matrix).toEqual([1, 0, 0, 1, 0, 0]);
    expectCleanLog(g);
  });

  test('is the page plus a bar tall, and the page starts under the bar', () => {
    const g = drawn((g) => browserWindow(g, 100, 50, 800, 500, 'demo.dev', () => {}));
    const rects = g.calls('roundRect').map((c) => c.args as number[]);
    expect(rects[0]).toEqual([100, 50, 800, 500 + WINDOW_BAR, 18]); // the whole window
    expect(rects.at(-1)!.slice(0, 4)).toEqual([100, 50 + WINDOW_BAR, 800, 500]); // the page
  });

  test('draws the address and three window buttons', () => {
    const g = drawn((g) => browserWindow(g, 100, 50, 800, 500, 'demo.dev/pricing', () => {}));
    expect(g.calls('fillText').map((c) => c.args[0])).toEqual(['demo.dev/pricing']);
    expect(g.calls('arc').length).toBeGreaterThanOrEqual(3);
  });

  test('a very long address does not push a NaN or an Infinity anywhere', () => {
    expectCleanLog(drawn((g) => browserWindow(g, 0, 0, 300, 200, 'x'.repeat(500), () => {})));
  });
});

describe('cursor', () => {
  test('its tip is at (x, y)', () => {
    const g = drawn((g) => cursor(g, 300, 400));
    expect(g.calls('translate')[0]!.args).toEqual([300, 400]);
    expect(g.calls('moveTo')[0]!.matrix.slice(4)).toEqual([300, 400]);
  });

  test('is 1.5x at size 1 and grows with size', () => {
    expect(drawn((g) => cursor(g, 0, 0)).calls('scale')[0]!.args).toEqual([1.5, 1.5]);
    expect(drawn((g) => cursor(g, 0, 0, 2)).calls('scale')[0]!.args).toEqual([3, 3]);
  });

  test('a click squeezes it by up to 14%', () => {
    const scale = (press: number) => drawn((g) => cursor(g, 0, 0, 1, press)).calls('scale')[0]!.args[0] as number;
    expect(scale(1)).toBeCloseTo(1.5 * 0.86);
    expect(scale(0.5)).toBeLessThan(scale(0));
    expect(scale(0.5)).toBeGreaterThan(scale(1));
  });

  test('is clean at the sizes the scenes use', () => {
    for (const size of [0.5, 1, 1.2, 2.5]) for (const press of [0, 0.5, 1]) expectCleanLog(drawn((g) => cursor(g, 640, 360, size, press)));
  });
});

describe('clickRipple', () => {
  test('is nothing before the click, or from 0.6 s after it', () => {
    expect(drawn((g) => clickRipple(g, 10, 10, -0.01)).log).toEqual([]);
    expect(drawn((g) => clickRipple(g, 10, 10, 0.61)).log).toEqual([]);
    expect(drawn((g) => clickRipple(g, 10, 10, Infinity)).log).toEqual([]); // sinceClick with no click yet
  });

  test('a ring grows and fades over 0.6 s, centred on the click', () => {
    const ring = (k: number) => drawn((g) => clickRipple(g, 50, 60, k)).calls('arc')[0]!.args as number[];
    expect(ring(0)).toEqual([50, 60, 10, 0, Math.PI * 2]);
    expect(ring(0.3)[2]).toBeGreaterThan(ring(0)[2]!);
    expect(ring(0.6)[2]).toBeCloseTo(44);
  });

  test('is clean (alpha in range) from the instant of the click to the end', () => {
    for (const k of range(0, 0.6, 60)) expectCleanLog(drawn((g) => clickRipple(g, 50, 60, k, 1.4)));
  });
});

describe('highlight', () => {
  const target = box(300, 200, 400, 60);

  test('is nothing at p <= 0', () => {
    expect(drawn((g) => highlight(g, target, 0)).log).toEqual([]);
    expect(drawn((g) => highlight(g, target, -1)).log).toEqual([]);
  });

  test('settles onto the box: a ring 8 px around it at full p, larger before', () => {
    const ring = (p: number) => drawn((g) => highlight(g, target, p)).calls('roundRect')[0]!.args as number[];
    expect(ring(1).slice(0, 4)).toEqual([292, 192, 416, 76]);
    expect(ring(0.2)[2]!).toBeGreaterThan(ring(1)[2]!);
  });

  test('fades in over the first 60% of p', () => {
    const alpha = (p: number) => drawn((g) => highlight(g, target, p)).calls('stroke')[0]!.alpha;
    expect(alpha(0.3)).toBeCloseTo(0.48);
    expect(alpha(0.625)).toBe(1);
    expect(alpha(1)).toBe(1);
  });

  test('is clean across p, with a pill radius for short boxes and an explicit radius when given', () => {
    for (const p of range(0, 1, 40)) expectCleanLog(drawn((g) => highlight(g, target, p)));
    expectCleanLog(drawn((g) => highlight(g, box(0, 0, 0, 0), 0.5, 4)));
  });
});

describe('label', () => {
  // the fake measures 13 px a character at the label's 26 px font
  const pill = (target: { x: number; y: number; w: number; h: number }, text: string, side?: any, sub?: string, align?: any) => {
    const g = drawn((g) => label(g, target, text, 1, side, sub, align));
    const [, , w, h] = g.calls('roundRect')[0]!.args as number[];
    const [x, y] = g.calls('roundRect')[0]!.matrix.slice(4) as number[]; // the pill's top left, at full size
    return { x: x!, y: y!, w: w!, h: h!, g };
  };
  const anchor = box(800, 500, 200, 60);

  test('is nothing at p <= 0', () => {
    expect(drawn((g) => label(g, anchor, 'Hi', 0)).log).toEqual([]);
  });

  test('sits below the box by default, centred on it, 26 px off', () => {
    const p = pill(anchor, 'Search');
    expect(p.w).toBe(textWidth('26px', 'Search') + 30 + 48);
    expect(p.h).toBe(56);
    expect(p.x + p.w / 2).toBeCloseTo(900);
    expect(p.y).toBe(500 + 60 + 26);
  });

  test('can sit above, left or right of the box', () => {
    const above = pill(anchor, 'Search', 'above');
    expect(above.y + above.h).toBe(500 - 26);
    const left = pill(anchor, 'Search', 'left');
    expect(left.x + left.w).toBe(800 - 26);
    expect(left.y + left.h / 2).toBeCloseTo(530);
    const right = pill(anchor, 'Search', 'right');
    expect(right.x).toBe(1000 + 26);
  });

  test('a second line makes it taller, and a wide one makes it wider', () => {
    expect(pill(anchor, 'Hi', 'below', 'a longer second line of text here').h).toBe(86);
    expect(pill(anchor, 'Hi', 'below', 'a longer second line of text here').w).toBeGreaterThan(pill(anchor, 'Hi').w);
  });

  test('aligns to the start or end edge of the box, above or below', () => {
    expect(pill(anchor, 'Search', 'below', undefined, 'start').x).toBe(800);
    const end = pill(anchor, 'Search', 'below', undefined, 'end');
    expect(end.x + end.w).toBe(1000);
  });

  test('is kept 40 px inside the slide however close to an edge the box is', () => {
    for (const target of [box(0, 0, 30, 30), box(W - 30, H - 30, 30, 30), box(W - 30, 0, 30, 30), box(0, H - 30, 30, 30)]) {
      for (const side of ['above', 'below', 'left', 'right'] as const) {
        const p = pill(target, 'A label', side, 'with a sub line');
        expect(p.x).toBeGreaterThanOrEqual(40);
        expect(p.y).toBeGreaterThanOrEqual(40);
        expect(p.x + p.w).toBeLessThanOrEqual(W - 40);
        expect(p.y + p.h).toBeLessThanOrEqual(H - 40);
      }
    }
  });

  test('pops in: small and fading at the start, full size at the end, clean throughout', () => {
    for (const p of range(0, 1.4, 56)) expectCleanLog(drawn((g) => label(g, anchor, 'Search', p, 'below', 'sub')));
    const scaleAt = (p: number) => drawn((g) => label(g, anchor, 'Hi', p)).calls('roundRect')[0]!.matrix[0];
    expect(scaleAt(0.1)).toBeLessThan(1);
    expect(scaleAt(1)).toBe(1);
    expect(drawn((g) => label(g, anchor, 'Hi', 0.25)).calls('fill')[0]!.alpha).toBeCloseTo(0.5);
  });

  test('draws its text and the sub line', () => {
    const g = drawn((g) => label(g, anchor, 'Search', 1, 'below', 'type to filter'));
    expect(g.calls('fillText').map((c) => c.args[0])).toEqual(['Search', 'type to filter']);
  });
});

describe('chip', () => {
  test('returns its width: the text plus 1.5 x the size of padding', () => {
    const g = fakeContext();
    expect(chip(g, 10, 10, 'Open source', { size: 24 })).toBe(textWidth('24px', 'Open source') + 36);
  });

  test('is ink with white text when selected, and a white pill with a hairline when not', () => {
    const selected = drawn((g) => chip(g, 0, 0, 'A', { selected: true }));
    expect(selected.calls('set:fillStyle').map((c) => c.args[0])).toEqual([C.ink, C.white]);
    expect(selected.calls('stroke')).toEqual([]);
    const plain = drawn((g) => chip(g, 0, 0, 'A'));
    expect(plain.calls('stroke').length).toBe(1);
    expect(plain.calls('set:fillStyle').at(-1)!.args[0]).toBe(C.ink);
  });

  test('is clean', () => {
    expectCleanLog(drawn((g) => chip(g, 100, 100, 'Hello')));
  });
});

describe('polaroid', () => {
  const crop = box(100, 200, 400, 300);

  test('is as tall as the crop\'s aspect says, centred on (x, y)', () => {
    const g = drawn((g) => polaroid(g, bitmap(), crop, 500, 400, 600, 0));
    expect(g.calls('roundRect')[0]!.args).toEqual([-300, -225, 600, 450, 10]);
    expect(g.calls('translate')[0]!.args).toEqual([500, 400]);
  });

  test('draws exactly the crop of the image into the card, rotated by the angle', () => {
    const image = bitmap();
    const g = drawn((g) => polaroid(g, image, crop, 500, 400, 600, 0.05));
    expect(g.calls('drawImage')[0]!.args).toEqual([image, 100, 200, 400, 300, -300, -225, 600, 450]);
    expect(g.calls('rotate')[0]!.args).toEqual([0.05]);
    expectCleanLog(g);
  });
});

describe('chapterTag', () => {
  test('is nothing at p <= 0', () => {
    expect(drawn((g) => chapterTag(g, 'The editor', 0)).log).toEqual([]);
  });

  test('slides in from off the left edge and rests 54 px from the corner', () => {
    const at = (p: number) => drawn((g) => chapterTag(g, 'The editor', p)).calls('translate')[0]!.args as number[];
    expect(at(0.01)[0]!).toBeLessThan(0);
    expect(at(1)).toEqual([54, 54]);
  });

  test('fades in and is clean', () => {
    for (const p of range(0, 1.3, 52)) expectCleanLog(drawn((g) => chapterTag(g, 'The editor', p)));
    expect(drawn((g) => chapterTag(g, 'X', 0.25)).calls('fill')[0]!.alpha).toBeCloseTo(0.5);
  });
});

describe('roundRect', () => {
  test('starts a fresh path and rounds the rectangle', () => {
    const g = drawn((g) => roundRect(g, 1, 2, 3, 4, 5));
    expect(g.log.map((c) => c.op)).toEqual(['beginPath', 'roundRect']);
    expect(g.calls('roundRect')[0]!.args).toEqual([1, 2, 3, 4, 5]);
  });
});
