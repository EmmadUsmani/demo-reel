import { afterEach, describe, expect, test } from 'bun:test';
import { ClipPlayer } from './clip';
import { clip, footage, installFakeNetwork } from '../testing/footage';
import { range } from '../testing/fake-canvas';

const player = (over = {}, count = 60, name = 'demo') => new ClipPlayer(footage({ name, clips: { demo: clip(count, over) } }), 'demo');

describe('ClipPlayer construction', () => {
  test('a clip that was not recorded says how to record it', () => {
    expect(() => new ClipPlayer(footage({ name: 'vite' }), 'nope')).toThrow("no clip 'nope' in footage/vite (record it: bun capture/vite.ts)");
  });

  test('knows its frame count; its length is what has been planned so far', () => {
    const p = player();
    expect(p.frameCount).toBe(60);
    expect(p.duration).toBe(0);
  });
});

describe('frameOf', () => {
  const p = player({ marks: { open: { frame: 30, boxes: {} } } });

  test('start and end are the clip\'s own ends', () => {
    expect(p.frameOf('start')).toBe(0);
    expect(p.frameOf('end')).toBe(59);
  });

  test('a mark is its frame, a number is itself clamped into the clip', () => {
    expect(p.frameOf('open')).toBe(30);
    expect(p.frameOf(12)).toBe(12);
    expect(p.frameOf(-5)).toBe(0);
    expect(p.frameOf(1000)).toBe(59);
  });

  test('an unknown mark lists the ones there are', () => {
    expect(() => p.frameOf('close')).toThrow("clip 'demo' has no mark 'close' (marks: open)");
  });
});

describe('boxes', () => {
  const marks = {
    here: { frame: 5, boxes: { a: { x: 1, y: 100, w: 10, h: 10 } } },
    scrolled: { frame: 9, scrollY: 300, boxes: { a: { x: 1, y: 700, w: 10, h: 10 } } },
  };

  test('a mark taken at the clip\'s own scroll is reported as it was measured', () => {
    expect(player({ marks }).boxes('here').a).toEqual({ x: 1, y: 100, w: 10, h: 10 });
  });

  test('a box measured after the page scrolled moves back by the difference', () => {
    expect(player({ marks }).boxes('scrolled').a).toEqual({ x: 1, y: 400, w: 10, h: 10 });
    expect(player({ marks, scrollY: 100 }).boxes('scrolled').a!.y).toBe(700 + (100 - 300));
  });

  test('an unknown mark is an error', () => {
    expect(() => player({ marks }).boxes('gone')).toThrow("clip 'demo' has no mark 'gone'");
  });
});

describe('planning playback', () => {
  test('play lays segments end to end: duration is frames over fps over rate', () => {
    const p = player();
    p.play('start', 30);
    expect(p.duration).toBeCloseTo(0.5);
    p.play(30, 'end', 2);
    expect(p.duration).toBeCloseTo(0.5 + 29 / 120);
  });

  test('hold adds time on the last frame played, or on a frame it is given', () => {
    const p = player().play('start', 20).hold(1);
    expect(p.duration).toBeCloseTo(20 / 60 + 1);
    expect(p.frameAt(0.9)).toBe(20);
    p.hold(1, 5);
    expect(p.frameAt(20 / 60 + 1.5)).toBe(5);
  });

  test('until holds to a total length, and does nothing if already past it', () => {
    const p = player().play('start', 'end').until(3);
    expect(p.duration).toBe(3);
    expect(player().play('start', 'end').until(0.1).duration).toBeCloseTo(59 / 60);
  });
});

