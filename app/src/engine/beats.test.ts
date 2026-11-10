import { describe, expect, test } from 'bun:test';
import { beat, grow, union } from './beats';

describe('beat', () => {
  test('is absent before it starts and after it ends', () => {
    expect(beat(0, 1, 4)).toBe(0);
    expect(beat(1, 1, 4)).toBe(0);
    expect(beat(4, 1, 4)).toBe(0);
    expect(beat(9, 1, 4)).toBe(0);
  });

  test('pops in over 0.35 s and holds at 1', () => {
    expect(beat(1.175, 1, 4)).toBeCloseTo(0.5);
    expect(beat(1.35, 1, 4)).toBe(1);
    expect(beat(2.5, 1, 4)).toBe(1);
  });

  test('fades out over the last 0.25 s', () => {
    expect(beat(3.75, 1, 4)).toBe(1);
    expect(beat(3.875, 1, 4)).toBeCloseTo(0.5);
  });

  test('a beat shorter than its fades never reaches full presence, and stays within 0..1', () => {
    for (let t = 0; t <= 2; t += 1 / 60) {
      const v = beat(t, 0.5, 0.8);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...Array.from({ length: 200 }, (_, i) => beat(0.5 + i * 0.0015, 0.5, 0.8)))).toBeLessThan(1);
  });
});

describe('union and grow', () => {
  test('union is the smallest box around both', () => {
    expect(union({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 10, h: 10 })).toEqual({ x: 0, y: 0, w: 30, h: 15 });
  });

  test('union of a box and one inside it is the outer box', () => {
    const outer = { x: 0, y: 0, w: 100, h: 100 };
    expect(union(outer, { x: 10, y: 10, w: 5, h: 5 })).toEqual(outer);
    expect(union({ x: 10, y: 10, w: 5, h: 5 }, outer)).toEqual(outer);
  });

  test('union does not depend on the order', () => {
    const a = { x: -5, y: 3, w: 7, h: 2 }, b = { x: 4, y: -9, w: 3, h: 30 };
    expect(union(a, b)).toEqual(union(b, a));
  });

  test('grow pads every side by a number, or by [x, y]', () => {
    expect(grow({ x: 10, y: 10, w: 20, h: 20 }, 5)).toEqual({ x: 5, y: 5, w: 30, h: 30 });
    expect(grow({ x: 10, y: 10, w: 20, h: 20 }, [4, 8])).toEqual({ x: 6, y: 2, w: 28, h: 36 });
    expect(grow({ x: 10, y: 10, w: 20, h: 20 }, 0)).toEqual({ x: 10, y: 10, w: 20, h: 20 });
  });
});
