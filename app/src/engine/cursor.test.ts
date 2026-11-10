import { describe, expect, test } from 'bun:test';
import { cursorAt, pressAt, sinceClick, type CursorKey } from './cursor';
import { ease } from './util';

const path: CursorKey[] = [[1, 100, 100], [3, 500, 100, ease.linear], [4, 500, 400, ease.linear]];

describe('cursorAt', () => {
  test('rests on the first point before the first key and the last point after the last', () => {
    expect(cursorAt(0, path)).toEqual({ x: 100, y: 100 });
    expect(cursorAt(1, path)).toEqual({ x: 100, y: 100 });
    expect(cursorAt(4, path)).toEqual({ x: 500, y: 400 });
    expect(cursorAt(99, path)).toEqual({ x: 500, y: 400 });
  });

  test('arrives exactly on each key', () => {
    const at = cursorAt(3, path);
    expect(at.x).toBeCloseTo(500);
    expect(at.y).toBeCloseTo(100);
  });

  test('a move bows off the straight line, most in the middle, and never at its ends', () => {
    const mid = cursorAt(2, path); // halfway along a rightward move
    expect(mid.x).toBeCloseTo(300);
    expect(mid.y).not.toBeCloseTo(100); // off the line
    expect(mid.y).toBeCloseTo(100 + 400 * 0.12); // dx * 0.12 bow, perpendicular to the move
    const early = cursorAt(1.1, path);
    expect(Math.abs(early.y - 100)).toBeLessThan(Math.abs(mid.y - 100));
  });

  test('the bow is perpendicular to the move: a downward move bows sideways', () => {
    const mid = cursorAt(3.5, path);
    expect(mid.y).toBeCloseTo(250);
    expect(mid.x).toBeCloseTo(500 - 300 * 0.12);
  });

  test('a move stays within a small margin of its start and end', () => {
    for (let t = 1; t <= 3; t += 1 / 60) {
      const p = cursorAt(t, path);
      expect(p.x).toBeGreaterThanOrEqual(100 - 1);
      expect(p.x).toBeLessThanOrEqual(500 + 1);
      expect(Math.abs(p.y - 100)).toBeLessThan(400 * 0.12 + 1);
    }
  });

  test('uses the ease of the key it moves into', () => {
    const slow: CursorKey[] = [[0, 0, 0], [2, 100, 0, ease.inQuad]];
    expect(cursorAt(1, slow).x).toBeCloseTo(25);
  });

  test('a single key is a fixed point', () => {
    expect(cursorAt(5, [[2, 7, 9]])).toEqual({ x: 7, y: 9 });
  });

  test('a zero-length move is not a point on the move itself', () => {
    const still: CursorKey[] = [[0, 50, 50], [2, 50, 50]];
    expect(cursorAt(1, still)).toEqual({ x: 50, y: 50 });
  });

  test('is finite and continuous at 60 fps', () => {
    let previous = cursorAt(0, path);
    for (let t = 1 / 60; t <= 5; t += 1 / 60) {
      const p = cursorAt(t, path);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(Math.hypot(p.x - previous.x, p.y - previous.y)).toBeLessThan(60);
      previous = p;
    }
  });
});

describe('pressAt', () => {
  test('is 0 away from every click', () => {
    expect(pressAt(0, [2])).toBe(0);
    expect(pressAt(5, [2])).toBe(0);
    expect(pressAt(1, [])).toBe(0);
  });

  test('squeezes in over the 0.06 s before a click, peaks on it, and lets go over 0.14 s after', () => {
    expect(pressAt(1.97, [2])).toBeCloseTo(0.5);
    expect(pressAt(2, [2])).toBe(1);
    expect(pressAt(2.07, [2])).toBeCloseTo(0.5);
    expect(pressAt(2.14, [2])).toBe(0);
  });

  test('stays within 0..1 across a range of times and clicks', () => {
    for (let t = 0; t <= 6; t += 1 / 120) {
      const v = pressAt(t, [1, 1.05, 3, 4.5]);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test('overlapping clicks take the strongest press', () => {
    expect(pressAt(2.09, [2, 2.1])).toBeCloseTo(Math.max(pressAt(2.09, [2]), pressAt(2.09, [2.1])));
    expect(pressAt(2.09, [2, 2.1])).toBeGreaterThan(pressAt(2.09, [2]));
  });
});

describe('sinceClick', () => {
  test('is the time since the latest click at or before t', () => {
    expect(sinceClick(5, [1, 3])).toBe(2);
    expect(sinceClick(3, [1, 3])).toBe(0);
    expect(sinceClick(2.5, [1, 3])).toBe(1.5);
  });

  test('is Infinity before any click, or with none', () => {
    expect(sinceClick(0.5, [1, 3])).toBe(Infinity);
    expect(sinceClick(5, [])).toBe(Infinity);
  });
});
