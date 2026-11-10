import { describe, expect, test } from 'bun:test';
import { lost, plan, type Shot } from './slides-plan';

/** A thumbnail: white, with pixels [from, to) inked black. */
const thumb = (from: number, to: number, size = 100) => Uint8Array.from({ length: size }, (_, i) => (i >= from && i < to ? 0 : 255));
const shot = (t: number, scene: string, from: number, to: number): Shot => ({ t, scene, thumb: thumb(from, to) });
const spoken = [{ at: 0.5, text: 'one' }, { at: 4, text: 'two' }, { at: 8, text: 'three' }, { at: 12, text: 'four' }];

describe('lost', () => {
  test("is the share of a's content that b changes", () => {
    expect(lost(thumb(0, 10), thumb(0, 30))).toBe(0); // b only adds
    expect(lost(thumb(0, 10), thumb(50, 60))).toBe(1); // a new picture
    expect(lost(thumb(0, 10), thumb(5, 15))).toBeCloseTo(0.5); // half of it moved
    expect(lost(thumb(0, 0), thumb(0, 40))).toBe(0); // a blank slide has nothing to lose
  });

  test('treats the most common shade as the background, light on dark as well as dark on light', () => {
    const onBlack = (from: number, to: number) => Uint8Array.from({ length: 100 }, (_, i) => (i >= from && i < to ? 255 : 0));
    expect(lost(onBlack(0, 10), onBlack(0, 30))).toBe(0);
    expect(lost(onBlack(0, 10), onBlack(50, 60))).toBe(1);
  });

  test('refuses thumbnails of different sizes', () => {
    expect(() => lost(new Uint8Array(100), new Uint8Array(99))).toThrow('thumbnails differ in size');
  });

  test('ignores noise under the level', () => {
    expect(lost(Uint8Array.of(255, 0, 0), Uint8Array.of(255, 10, 20))).toBe(0);
  });
});

describe('plan', () => {
  test('a build step folds into the next slide, with its notes; a new picture stays', () => {
    const slides = plan([shot(3, 'a', 0, 10), shot(7, 'a', 0, 20), shot(9, 'a', 60, 70), shot(11, 'b', 0, 70)], spoken);
    expect(slides).toEqual([
      { t: 7, scene: 'a', notes: ['one', 'two'] },
      { t: 9, scene: 'a', notes: ['three'] },
      { t: 11, scene: 'b', notes: ['four'] }, // the last slide takes what's said after it
    ]);
  });

  test("a scene's last stop is always a slide, however much the next scene keeps", () => {
    expect(plan([shot(3, 'a', 0, 10), shot(7, 'b', 0, 10)], spoken).map((s) => s.t)).toEqual([3, 7]);
  });

  test('with builds on, every stop is a slide, and every line lands on exactly one', () => {
    const slides = plan([shot(3, 'a', 0, 10), shot(7, 'a', 0, 11), shot(13, 'a', 0, 12)], spoken, { builds: true });
    expect(slides.map((s) => s.t)).toEqual([3, 7, 13]);
    expect(slides.flatMap((s) => s.notes)).toEqual(['one', 'two', 'three', 'four']);
  });

  test('no stops, no slides', () => {
    expect(plan([], spoken)).toEqual([]);
    expect(plan([], spoken, { builds: true })).toEqual([]);
  });

  test('a lone stop is a slide that takes every line, including the ones before it', () => {
    expect(plan([shot(5, 'a', 0, 10)], spoken)).toEqual([{ t: 5, scene: 'a', notes: ['one', 'two', 'three', 'four'] }]);
  });

  test('a line is on the slide whose time it is at or before: one exactly at a stop belongs to that stop, not the next', () => {
    const slides = plan([shot(4, 'a', 0, 10), shot(8, 'a', 60, 70), shot(12, 'a', 30, 40)], spoken);
    expect(slides.map((s) => s.notes)).toEqual([['one', 'two'], ['three'], ['four']]);
  });

  test('the threshold decides how much change is a new slide', () => {
    const half = [shot(3, 'a', 0, 10), shot(7, 'a', 5, 15)]; // half of the first picture is gone in the next
    expect(plan(half, spoken, { threshold: 0.4 }).map((s) => s.t)).toEqual([3, 7]);
    expect(plan(half, spoken, { threshold: 0.6 }).map((s) => s.t)).toEqual([7]);
  });

  test('a build step is only folded into the next stop in its own scene', () => {
    const slides = plan([shot(3, 'a', 0, 10), shot(7, 'b', 0, 20), shot(11, 'b', 0, 30)], spoken);
    expect(slides.map((s) => [s.scene, s.t])).toEqual([['a', 3], ['b', 11]]); // b's first stop builds into its second
  });

  test('a chain of build steps folds down to the last one', () => {
    const slides = plan([shot(3, 'a', 0, 10), shot(5, 'a', 0, 20), shot(7, 'a', 0, 30), shot(9, 'a', 0, 40)], spoken);
    expect(slides.map((s) => s.t)).toEqual([9]);
    expect(slides[0]!.notes).toEqual(['one', 'two', 'three', 'four']);
  });

  test('no lines is no notes', () => {
    expect(plan([shot(3, 'a', 0, 10), shot(7, 'a', 60, 70)], []).map((s) => s.notes)).toEqual([[], []]);
  });
});
