import { describe, expect, test } from 'bun:test';
import { FRAME, placeStops } from './stops';

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
});