describe('frameAt', () => {
  test('is frame 0 with nothing planned', () => {
    expect(player().frameAt(3)).toBe(0);
  });

  test('plays at the recorded rate, frame i at i / fps', () => {
    const p = player().play('start', 'end');
    for (const i of [0, 1, 10, 30, 59]) expect(p.frameAt(i / 60)).toBe(i);
  });

  test('a faster rate skips ahead', () => {
    const p = player().play('start', 'end', 2);
    expect(p.frameAt(0.25)).toBe(30);
  });

  test('holds the first frame before the start and the last after the end', () => {
    const p = player().play('start', 'end');
    expect(p.frameAt(-5)).toBe(0);
    expect(p.frameAt(99)).toBe(59);
  });

  test('plays backwards when `to` is before `from`', () => {
    const p = player().play(40, 20);
    expect(p.frameAt(0)).toBe(40);
    expect(p.frameAt(10 / 60)).toBe(30);
    expect(p.frameAt(99)).toBe(20);
  });

  test('moves between segments without ever leaving the clip, across the whole plan', () => {
    const p = player().play('start', 25).hold(0.7).play(25, 'end', 3).hold(1, 3).play(3, 50);
    for (const t of range(-1, p.duration + 1, 500)) {
      const frame = p.frameAt(t);
      expect(Number.isInteger(frame)).toBe(true);
      expect(frame).toBeGreaterThanOrEqual(0);
      expect(frame).toBeLessThanOrEqual(59);
    }
  });

  test('a zero-length segment is stepped over', () => {
    const p = player().play(10, 10).play('start', 'end');
    expect(p.frameAt(0)).toBe(0);
    expect(p.frameAt(1 / 60)).toBe(1);
  });
});

describe('timeOf', () => {
  test('is the first scene time a frame or mark shows', () => {
    const p = player({ marks: { m: { frame: 30, boxes: {} } } }).play('start', 'end');
    expect(p.timeOf(30)).toBeCloseTo(0.5);
    expect(p.timeOf('m')).toBeCloseTo(0.5);
    expect(p.timeOf('end')).toBeCloseTo(59 / 60);
  });

  test('counts earlier segments in, and is the inverse of frameAt', () => {
    const p = player().hold(1, 0).play(10, 40, 2).hold(0.5);
    expect(p.timeOf(10)).toBeCloseTo(1);
    for (const frame of [10, 15, 25, 40]) expect(p.frameAt(p.timeOf(frame))).toBe(frame);
  });

  test('on a held frame it is the start of the hold', () => {
    const p = player().play('start', 10).hold(2);
    expect(p.timeOf(10)).toBeCloseTo(10 / 60);
  });

  test('a frame that never plays is an error naming it', () => {
    const p = player().play('start', 10);
    expect(() => p.timeOf(30)).toThrow("frame 30 (30) never plays in this scene's plan");
  });
});

describe('events', () => {
  const frames = clip(30).frames.map((f, i) => ({ ...f, key: i === 5 ? 'a' : undefined, wheel: i === 7 ? 120 : undefined }));
  const p = () => new ClipPlayer(footage({ clips: { demo: clip(30, { frames }) } }), 'demo').play('start', 'end');

  test('a press is the frame the button goes down, a release the one it comes up', () => {
    expect(p().events('press')).toHaveLength(1);
    expect(p().events('press')[0]).toBeCloseTo(10 / 60);
    expect(p().events('release')).toHaveLength(1);
    expect(p().events('release')[0]).toBeCloseTo(20 / 60);
  });

  test('keystrokes and wheel notches are the frames that carry them', () => {
    expect(p().events('key')[0]).toBeCloseTo(5 / 60);
    expect(p().events('wheel')[0]).toBeCloseTo(7 / 60);
    expect(p().events('key').length + p().events('wheel').length).toBe(2);
  });

  test('events outside the planned stretch are left out', () => {
    const half = new ClipPlayer(footage({ clips: { demo: clip(30, { frames }) } }), 'demo').play('start', 8);
    expect(half.events('key').length).toBe(1);
    expect(half.events('press')).toEqual([]);
    expect(half.events('release')).toEqual([]);
  });

  test('a button already down on the first frame counts as a press at time 0, and holding it adds no more', () => {
    const down = clip(5).frames.map((f) => ({ ...f, down: true }));
    const q = new ClipPlayer(footage({ clips: { demo: clip(5, { frames: down }) } }), 'demo').play('start', 'end');
    expect(q.events('press')).toEqual([0]);
    expect(q.events('release')).toEqual([]);
  });
});

