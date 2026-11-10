import { describe, expect, test } from 'bun:test';
import { H, PH, PW, SCALE, Scene, W, scaleFromSearch, type Frame, type SceneContext } from './scene';

describe('render scale', () => {
  test('scenes lay out at 1920x1080', () => {
    expect([W, H]).toEqual([1920, 1080]);
  });

  test('outside a browser (no location) the scale is 1 and the canvas is the layout size', () => {
    expect(SCALE).toBe(1);
    expect([PW, PH]).toEqual([W, H]);
  });

  test('?scale=2 asks for 4K', () => {
    expect(scaleFromSearch('?scale=2')).toBe(2);
    expect(scaleFromSearch('?edit=todomvc&scale=3&t=4')).toBe(3);
  });

  test('no scale, and scales below 1, give 1', () => {
    expect(scaleFromSearch('')).toBe(1);
    expect(scaleFromSearch('?edit=x')).toBe(1);
    expect(scaleFromSearch('?scale=0')).toBe(1);
    expect(scaleFromSearch('?scale=-2')).toBe(1);
  });

  test('a scale that is not a number gives 1, not NaN', () => {
    expect(scaleFromSearch('?scale=abc')).toBe(1);
    expect(scaleFromSearch('?scale=')).toBe(1);
    expect(scaleFromSearch('?scale=Infinity')).toBe(1);
  });

  test('a fractional scale rounds to a whole one', () => {
    expect(scaleFromSearch('?scale=1.4')).toBe(1);
    expect(scaleFromSearch('?scale=1.6')).toBe(2);
  });
});

describe('Scene defaults', () => {
  class Plain extends Scene { render(_f: Frame) {} }
  const scene = new Plain({ g: {} as CanvasRenderingContext2D, start: 0, end: 1, params: {} } satisfies SceneContext);

  test('a scene with nothing to say makes no sound, no narration, no speaker notes and no stops, and has no opinion on its length', async () => {
    expect(scene.cues()).toEqual([]);
    expect(scene.narration()).toEqual([]);
    expect(scene.notes()).toEqual([]);
    expect(scene.stops()).toEqual([]);
    expect(scene.duration()).toBeUndefined();
    await scene.init();
    await scene.prepare({ t: 0, lt: 0, p: 0, dur: 1 });
  });
});
