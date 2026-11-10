import { describe, expect, test } from 'bun:test';
import { clamp, ease, frameIdx, keys, lerp, mulberry32, prog, remap, smoothstep } from './util';

const steps = Array.from({ length: 101 }, (_, i) => i / 100);

describe('clamp, lerp, remap, smoothstep', () => {
  test('clamp holds a value inside its bounds', () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(2)).toBe(1);
    expect(clamp(0.4)).toBe(0.4);
    expect(clamp(15, 10, 20)).toBe(15);
    expect(clamp(5, 10, 20)).toBe(10);
    expect(clamp(25, 10, 20)).toBe(20);
  });

  test('lerp hits both ends and the middle, and extrapolates', () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(lerp(10, 20, 2)).toBe(30);
  });

  test('remap maps a range onto another and clamps outside it', () => {
    expect(remap(5, 0, 10)).toBe(0.5);
    expect(remap(5, 0, 10, 100, 200)).toBe(150);
    expect(remap(-5, 0, 10, 100, 200)).toBe(100);
    expect(remap(50, 0, 10, 100, 200)).toBe(200);
    expect(remap(5, 10, 0, 0, 1)).toBe(0.5); // a reversed input range still maps
  });

  test('smoothstep is 0 before, 1 after, and eases through the middle', () => {
    expect(smoothstep(2, 4, 1)).toBe(0);
    expect(smoothstep(2, 4, 5)).toBe(1);
    expect(smoothstep(2, 4, 3)).toBe(0.5);
    expect(smoothstep(0, 1, 0.25)).toBeLessThan(0.25);
  });
});

describe('ease', () => {
  test('every curve starts at 0 and ends at 1', () => {
    for (const [name, fn] of Object.entries(ease)) {
      expect(fn(0), name).toBeCloseTo(0, 9);
      expect(fn(1), name).toBeCloseTo(1, 9);
    }
  });

  test('every curve is finite across 0..1', () => {
    for (const [name, fn] of Object.entries(ease)) for (const t of steps) expect(Number.isFinite(fn(t)), `${name}(${t})`).toBe(true);
  });

  test('the monotone curves never go backwards', () => {
    for (const name of ['linear', 'inQuad', 'outQuad', 'inOutQuad', 'inCubic', 'outCubic', 'inOutCubic', 'outQuart', 'inOutQuart', 'outExpo', 'inOutExpo'] as const) {
      steps.reduce((previous, t) => {
        const value = ease[name](t);
        expect(value, `${name}(${t})`).toBeGreaterThanOrEqual(previous - 1e-12);
        return value;
      }, -Infinity);
    }
  });

  test('"in" curves start slow, "out" curves start fast, "inOut" curves cross the middle at 0.5', () => {
    expect(ease.inCubic(0.5)).toBeLessThan(0.5);
    expect(ease.outCubic(0.5)).toBeGreaterThan(0.5);
    for (const name of ['inOutQuad', 'inOutCubic', 'inOutQuart', 'inOutExpo'] as const) expect(ease[name](0.5), name).toBeCloseTo(0.5, 9);
  });

  test('outBack and spring overshoot 1 and settle on it', () => {
    expect(Math.max(...steps.map(ease.outBack))).toBeGreaterThan(1);
    expect(Math.max(...steps.map(ease.spring))).toBeGreaterThan(1);
    expect(ease.outBack(1)).toBeCloseTo(1, 9);
    expect(ease.spring(1)).toBe(1);
    expect(ease.spring(1.5)).toBe(1); // held after its end
  });

  test('outExpo reaches exactly 1 and inOutExpo exactly 0 and 1 at the ends', () => {
    expect(ease.outExpo(1)).toBe(1);
    expect(ease.inOutExpo(0)).toBe(0);
    expect(ease.inOutExpo(1)).toBe(1);
  });
});

describe('prog', () => {
  test('goes 0 to 1 over its window and holds outside it', () => {
    expect(prog(0, 1, 3)).toBe(0);
    expect(prog(1, 1, 3)).toBe(0);
    expect(prog(2, 1, 3)).toBe(0.5);
    expect(prog(3, 1, 3)).toBe(1);
    expect(prog(10, 1, 3)).toBe(1);
  });

  test('shapes the move with the ease it is given', () => {
    expect(prog(2, 1, 3, ease.inQuad)).toBe(0.25);
    expect(prog(2, 1, 3, ease.outQuad)).toBe(0.75);
  });
});

describe('keys', () => {
  const frames: [number, number][] = [[1, 10], [3, 30], [5, 20]];

  test('holds the first value before the first key and the last after the last', () => {
    expect(keys(0, frames)).toBe(10);
    expect(keys(1, frames)).toBe(10);
    expect(keys(5, frames)).toBe(20);
    expect(keys(99, frames)).toBe(20);
  });

  test('lands exactly on each key', () => {
    expect(keys(3, frames)).toBe(30);
  });

  test('moves between keys with the second key\'s ease (inOutCubic by default)', () => {
    expect(keys(2, frames)).toBe(20); // the midpoint of an inOutCubic is the midpoint
    expect(keys(2, [[1, 0], [3, 100, ease.linear]])).toBe(50);
    expect(keys(1.5, [[1, 0], [2, 100, ease.inQuad]])).toBe(25);
  });

  test('a single key is a constant', () => {
    expect(keys(-4, [[2, 7]])).toBe(7);
    expect(keys(4, [[2, 7]])).toBe(7);
  });

  test('is continuous: no frame-to-frame jump bigger than the slope allows', () => {
    const f: [number, number, ((t: number) => number)?][] = [[0, 0], [1, 100, ease.outQuart], [2, 100], [3, 0, ease.spring]];
    let previous = keys(0, f);
    for (let t = 1 / 60; t <= 3; t += 1 / 60) {
      const value = keys(t, f);
      expect(Math.abs(value - previous)).toBeLessThan(40);
      previous = value;
    }
  });
});

describe('mulberry32', () => {
  test('the same seed gives the same sequence', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  test('different seeds give different sequences', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  test('values are in [0, 1) and spread out', () => {
    const next = mulberry32(7);
    const values = Array.from({ length: 2000 }, next);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});

describe('frameIdx', () => {
  test('counts frames at 60 fps', () => {
    expect(frameIdx(0)).toBe(0);
    expect(frameIdx(1)).toBe(60);
    expect(frameIdx(2.5)).toBe(150);
  });

  test('a frame time that lands just under a boundary through float error still counts as that frame', () => {
    for (let frame = 0; frame < 600; frame++) expect(frameIdx(frame / 60)).toBe(frame);
  });

  test('is constant within a frame', () => {
    expect(frameIdx(10 / 60 + 0.004)).toBe(10);
    expect(frameIdx(10 / 60 + 0.0165)).toBe(10);
  });
});
