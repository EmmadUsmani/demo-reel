import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { installBrowser, recorder } from '../testing/browser';
import { SCRIPT, written } from './script';
import VO from './vo-lengths.json';

let restore: () => void;
let kit: typeof import('./kit');
beforeAll(async () => {
  restore = installBrowser();
  kit = await import('./kit');
});
afterAll(() => restore());

const lengths = VO as Record<string, number>;

/** A scene told as `ids`, built the way the engine builds one; span() exposes the beat times a scene's visuals key off. */
async function narrated(ids: string[], hold: Record<string, number> = {}) {
  class Told extends kit.Narrated {
    protected ids = ids;
    protected hold = hold;
    render() {}
    span(id: string) { return { from: this.T(id), to: this.E(id) }; }
  }
  const scene = new Told({ g: recorder.context(), start: 0, end: 0, params: {} });
  await scene.init();
  return scene;
}

describe('Narrated: a scene told as a list of lines', () => {
  test('each beat is its measured line, a breath, and its hold; the next starts where it ends', async () => {
    const scene = await narrated(['h1', 'h3'], { h1: 1 });
    const a = scene.span('h1'), b = scene.span('h3');
    expect(a.from).toBe(0.5); // the lead-in
    expect(a.to).toBeCloseTo(0.5 + lengths.h1! + 0.3 + 1 * kit.HOLD);
    expect(b.from).toBe(a.to);
    expect(b.to).toBeCloseTo(b.from + lengths.h3! + 0.3);
    expect(scene.duration()).toBeCloseTo(b.to + 0.8); // the tail
  });

  test('the hold is only part of what a scene asks for: one dial (HOLD) sets the edit\'s pace', async () => {
    const plain = (await narrated(['h4'])).span('h4');
    const held = (await narrated(['h4'], { h4: 2 })).span('h4');
    expect(held.to - plain.to).toBeCloseTo(2 * kit.HOLD);
    expect(kit.HOLD).toBeGreaterThan(0);
    expect(kit.HOLD).toBeLessThanOrEqual(1);
  });

  test('a line without a measured length is paced at 2.4 words a second', async () => {
    SCRIPT.unmeasured = 'one two three four five six seven eight nine ten eleven twelve';
    try {
      const { from, to } = (await narrated(['unmeasured'])).span('unmeasured');
      expect(to - from).toBeCloseTo(12 / 2.4 + 0.3);
    } finally { delete SCRIPT.unmeasured; }
  });

  test('a line missing from the script is an error that names it', async () => {
    await expect(narrated(['h1', 'nope'])).rejects.toThrow("no narration line 'nope'");
  });

  test('says each line from just after its beat starts, in the script\'s words and its written form', async () => {
    const scene = await narrated(['h1', 'f3e']);
    const lines = scene.narration();
    expect(lines.map((l) => l.id)).toEqual(['h1', 'f3e']);
    for (const line of lines) {
      const { from, to } = scene.span(line.id);
      expect(line.at).toBeCloseTo(from + 0.05);
      expect(line.until).toBe(to);
      expect(line.text).toBe(SCRIPT[line.id]!);
      expect(line.caption).toBe(written(SCRIPT[line.id]!));
    }
    expect(lines[1]!.caption).toContain('CLI’s'); // "C.L.I.’s" as written
  });

  test('stops a STOP_LEAD before each beat ends, in order, each inside its own beat', async () => {
    const ids = ['h1', 'h3', 'h4'];
    const scene = await narrated(ids, { h3: 0.5 });
    const stops = scene.stops();
    expect(stops).toHaveLength(ids.length);
    ids.forEach((id, i) => {
      const { from, to } = scene.span(id);
      expect(stops[i]).toBeCloseTo(to - kit.STOP_LEAD);
      expect(stops[i]!).toBeGreaterThan(from);
    });
    expect([...stops].sort((a, b) => a - b)).toEqual(stops);
    expect(stops.at(-1)!).toBeLessThan(scene.duration());
    expect(kit.STOP_LEAD).toBe(0.7); // slides change over the last half second of a beat, with room before it
  });
});

describe('camCues: a whoosh for each camera move', () => {
  const cam = (x: number, y: number, zoom: number) => ({ x, y, zoom });

  test('says by the zoom change what kind of move it is, and spans the move', () => {
    const cues = kit.camCues([[0, cam(960, 540, 1)], [1, cam(960, 540, 2)], [3, cam(960, 540, 1)], [5, cam(1200, 540, 1)]], 0.5);
    expect(cues).toEqual([
      { kind: 'whoosh-in', t: 0, dur: 1, gain: 0.5 },
      { kind: 'whoosh-out', t: 1, dur: 2, gain: 0.5 },
      { kind: 'whoosh-across', t: 3, dur: 2, gain: 0.5 },
    ]);
  });

  test('a hold (no pan beyond a few pixels, no real zoom) makes no sound', () => {
    expect(kit.camCues([[0, cam(960, 540, 1)], [2, cam(964, 540, 1.01)], [4, cam(964, 540, 1.01)]])).toEqual([]);
  });
});

