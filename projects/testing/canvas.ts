// A small fake CanvasRenderingContext2D for tests: it records every call (and every property set) as a
// line of text, checks the arguments the way a real canvas would, and tracks the transform and the
// save stack. A real canvas ignores most bad values silently (NaN sizes, an alpha of 3), so a scene
// that passes one draws something wrong with no error; the fake turns each into a `problem`.

const NUMBER_PROPS = new Set(['globalAlpha', 'lineWidth', 'miterLimit', 'lineDashOffset', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY']);
const DEFAULTS: Record<string, unknown> = {
  globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, lineCap: 'butt',
  lineJoin: 'miter', miterLimit: 10, lineDashOffset: 0, font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
  shadowColor: 'rgba(0, 0, 0, 0)', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, imageSmoothingEnabled: true,
  imageSmoothingQuality: 'low', filter: 'none', letterSpacing: '0px', direction: 'inherit',
};

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const asMatrix = (m: any): Matrix => [m.a, m.b, m.c, m.d, m.e, m.f];
const toDOMMatrix = (m: Matrix) => ({ a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] });

/** The strings that give away a number that went wrong before it was written into a colour or a font. */
const BAD_TEXT = /NaN|Infinity|undefined|\[object/;

export class Recorder {
  /** One line per call or property set, in order, across every context this recorder made. */
  calls: string[] = [];
  /** Everything a real canvas would reject or silently ignore. */
  problems: string[] = [];
  private contexts = 0;
  private stacks: unknown[][] = [];
  private things = new WeakMap<object, string>();
  private count = 0;

  reset() { this.calls = []; this.problems = []; }

  /** save()s not yet restored, across every context: a frame must leave none behind. */
  openSaves() { return this.stacks.reduce((n, stack) => n + stack.length, 0); }

  /** A stable name for an object passed to the context (a canvas, a gradient, a bitmap). */
  private name(thing: object): string {
    let id = this.things.get(thing);
    if (!id) {
      const kind = (thing as any).__kind ?? (Array.isArray(thing) ? 'array' : thing.constructor?.name ?? 'object');
      id = `${kind}#${++this.count}`;
      this.things.set(thing, id);
    }
    return id;
  }

  private show(value: unknown): string {
    if (typeof value === 'number') return String(Math.round(value * 1e6) / 1e6);
    if (typeof value === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((v) => this.show(v)).join(',')}]`;
    if (value && typeof value === 'object') {
      if ('width' in value && 'height' in value && !('__kind' in value)) return `bitmap(${(value as any).width}x${(value as any).height})`;
      return this.name(value);
    }
    return String(value);
  }

  /** Every number, however deeply nested, must be finite; every string free of the marks of a bad number. */
  private inspect(op: string, value: unknown, depth = 0) {
    if (typeof value === 'number' && !Number.isFinite(value)) this.problems.push(`${op}: ${value}`);
    else if (typeof value === 'string' && BAD_TEXT.test(value)) this.problems.push(`${op}: ${JSON.stringify(value)}`);
    else if (Array.isArray(value) && depth < 3) value.forEach((v) => this.inspect(op, v, depth + 1));
  }

  context(): CanvasRenderingContext2D {
    const id = ++this.contexts;
    const rec = this;
    const state: Record<string, unknown> = { ...DEFAULTS };
    let matrix: Matrix = [...IDENTITY];
    const stack: { state: Record<string, unknown>; matrix: Matrix }[] = [];
    rec.stacks.push(stack);

    const note = (op: string, args: unknown[]) => {
      rec.inspect(op, args);
      rec.calls.push(`${id}.${op}(${args.map((a) => rec.show(a)).join(',')})`);
    };
    const gradient = (kind: string) => ({ __kind: kind, addColorStop(offset: number, color: string) {
      if (!(offset >= 0 && offset <= 1)) rec.problems.push(`addColorStop offset ${offset}`);
      rec.inspect('addColorStop', [offset, color]);
      rec.calls.push(`${rec.name(this)}.addColorStop(${rec.show(offset)},${rec.show(color)})`);
    } });

    const methods: Record<string, (...args: any[]) => unknown> = {
      save: () => { stack.push({ state: { ...state }, matrix: [...matrix] }); },
      restore: () => {
        const top = stack.pop();
        if (!top) { rec.problems.push('restore() without a save()'); return; }
        Object.assign(state, top.state);
        matrix = top.matrix;
      },
      translate: (x, y) => { matrix = multiply(matrix, [1, 0, 0, 1, x, y]); },
      scale: (x, y) => { matrix = multiply(matrix, [x, 0, 0, y, 0, 0]); },
      rotate: (a) => { matrix = multiply(matrix, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); },
      transform: (a, b, c, d, e, f) => { matrix = multiply(matrix, [a, b, c, d, e, f]); },
      setTransform: (...args) => { matrix = args.length === 1 ? asMatrix(args[0]) : (args as Matrix); },
      resetTransform: () => { matrix = [...IDENTITY]; },
      getTransform: () => toDOMMatrix(matrix),
      measureText: (text: string) => ({ width: String(text).length * parseFloat(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? '10') * 0.55 }),
      createLinearGradient: () => gradient('LinearGradient'),
      createRadialGradient: (...args) => {
        if (args[2] < 0 || args[5] < 0) rec.problems.push(`createRadialGradient: negative radius (${args[2]}, ${args[5]})`);
        return gradient('RadialGradient');
      },
      createPattern: () => ({ __kind: 'Pattern' }),
      arc: (_x, _y, r) => { if (r < 0) rec.problems.push(`arc: negative radius ${r}`); },
      ellipse: (_x, _y, rx, ry) => { if (rx < 0 || ry < 0) rec.problems.push(`ellipse: negative radius (${rx}, ${ry})`); },
      roundRect: (_x, _y, _w, _h, radii) => {
        if ([radii].flat().some((r) => typeof r === 'number' && r < 0)) rec.problems.push(`roundRect: negative radius ${JSON.stringify(radii)}`);
      },
      setLineDash: (dash: number[]) => { if (dash.some((d) => d < 0)) rec.problems.push(`setLineDash: negative ${dash}`); },
      getLineDash: () => [],
      isPointInPath: () => false,
    };
    const silent = new Set(['getTransform', 'measureText', 'getLineDash', 'isPointInPath']);

    return new Proxy({}, {
      get(_target, key: string) {
        if (key in state) return state[key];
        if (key === 'canvas') return { width: 1920, height: 1080 };
        if (key === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
        return (...args: any[]) => {
          if (!silent.has(key)) note(key, args);
          else rec.inspect(key, args);
          return methods[key]?.(...args);
        };
      },
      set(_target, key: string, value) {
        rec.inspect(`set ${key}`, [value]);
        // a real canvas ignores an alpha outside 0..1 and any other bad number, and keeps the old value
        if (key === 'globalAlpha' && !(value >= 0 && value <= 1)) rec.problems.push(`globalAlpha = ${value} (ignored by a real canvas)`);
        else if (NUMBER_PROPS.has(key) && typeof value === 'number' && !Number.isFinite(value)) { /* already reported */ }
        else {
          state[key] = value;
          rec.calls.push(`${id}.${key}=${rec.show(value)}`);
        }
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
  }

  canvas(width: number, height: number) {
    const ctx = this.context();
    return { __kind: 'Canvas', width, height, getContext: () => ctx } as unknown as HTMLCanvasElement;
  }
}
