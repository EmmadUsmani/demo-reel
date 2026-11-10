// Which stops become slides in a static deck (scripts/slides.ts), and what each slide's notes say.
// Pure, so it is unit-tested (slides-plan.test.ts).
import { slideNotes, type Spoken } from '../app/src/engine/notes';

/** A stop rendered small: its time, scene, and a greyscale thumbnail to compare pictures by. */
export type Shot = { t: number; scene: string; thumb: Uint8Array };
export type { Spoken };
export type Slide = { t: number; scene: string; notes: string[] };

/** How far (of 255) a pixel must move to count: above compression and antialiasing noise. */
const LEVEL = 24;

/**
 * How much of `a`'s content is gone or changed in `b`: of the pixels in `a` that aren't its background
 * (its most common shade), the share that differ in `b`. A build step (`b` only adds) loses ~0; a new
 * picture, a camera move or a cleared slide loses most of it.
 */
export function lost(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) throw new Error('thumbnails differ in size');
  const counts = new Uint32Array(256);
  for (const v of a) counts[v]!++;
  const background = counts.indexOf(Math.max(...counts));
  let content = 0, gone = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i]! - background) <= LEVEL) continue;
    content++;
    if (Math.abs(a[i]! - b[i]!) > LEVEL) gone++;
  }
  return content ? gone / content : 0;
}

/**
 * The slides, in order. With `builds` off (the default), a stop whose content the next stop in its
 * scene keeps (it loses less than `threshold` of it) is a build step: the next stop stands for both. A
 * slide's notes are the ones the player shows (engine/notes.ts): the `authored` notes on the way to it, else
 * the lines `spoken` on the way (the last slide also takes any said after it).
 */
export function plan(shots: Shot[], spoken: Spoken[], { builds = false, threshold = 0.1, authored = [] as Spoken[] } = {}): Slide[] {
  const kept = shots.filter((shot, i) => {
    const next = shots[i + 1];
    return builds || !next || next.scene !== shot.scene || lost(shot.thumb, next.thumb) >= threshold;
  });
  const stops = kept.map((shot) => shot.t);
  return kept.map((shot, k) => ({ t: shot.t, scene: shot.scene, notes: slideNotes({ authored, spoken }, stops, -Infinity, k, true) }));
}
