import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Engine, type TimelineEntry } from './engine';
import { H, PH, PW, Scene, SCALE, W, type Cue, type Frame, type Line, type Note, type SceneClass } from './scene';
import { expectCleanLog, fakeContext, snapshot, type FakeContext } from '../testing/fake-canvas';
import { installFakeOffscreenCanvas } from '../testing/footage';

type Opts = { duration?: number; cues?: Cue[]; narration?: Line[]; notes?: Note[]; stops?: number[]; throwsInRender?: boolean; throwsInInit?: boolean };
type Drawn = { id: string; frame: Frame; g: unknown };

let drawn: Drawn[];
let prepared: { id: string; t: number }[];
let layers: ReturnType<typeof installFakeOffscreenCanvas>;
let main: FakeContext;

beforeEach(() => {
  drawn = [];
  prepared = [];
  main = fakeContext();
  layers = installFakeOffscreenCanvas(() => fakeContext());
});
afterEach(() => layers.restore());

/** A timeline entry whose scene records what the engine asks of it. */
function entry(id: string, timing: { dur?: number; overlap?: number } = {}, opts: Opts = {}): TimelineEntry {
  class Probe extends Scene {
    async init() { if (opts.throwsInInit) throw new Error('clip not recorded'); }
    duration() { return opts.duration; }
    cues() { return opts.cues ?? []; }
    narration() { return opts.narration ?? []; }
    notes() { return opts.notes ?? []; }
    stops() { return opts.stops ?? []; }
    async prepare(f: Frame) { prepared.push({ id, t: f.t }); }
    render(f: Frame) {
      drawn.push({ id, frame: f, g: this.g });
      this.g.fillRect(0, 0, 1, 1);
      if (opts.throwsInRender) throw new Error('bad frame');
      this.g.save();
      this.g.restore();
    }
  }
  return { id, load: async () => ({ default: Probe as SceneClass }), start: 0, end: 0, ...timing };
}

async function engineOf(entries: TimelineEntry[], only?: (e: TimelineEntry) => boolean) {
  const canvas = { width: 0, height: 0, getContext: () => main } as unknown as HTMLCanvasElement;
  const engine = new Engine(canvas, () => entries);
  await engine.init(only);
  return engine;
}

const placed = (engine: Engine) => engine.timeline.map((e) => [e.id, e.start, e.end]);

describe('Engine construction', () => {
  test('sizes the canvas for the scale', async () => {
    const canvas = { width: 0, height: 0, getContext: () => main } as unknown as HTMLCanvasElement;
    new Engine(canvas, () => []);
    expect([canvas.width, canvas.height]).toEqual([PW, PH]);
    expect([PW, PH]).toEqual([W * SCALE, H * SCALE]);
  });
});

describe('laying out the timeline', () => {
  test('entries run end to end, each for its dur', async () => {
    const engine = await engineOf([entry('a', { dur: 4 }), entry('b', { dur: 6 }), entry('c', { dur: 2 })]);
    expect(placed(engine)).toEqual([['a', 0, 4], ['b', 4, 10], ['c', 10, 12]]);
    expect(engine.duration).toBe(12);
  });

  test("an entry without a dur takes the length its scene asks for, and one nobody sizes gets a second", async () => {
    const engine = await engineOf([entry('a', {}, { duration: 3.5 }), entry('b'), entry('c', { dur: 2 }, { duration: 99 })]);
    expect(placed(engine)).toEqual([['a', 0, 3.5], ['b', 3.5, 4.5], ['c', 4.5, 6.5]]);
  });

  test('overlap starts an entry before the previous one ends (a crossfade)', async () => {
    const engine = await engineOf([entry('a', { dur: 5 }), entry('b', { dur: 5, overlap: 1 }), entry('c', { dur: 3, overlap: 0.5 })]);
    expect(placed(engine)).toEqual([['a', 0, 5], ['b', 4, 9], ['c', 8.5, 11.5]]);
    expect(engine.duration).toBe(11.5);
  });

  test('an overlap on the first entry, or longer than the one before, never starts before 0', async () => {
    const engine = await engineOf([entry('a', { dur: 2, overlap: 1 }), entry('b', { dur: 2, overlap: 5 })]);
    expect(placed(engine)).toEqual([['a', 0, 2], ['b', 0, 2]]);
  });

  test("the scene is told where it sits", async () => {
    const engine = await engineOf([entry('a', { dur: 4 }), entry('b', { dur: 6 })]);
    expect((engine.scenes.get('b') as any).ctx).toMatchObject({ start: 4, end: 10 });
  });

  test('a scene that fails to load or init holds a one-second gap and is reported, and the rest still lays out', async () => {
    const broken: TimelineEntry = { ...entry('broken'), load: async () => { throw new Error('no such file'); } };
    const engine = await engineOf([entry('a', { dur: 2 }), broken, entry('failing-init', {}, { throwsInInit: true }), entry('c', { dur: 2 })]);
    expect(placed(engine)).toEqual([['a', 0, 2], ['broken', 2, 3], ['failing-init', 3, 4], ['c', 4, 6]]);
    expect([...engine.scenes.keys()]).toEqual(['a', 'c']);
    expect(engine.errors.length).toBe(2);
    expect(engine.errors[0]).toContain('broken: Error: no such file');
    expect(engine.errors[1]).toContain('failing-init');
  });

  test('`only` keeps just those scenes, but every scene still places the next', async () => {
    const engine = await engineOf([entry('a', { dur: 2 }), entry('b', {}, { duration: 3 }), entry('c', { dur: 1 })], (e) => e.id === 'c');
    expect([...engine.scenes.keys()]).toEqual(['c']);
    expect(placed(engine)).toEqual([['a', 0, 2], ['b', 2, 5], ['c', 5, 6]]);
  });
});