describe('pointer and url', () => {
  test('the pointer is where the recording had it, in page px at the clip\'s scroll', () => {
    const p = player({ scrollY: 200 }).play('start', 'end');
    expect(p.pointer(5 / 60)).toEqual({ x: 50, y: 300, down: false });
    expect(p.pointer(12 / 60).down).toBe(true);
  });

  test('the address is recorded where it changes and carries forward', () => {
    const frames = clip(10).frames.map((f, i) => (i === 0 ? { ...f, url: 'https://a.dev/' } : i === 6 ? { ...f, url: 'https://a.dev/x' } : f));
    const p = new ClipPlayer(footage({ clips: { demo: clip(10, { frames }) } }), 'demo').play('start', 'end');
    expect(p.url(3 / 60)).toBe('https://a.dev/');
    expect(p.url(8 / 60)).toBe('https://a.dev/x');
  });

  test('before any address is known it is empty', () => {
    expect(player().play('start', 'end').url(0)).toBe('');
  });
});

describe('prepare and bitmap', () => {
  let network: ReturnType<typeof installFakeNetwork>;
  afterEach(() => network?.restore());
  const url = (name: string, i: number) => `footage/${name}/clips/demo/${String(i).padStart(4, '0')}.jpg`;
  const all = (name: string, count = 60) => Object.fromEntries(Array.from({ length: count }, (_, i) => [url(name, i), {}]));

  test('decodes the frame for t and the next one', async () => {
    network = installFakeNetwork(all('prep'));
    const p = player({}, 60, 'prep').play('start', 'end');
    await p.prepare(10 / 60);
    expect(network.fetched.sort()).toEqual([url('prep', 10), url('prep', 11)]);
  });

  test('at the last frame there is no next one to load', async () => {
    network = installFakeNetwork(all('last'));
    const p = player({}, 60, 'last').play('start', 'end');
    await p.prepare(99);
    expect(network.fetched).toEqual([url('last', 59)]);
  });

  test('a frame already decoded is not fetched again', async () => {
    network = installFakeNetwork(all('again'));
    const p = player({}, 60, 'again').play('start', 'end');
    await p.prepare(4 / 60);
    await p.prepare(4 / 60);
    expect(network.fetched.length).toBe(2);
  });

  test('bitmap is the decoded frame for t', async () => {
    network = installFakeNetwork(all('bm'));
    const p = player({}, 60, 'bm').play('start', 'end');
    await p.prepare(10 / 60);
    expect((p.bitmap(10 / 60) as any).name).toBe(url('bm', 10));
  });

  test('bitmap falls back to the nearest earlier frame that is decoded, and to nothing if there is none', async () => {
    network = installFakeNetwork(all('near'));
    const p = player({}, 60, 'near').play('start', 'end');
    expect(p.bitmap(30 / 60)).toBeUndefined();
    await p.prepare(28 / 60);
    expect((p.bitmap(32 / 60) as any).name).toBe(url('near', 29)); // 32, 31, 30 are not decoded; 29 is
    expect(p.bitmap(59 / 60)).toBeUndefined(); // 30 or more frames from anything decoded
  });

  test('keeps only a dozen decoded frames, closing the least recently used', async () => {
    network = installFakeNetwork(all('lru'));
    const p = player({}, 60, 'lru').play('start', 'end');
    const first = [] as unknown[];
    for (let i = 0; i < 20; i += 2) {
      await p.prepare(i / 60);
      if (i === 0) first.push(p.bitmap(0));
    }
    expect((first[0] as any).closed).toBe(true);
    expect(p.bitmap(18 / 60)).toBeDefined();
  });

  test('a frame that is not served is an error naming the url', async () => {
    network = installFakeNetwork({});
    const p = player({}, 60, 'gone').play('start', 'end');
    await expect(p.prepare(0)).rejects.toThrow(`${url('gone', 0)}: HTTP 404`);
  });
});
