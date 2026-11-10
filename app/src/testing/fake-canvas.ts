// A recording stand-in for CanvasRenderingContext2D (bun has no DOM canvas). It logs every call and
// every property set, keeps the save/restore stack and the current transform, and gives text a
// deterministic width, so a test can ask what a scene drew without pixels.
import { expect } from 'bun:test';

export type Matrix = [a: number, b: number, c: number, d: number, e: number, f: number];
export type Call = {
  /** The method name, or `set:<property>` for an assignment. */
  op: string;
  args: unknown[];
  /** globalAlpha and the transform in force when the call was made. */
  alpha: number;
  matrix: Matrix;
};

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const STATE_DEFAULTS = {
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  fillStyle: '#000000',
  strokeStyle: '#000000',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  font: '10px sans-serif',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  shadowColor: 'rgba(0, 0, 0, 0)',
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  imageSmoothingEnabled: true,
  imageSmoothingQuality: 'low',
};
type State = typeof STATE_DEFAULTS;

const multiply = ([a, b, c, d, e, f]: Matrix, [a2, b2, c2, d2, e2, f2]: Matrix): Matrix =>
  [a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f];

export type FakeContext = CanvasRenderingContext2D & {
  log: Call[];
  /** Open save() calls (0 once a drawing has cleaned up after itself). */
  depth: number;
  matrix: Matrix;
  /** The calls with this method name (or `set:<property>`). */
  calls(op: string): Call[];
  /** A point through the current transform, as the canvas would place it. */
  toDevice(x: number, y: number): [number, number];
  clear(): void;
};

/** Width of text in the fake: half the font size per character. */
export const textWidth = (font: string, text: string) => text.length * parseFloat(/([\d.]+)px/.exec(font)?.[1] ?? '10') * 0.5;

export function fakeContext(): FakeContext {
  const target: any = { log: [] as Call[], depth: 0, matrix: [...IDENTITY] as Matrix, ...STATE_DEFAULTS };
  const stack: { state: State; matrix: Matrix }[] = [];

  const record = (op: string, args: unknown[]) => target.log.push({ op, args, alpha: target.globalAlpha, matrix: [...target.matrix] });
  const apply = (m: Matrix) => { target.matrix = multiply(target.matrix, m); };

  const methods: Record<string, (...args: any[]) => unknown> = {
    save: () => {
      stack.push({ state: Object.fromEntries(Object.keys(STATE_DEFAULTS).map((k) => [k, target[k]])) as State, matrix: [...target.matrix] as Matrix });
      target.depth = stack.length;
    },
    restore: () => {
      const top = stack.pop();
      target.depth = stack.length;
      if (top) { Object.assign(target, top.state); target.matrix = top.matrix; }
    },
    translate: (x: number, y: number) => apply([1, 0, 0, 1, x, y]),
    scale: (x: number, y: number) => apply([x, 0, 0, y, 0, 0]),
    rotate: (angle: number) => apply([Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]),
    transform: (...m: Matrix) => apply(m),
    setTransform: (...m: Matrix) => { target.matrix = m; },
    resetTransform: () => { target.matrix = [...IDENTITY]; },
    measureText: (text: string) => ({ width: textWidth(target.font, text) }),
    createLinearGradient: (...args: number[]) => gradient('linear', args),
    createRadialGradient: (...args: number[]) => gradient('radial', args),
  };
  const gradient = (kind: string, args: number[]) => {
    const g = { kind, args, stops: [] as [number, string][], addColorStop(at: number, color: string) { g.stops.push([at, color]); } };
    return g;
  };
  const helpers: Record<string, unknown> = {
    calls: (op: string) => target.log.filter((c: Call) => c.op === op),
    toDevice: (x: number, y: number) => { const [a, b, c, d, e, f] = target.matrix as Matrix; return [a * x + c * y + e, b * x + d * y + f]; },
    clear: () => { target.log.length = 0; },
  };

  return new Proxy(target, {
    get(obj, prop: string | symbol) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (prop in helpers) return helpers[prop];
      if (prop in obj) return obj[prop];
      if (prop === 'canvas') return { width: 1920, height: 1080 };
      return (...args: unknown[]) => {
        record(prop, args);
        return methods[prop]?.(...args);
      };
    },
    set(obj, prop: string, value) {
      if (prop in STATE_DEFAULTS) record(`set:${prop}`, [value]);
      obj[prop] = value;
      return true;
    },
  }) as FakeContext;
}

/** The log without the bookkeeping, for comparing two renders: same calls, same alpha, same transform. */
export const snapshot = (g: FakeContext) => g.log.map((c) => [c.op, c.args, c.alpha, c.matrix]);

const numbers = (value: unknown, found: number[] = []): number[] => {
  if (typeof value === 'number') found.push(value);
  else if (Array.isArray(value)) value.forEach((v) => numbers(v, found));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => numbers(v, found));
  return found;
};

const COLOUR_ALPHA = /rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([-\d.eE]+)\s*\)/g;
const colours = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(colours);
  if (value && typeof value === 'object') return Object.values(value).flatMap(colours);
  return [];
};

/**
 * What every drawing must satisfy: no NaN or Infinity in any argument, globalAlpha and every rgba()
 * alpha within [0, 1], and the save/restore stack back where it started.
 */
export function expectCleanLog(g: FakeContext, depth = 0) {
  const bad = g.log.filter((c) => numbers(c.args).some((n) => !Number.isFinite(n)));
  expect(bad.map((c) => `${c.op}(${c.args.join(', ')})`)).toEqual([]);
  const alphas = g.log.filter((c) => c.op === 'set:globalAlpha').map((c) => c.args[0] as number);
  expect(alphas.filter((a) => !(a >= 0 && a <= 1))).toEqual([]);
  const drawn = g.log.flatMap((c) => c.op === 'fill' || c.op === 'stroke' || c.op.startsWith('fill') || c.op.startsWith('stroke') || c.op === 'drawImage' ? [c.alpha] : []);
  expect(drawn.filter((a) => !(a >= 0 && a <= 1))).toEqual([]);
  const badColours = g.log.flatMap((c) => colours(c.args).flatMap((s) => [...s.matchAll(COLOUR_ALPHA)].map((m) => +m[1]!))).filter((a) => !(a >= 0 && a <= 1));
  expect(badColours).toEqual([]);
  expect(g.depth).toBe(depth);
  expect(g.matrix.every(Number.isFinite)).toBe(true);
}

/** Times from `from` to `to` inclusive, `n` steps apart evenly. */
export const range = (from: number, to: number, n: number) => Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