describe('drawing one scene', () => {
  test('hands the scene its time, local time, progress and length, on a cleared white slide at the render scale', async () => {
    const engine = await engineOf([entry('a', { dur: 2 }), entry('b', { dur: 4 })]);
    engine.render(3);
    expect(drawn.length).toBe(1);
    expect(drawn[0]!.id).toBe('b');
    expect(drawn[0]!.frame).toEqual({ t: 3, lt: 1, p: 0.25, dur: 4 });
    expect(drawn[0]!.g).toBe(main);
    const [first] = main.log;
    expect(first!.op).toBe('setTransform');
    expect(first!.args).toEqual([SCALE, 0, 0, SCALE, 0, 0]);
    const fill = main.calls('fillRect')[0]!;
    expect(fill.args).toEqual([0, 0, W, H]);
    expect(main.calls('set:fillStyle')[0]!.args[0]).toBe('#fff');
    expectCleanLog(main);
  });

  test('draws the same pixels for the same time: same call log twice', async () => {
    const engine = await engineOf([entry('a', { dur: 4 })]);
    engine.render(1.234);
    const first = snapshot(main);
    main.clear();
    engine.render(1.234);
    expect(snapshot(main)).toEqual(first);
  });

  test('an entry covers [start, end): its first instant is drawn and its end belongs to the next', async () => {
    const engine = await engineOf([entry('a', { dur: 2 }), entry('b', { dur: 2 })]);
    engine.render(0);
    engine.render(1.999);
    engine.render(2);
    engine.render(3.999);
    expect(drawn.map((d) => d.id)).toEqual(['a', 'a', 'b', 'b']);
  });

  test('before 0 and at or after the end there is nothing to draw but white', async () => {
    const engine = await engineOf([entry('a', { dur: 2 })]);
    for (const t of [-1, 2, 5]) {
      main.clear();
      engine.render(t);
      expect(main.calls('fillRect').map((c) => c.args)).toEqual([[0, 0, PW, PH]]);
      expect(main.calls('set:fillStyle').at(-1)!.args[0]).toBe('#fff');
    }
    expect(drawn).toEqual([]);
  });

  test('a scene that throws is reported once, the frame is still finished, and the state stack is left balanced', async () => {
    const engine = await engineOf([entry('bad', { dur: 3 }, { throwsInRender: true })]);
    for (const t of [0.5, 1, 2]) engine.render(t); // from one call site, as the player does
    expect(engine.errors.length).toBe(1);
    expect(engine.errors[0]).toContain('bad: Error: bad frame');
    expect(main.depth).toBe(0);
  });

  // Engine.draw restores once on a throw, so a scene that throws inside its own save() leaves that
  // save on the canvas's stack, and any clip made inside it stays in force for later frames.
  test.todo('a scene that throws inside its own save() leaves the canvas state stack balanced');
});

