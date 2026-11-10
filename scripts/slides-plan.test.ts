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
});
