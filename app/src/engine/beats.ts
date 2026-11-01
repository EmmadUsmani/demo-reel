// Small helpers every scene uses to time and place its callouts.
import type { Box } from './assets';
import { prog } from './util';

/** A callout's presence: pops in over 0.35 s from `a`, fades out over 0.25 s ending at `b`. */
export const beat = (t: number, a: number, b: number) => Math.min(prog(t, a, a + 0.35), 1 - prog(t, b - 0.25, b));

/** The smallest box around both. */
export const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/** A box grown by `pad` px on every side (or by [x, y]). */
export const grow = (b: Box, pad: number | [number, number]): Box => {
  const [px, py] = typeof pad === 'number' ? [pad, pad] : pad;
  return { x: b.x - px, y: b.y - py, w: b.w + px * 2, h: b.h + py * 2 };
};