describe('crossfades', () => {
  const overlapping = () => engineOf([entry('a', { dur: 5 }), entry('b', { dur: 5, overlap: 1 })]);

  test('during an overlap both scenes draw, each into its own layer, not onto the screen', async () => {
    const engine = await overlapping();
    engine.render(4.5);
    expect(drawn.map((d) => d.id)).toEqual(['a', 'b']);
    expect(drawn[0]!.g).not.toBe(main);
    expect(drawn[1]!.g).not.toBe(main);
    expect(drawn[0]!.g).not.toBe(drawn[1]!.g);
    expect(drawn[0]!.frame.t).toBe(4.5);
    expect(drawn[1]!.frame).toEqual({ t: 4.5, lt: 0.5, p: 0.1, dur: 5 });
  });

  test('the earlier scene goes down at full alpha and the later one over it by how far into the overlap we are', async () => {
    const engine = await overlapping();
    const over = (t: number) => {
      main.clear();
      engine.render(t);
      const images = main.calls('drawImage');
      expect(images.length).toBe(2);
      expect(images[0]!.alpha).toBe(1);
      return images[1]!.alpha;
    };
    expect(over(4)).toBe(0);
    expect(over(4.25)).toBeCloseTo(0.25);
    expect(over(4.5)).toBeCloseTo(0.5);
    expect(over(4.999)).toBeCloseTo(0.999);
  });

  test('the fade only goes up across the overlap and stays inside 0..1', async () => {
    const engine = await overlapping();
    let previous = -1;
    for (let t = 4; t < 5; t += 1 / 60) {
      main.clear();
      engine.render(t);
      const alpha = main.calls('drawImage')[1]!.alpha;
      expect(alpha).toBeGreaterThanOrEqual(previous);
      previous = alpha;
      expectCleanLog(main);
    }
  });

  test('just before the overlap only a shows, just after it only b', async () => {
    const engine = await overlapping();
    engine.render(3.999);
    engine.render(5);
    expect(drawn.map((d) => d.id)).toEqual(['a', 'b']);
    expect(main.calls('drawImage')).toEqual([]);
  });

  test('where two scenes touch (no overlap) it is a hard cut, never a blend', async () => {
    const engine = await engineOf([entry('a', { dur: 5 }), entry('b', { dur: 5 })]);
    for (const t of [4.99, 5, 5.01]) engine.render(t);
    expect(main.calls('drawImage')).toEqual([]);
  });

  test('a zero-length overlap cannot divide by zero', async () => {
    const engine = await engineOf([entry('a', { dur: 5 }), entry('b', { dur: 5, overlap: 1e-9 })]);
    engine.render(5);
    expectCleanLog(main);
  });

  test('with three overlapping, the latest two are blended', async () => {
    const engine = await engineOf([entry('a', { dur: 10 }), entry('b', { dur: 10, overlap: 8 }), entry('c', { dur: 10, overlap: 8 })]);
    engine.render(5); // a, b and c are all on
    expect(drawn.map((d) => d.id)).toEqual(['b', 'c']);
  });
});

describe('motion blur', () => {
  test('averages sub-frames spread over the shutter, each over the running average at 1/(k+1)', async () => {
    const engine = await engineOf([entry('a', { dur: 4 })]);
    engine.render(2, 4, 0.5, 60);
    const half = 0.5 / 60;
    expect(drawn.map((d) => d.frame.t)).toEqual([0, 1, 2, 3].map((k) => 2 + ((k + 0.5) / 4 - 0.5) * half));
    expect(drawn.every((d) => d.g !== main)).toBe(true);
    expect(main.calls('drawImage').map((c) => c.alpha)).toEqual([1, 1 / 2, 1 / 3, 1 / 4]);
    expect(main.globalAlpha).toBe(1);
    expectCleanLog(main);
  });

  test('sub-frames sit symmetrically around t, so the blur does not lead or lag', async () => {
    const engine = await engineOf([entry('a', { dur: 4 })]);
    engine.render(2, 5, 1, 30);
    const times = drawn.map((d) => d.frame.t);
    expect(times.reduce((a, b) => a + b, 0) / times.length).toBeCloseTo(2);
    expect(Math.min(...times)).toBeGreaterThan(2 - 1 / 60);
    expect(Math.max(...times)).toBeLessThan(2 + 1 / 60);
  });

  test('one sample is just the frame', async () => {
    const engine = await engineOf([entry('a', { dur: 4 })]);
    engine.render(2, 1);
    expect(drawn.length).toBe(1);
    expect(drawn[0]!.g).toBe(main);
  });
});

