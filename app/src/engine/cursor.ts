// Where the pointer is, in page px. Moves are eased and bow slightly off the straight line, the way
// a hand moves a mouse; clicks are instants the press and ripple are timed from.
import { clamp, ease, type Ease } from './util';

export type CursorKey = [t: number, x: number, y: number, easeInto?: Ease];

export function cursorAt(t: number, keys: CursorKey[]): { x: number; y: number } {
  if (t <= keys[0]![0]) return { x: keys[0]![1], y: keys[0]![2] };
  for (let i = 1; i < keys.length; i++) {
    const [t1, x1, y1, e = ease.inOutCubic] = keys[i]!;
    const [t0, x0, y0] = keys[i - 1]!;
    if (t > t1) continue;
    const k = e(clamp((t - t0) / (t1 - t0)));
    const dx = x1 - x0, dy = y1 - y0;
    const bow = 0.12 * Math.sin(Math.PI * k);
    return { x: x0 + dx * k - dy * bow, y: y0 + dy * k + dx * bow };
  }
  const last = keys[keys.length - 1]!;
  return { x: last[1], y: last[2] };
}

/** 0..1 squeeze around each click (down fast, up a little slower). */
export function pressAt(t: number, clicks: number[]) {
  let press = 0;
  for (const c of clicks) {
    const k = t - c;
    if (k > -0.06 && k <= 0) press = Math.max(press, 1 + k / 0.06);
    else if (k > 0 && k < 0.14) press = Math.max(press, 1 - k / 0.14);
  }
  return press;
}

/** Time since the most recent click at or before t (Infinity if none). */
export function sinceClick(t: number, clicks: number[]) {
  const past = clicks.filter((c) => c <= t);
  return past.length ? t - past[past.length - 1]! : Infinity;
}