describe('small pure helpers', () => {
  test('along walks a polyline by distance, clamping at its ends', () => {
    const pts: [number, number][] = [[0, 0], [10, 0], [10, 10]];
    expect(kit.along(pts, 5)).toEqual([5, 0, 0]);
    const [x, y, angle] = kit.along(pts, 15);
    expect([x, y]).toEqual([10, 5]);
    expect(angle).toBeCloseTo(Math.PI / 2);
    expect(kit.along(pts, 999).slice(0, 2)).toEqual([10, 10]);
    expect(kit.along([[3, 4], [3, 4]], 5).slice(0, 2)).toEqual([3, 4]); // a zero-length edge is a point
  });

  test('route turns once or twice, orthogonally', () => {
    expect(kit.route.hv([0, 0], [10, 20])).toEqual([[0, 0], [10, 0], [10, 20]]);
    expect(kit.route.vh([0, 0], [10, 20])).toEqual([[0, 0], [0, 20], [10, 20]]);
    expect(kit.route.hvh([0, 0], [10, 20])).toEqual([[0, 0], [5, 0], [5, 20], [10, 20]]);
    expect(kit.route.hvh([0, 0], [10, 20], 8)[1]).toEqual([8, 0]);
    expect(kit.route.vhv([0, 0], [10, 20])).toEqual([[0, 0], [0, 10], [10, 10], [10, 20]]);
  });

  test('ticks and pops make one cue a time, with the pitch moving so repeats differ', () => {
    const ticks = kit.ticks([1, 2, 3], 0.5);
    expect(ticks.map((c) => [c.kind, c.t, c.gain])).toEqual([['tick', 1, 0.5], ['tick', 2, 0.5], ['tick', 3, 0.5]]);
    expect(new Set(ticks.map((c) => c.pitch)).size).toBe(3);
    const pops = kit.pops([0, 1, 2, 3, 4]);
    expect(pops.every((c) => c.kind === 'pop')).toBe(true);
    expect(pops[0]!.pitch).toBe(pops[4]!.pitch); // the pitch cycles every four
  });

  test('every tone has colours, and an unknown tone falls back to the plain one', () => {
    for (const t of ['agent', 'owner', 'infra', 'ext', 'bad', 'ok', 'ink', 'muted'] as const) {
      expect(Object.keys(kit.tone(t)).sort()).toEqual(['bg', 'dot', 'ink', 'line']);
    }
    expect(kit.tone('infra')).toEqual(kit.tone('nope' as any));
  });

  test('mono and measure read the font they draw with', () => {
    expect(kit.mono(20)).toBe('500 20px "JetBrains Mono"');
    const g = recorder.context();
    expect(kit.measure(g, 'abcd', 20, 500, 'mono')).toBeGreaterThan(0);
    expect(kit.measure(g, 'abcdefgh', 20)).toBeGreaterThan(kit.measure(g, 'abcd', 20));
  });
});

describe('edge labels are queued, then drawn over the nodes by flushLabels', () => {
  const drawn = (label: string) => recorder.calls.filter((c) => c.includes(`fillText("${label}"`)).length;

  test('a label appears on flush, and only once', () => {
    const g = recorder.context();
    recorder.reset();
    kit.edge(g, [[0, 0], [200, 0]], 1, { label: 'result' });
    expect(drawn('result')).toBe(0);
    kit.flushLabels();
    expect(drawn('result')).toBe(1);
    kit.flushLabels();
    expect(drawn('result')).toBe(1);
  });

  test('an edge not yet drawn has no label to flush', () => {
    const g = recorder.context();
    recorder.reset();
    kit.edge(g, [[0, 0], [200, 0]], 0, { label: 'later' });
    kit.flushLabels();
    expect(drawn('later')).toBe(0);
  });
});

describe('the diagram primitives are safe at every point of their animation', () => {
  test('nothing reaches the canvas that a real one would ignore, from not started to done', () => {
    const g = recorder.context();
    recorder.reset();
    for (let i = 0; i <= 20; i++) {
      const p = i / 20;
      g.save();
      kit.heading(g, 'kicker', 'A headline', p);
      kit.footnote(g, 'where it comes from', p);
      kit.node(g, 100, 100, 300, 120, 'Node', p, { sub: 'with a subtitle', glyph: '$', glow: p, dim: p });
      kit.frame(g, 50, 50, 600, 400, 'Group', p, 'agent');
      kit.tag(g, 500, 500, 'tag', p, 'owner', { glyph: '!' });
      kit.edge(g, [[0, 0], [300, 0], [300, 200]], p, { flow: p * 10, label: 'edge', both: true, dash: true });
      kit.flushLabels();
      kit.codeCard(g, 100, 100, 800, ['# a comment', '1. first {{SLOT}}', 'run `code`'], p, { title: 'file', hl: [[0, 1, p]], dimOthers: 0.5 });
      kit.paper(g, 10, 10, 300, 200, p, () => {}, { line: '#ccc' });
      kit.stat(g, 500, 500, 1234, 'a number', p, { suffix: 'k', decimals: 1, sub: 'more' });
      kit.ring(g, 500, 500, 100, p);
      g.restore();
    }
    expect(recorder.problems).toEqual([]);
    expect(recorder.calls.length).toBeGreaterThan(100);
  });

  test('stat counts up to its value and holds it', () => {
    const shown = (p: number) => {
      const g = recorder.context();
      recorder.reset();
      kit.stat(g, 0, 0, 1234, 'label', p);
      return recorder.calls.find((c) => /fillText\("[\d,]+"/.test(c));
    };
    expect(shown(0)).toBeUndefined();
    expect(shown(1)).toContain('"1,234"');
  });
});