describe('prepare', () => {
  test('prepares only the scenes on screen at t', async () => {
    const engine = await engineOf([entry('a', { dur: 2 }), entry('b', { dur: 2 }), entry('c', { dur: 2 })]);
    await engine.prepare(3);
    expect(prepared).toEqual([{ id: 'b', t: 3 }]);
  });

  test('during a crossfade it prepares both', async () => {
    const engine = await engineOf([entry('a', { dur: 4 }), entry('b', { dur: 4, overlap: 1 })]);
    await engine.prepare(3.5);
    expect(prepared.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  test('with motion blur it also prepares the frames either side of the shutter, and reaches into a neighbour at a cut', async () => {
    const engine = await engineOf([entry('a', { dur: 2 }), entry('b', { dur: 2 })]);
    const span = 0.5 / 60 / 2;
    await engine.prepare(2 - span / 2, 4);
    expect(prepared.filter((p) => p.id === 'a').map((p) => p.t).sort()).toEqual([2 - span / 2 - span, 2 - span / 2, 2 - span / 2 + span].sort());
    expect(prepared.some((p) => p.id === 'b')).toBe(true);
  });

  test('scenes not loaded are skipped', async () => {
    const engine = await engineOf([entry('a', { dur: 2 }), entry('b', { dur: 2 })], (e) => e.id === 'b');
    await engine.prepare(1);
    expect(prepared).toEqual([]);
  });
});

describe('cues, narration and stops, in video time', () => {
  const entries = () => [
    entry('a', { dur: 4 }, { cues: [{ kind: 'click', t: 3 }, { kind: 'pop', t: 1 }], narration: [{ id: 'one', at: 0.5, until: 3, text: 'Hello.' }], stops: [2] }),
    entry('b', { dur: 4, overlap: 1 }, { cues: [{ kind: 'chime', t: 0.5, gain: 0.5 }], narration: [{ id: 'two', at: 0.2, until: 2, text: 'World.', caption: 'World!' }] }),
  ];

  test('cues move by their scene\'s start, carry its id, and come out sorted', async () => {
    const engine = await engineOf(entries());
    expect(engine.cues()).toEqual([
      { kind: 'pop', t: 1, scene: 'a' },
      { kind: 'click', t: 3, scene: 'a' },
      { kind: 'chime', t: 3.5, gain: 0.5, scene: 'b' },
    ]);
  });

  test('narration moves both its ends and keeps its text and caption', async () => {
    const engine = await engineOf(entries());
    expect(engine.narration()).toEqual([
      { id: 'one', at: 0.5, until: 3, text: 'Hello.', scene: 'a' },
      { id: 'two', at: 3.2, until: 5, text: 'World.', caption: 'World!', scene: 'b' },
    ]);
  });

  test('notes move by their scene\'s start, carry its id, and come out sorted', async () => {
    const engine = await engineOf([
      entry('a', { dur: 4 }, { notes: [{ at: 3, text: 'late' }, { at: 1, text: 'early' }] }),
      entry('b', { dur: 4, overlap: 1 }, { notes: [{ at: 0.5, text: 'in b' }] }),
      entry('c', { dur: 2 }),
    ]);
    expect(engine.notes()).toEqual([
      { at: 1, text: 'early', scene: 'a' },
      { at: 3, text: 'late', scene: 'a' },
      { at: 3.5, text: 'in b', scene: 'b' },
    ]);
  });

  test('a scene that did not load adds no notes', async () => {
    const notes = [{ at: 0.5, text: 'x' }];
    const engine = await engineOf([entry('a', { dur: 2 }, { notes }), entry('b', { dur: 2 }, { notes })], (e) => e.id === 'b');
    expect(engine.notes()).toEqual([{ at: 2.5, text: 'x', scene: 'b' }]);
  });

  test('stops come from the loaded scenes, placed clear of crossfades', async () => {
    const engine = await engineOf(entries());
    const stops = engine.stops();
    expect(stops[0]).toEqual({ t: 2, scene: 'a' });
    expect(stops.length).toBe(2); // b names none: it stops on its last frame
    expect(stops[1]!.scene).toBe('b');
    expect(stops[1]!.t).toBeCloseTo(7 - 1 / 60);
  });

  test('a scene that did not load adds no sound, words or stops', async () => {
    const engine = await engineOf(entries(), (e) => e.id === 'b');
    expect(engine.cues().map((c) => c.scene)).toEqual(['b']);
    expect(engine.narration().map((c) => c.scene)).toEqual(['b']);
    expect(engine.stops().map((s) => s.scene)).toEqual(['b']);
  });
});

describe('pixels', () => {
  test('reads the whole visible canvas', async () => {
    const engine = await engineOf([entry('a', { dur: 1 })]);
    engine.pixels();
    expect(main.calls('getImageData')[0]!.args).toEqual([0, 0, PW, PH]);
  });
});
