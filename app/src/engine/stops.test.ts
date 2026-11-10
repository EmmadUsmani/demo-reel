import { describe, expect, test } from 'bun:test';
import { clearWindow, FRAME, placeInScene, placeStops } from './stops';

const timeline = [
  { id: 'a', start: 0, end: 10 },
  { id: 'b', start: 9, end: 20 }, // crossfades in over a's last second
  { id: 'c', start: 20, end: 30 }, // hard cut
];

describe('placeStops', () => {
  test('a scene without stops stops on its last frame before the next one starts', () => {
    const stops = placeStops(timeline, new Map([['a', []], ['b', []], ['c', []]]));
    expect(stops.map((s) => s.scene)).toEqual(['a', 'b', 'c']);
    expect(stops[0]!.t).toBeCloseTo(9 - FRAME); // before b's fade-in
    expect(stops[1]!.t).toBeCloseTo(20 - FRAME);
    expect(stops[2]!.t).toBeCloseTo(30 - FRAME);
  });

  test("a scene's own stops are placed in video time, in order", () => {
    const stops = placeStops(timeline, new Map([['a', [3, 6]], ['c', [2, 5]]]));
    expect(stops).toEqual([{ t: 3, scene: 'a' }, { t: 6, scene: 'a' }, { t: 22, scene: 'c' }, { t: 25, scene: 'c' }]);
  });

  test('stops never land in a crossfade', () => {
    const stops = placeStops(timeline, new Map([['a', [9.5]], ['b', [0.2, 30]]]));
    expect(stops[0]!.t).toBeCloseTo(9 - FRAME); // a's fade-out: the frame before b starts
    expect(stops[1]!.t).toBe(10); // inside b's fade-in: where it completes
    expect(stops[2]!.t).toBeCloseTo(20 - FRAME); // past b's end
  });

  test('scenes not loaded have no stops, and duplicates collapse', () => {
    expect(placeStops(timeline, new Map([['b', [5, 5, 5.001]]]))).toEqual([{ t: 14, scene: 'b' }]);
  });

  test("a scene's stops come out in time order even when it lists them out of order", () => {
    const stops = placeStops(timeline, new Map([['c', [8, 2, 5]]]));
    expect(stops.map((s) => s.t)).toEqual([22, 25, 28]);
  });

  test('a stop before the scene starts is moved to its first frame, and one past its end to its last', () => {
    const stops = placeStops([{ id: 'only', start: 4, end: 8 }], new Map([['only', [-3, 50]]]));
    expect(stops[0]!.t).toBe(4);
    expect(stops[1]!.t).toBeCloseTo(8 - FRAME);
  });

  test('every stop of every scene lies inside its own scene and outside every crossfade', () => {
    const fades = [
      { id: 'a', start: 0, end: 10 },
      { id: 'b', start: 8, end: 20 },
      { id: 'c', start: 18, end: 30 },
      { id: 'd', start: 30, end: 36 },
    ];
    const own = new Map(fades.map((e) => [e.id, Array.from({ length: 40 }, (_, i) => (i - 5) * 0.7)]));
    const stops = placeStops(fades, own);
    expect(stops.length).toBeGreaterThan(0);
    for (const stop of stops) {
      const entry = fades.find((e) => e.id === stop.scene)!;
      expect(stop.t).toBeGreaterThanOrEqual(entry.start);
      expect(stop.t).toBeLessThan(entry.end);
      const others = fades.filter((e) => e.id !== stop.scene);
      // never while a second scene is on screen
      expect(others.some((e) => stop.t >= e.start && stop.t < e.end)).toBe(false);
    }
    expect(stops.map((s) => s.t)).toEqual([...stops.map((s) => s.t)].sort((x, y) => x - y));
  });

  test('a lone scene with no stops stops one frame before its end', () => {
    expect(placeStops([{ id: 'x', start: 0, end: 5 }], new Map([['x', []]]))).toEqual([{ t: 5 - FRAME, scene: 'x' }]);
  });

  test('an empty timeline has no stops', () => {
    expect(placeStops([], new Map())).toEqual([]);
  });
});

describe('clearWindow and placeInScene', () => {
  test('an entry shows alone from the end of its fade-in to the frame before the next starts', () => {
    expect(clearWindow(timeline, 0)).toEqual({ first: 0, last: 9 - FRAME });
    expect(clearWindow(timeline, 1)).toEqual({ first: 10, last: 20 - FRAME });
    expect(clearWindow(timeline, 2)).toEqual({ first: 20, last: 30 - FRAME });
  });

  test('a scene-local time lands where a stop at that time would', () => {
    const own = new Map([['a', [3, 9.5]], ['b', [0.2, 5]], ['c', [2]]]);
    const placed = placeStops(timeline, own).map((s) => s.t);
    const times = [...own].flatMap(([id, local]) => local.map((s) => placeInScene(timeline, timeline.findIndex((e) => e.id === id), s)));
    expect(times).toEqual(placed);
  });

  test('a time inside the window is only moved by the scene start', () => {
    expect(placeInScene(timeline, 1, 4)).toBe(13);
    expect(placeInScene(timeline, 1, 0)).toBe(10);
    expect(placeInScene(timeline, 0, 99)).toBeCloseTo(9 - FRAME);
  });
});
