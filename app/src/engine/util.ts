// Pure helpers. Everything a scene draws must be a function of time: no Math.random, no clocks.

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const remap = (x: number, a: number, b: number, c = 0, d = 1) => lerp(c, d, clamp((x - a) / (b - a)));
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export type Ease = (t: number) => number;
export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuart: (t: number) => 1 - (1 - t) ** 4,
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutExpo: (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2),
  outBack: (t: number) => { const c = 1.4; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
  /** A settled spring: overshoots once, a little, then rests exactly at 1 by t = 1. */
  spring: (t: number) => { const s = (x: number) => 1 - Math.exp(-6.5 * x) * Math.cos(7.5 * x); return t >= 1 ? 1 : s(t) + t * (1 - s(1)); },
} satisfies Record<string, Ease>;

/** 0 → 1 over [a, b], eased. */
export const prog = (t: number, a: number, b: number, e: Ease = ease.linear) => e(clamp((t - a) / (b - a)));

/**
 * Keyframed value: [[time, value, easeInto], ...]. Holds the first value before the first key and the
 * last after the last; between two keys, the second key's ease shapes the move into it.
 */
export function keys(t: number, frames: [number, number, Ease?][]): number {
  if (t <= frames[0]![0]) return frames[0]![1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1, e = ease.inOutCubic] = frames[i]!;
    const [t0, v0] = frames[i - 1]!;
    if (t <= t1) return lerp(v0, v1, e(clamp((t - t0) / (t1 - t0))));
  }
  return frames[frames.length - 1]![1];
}

/** Deterministic PRNG (for scattering things that must land in the same place every frame). */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Frame index at 60 fps, constant over a frame: seed per-frame jitter with this, never with t. */
export const frameIdx = (t: number) => Math.floor(t * 60 + 1e-6);
