import { afterEach, describe, expect, test } from 'bun:test';
import TitleCard from './title-card';
import { fakeContext, range } from '../testing/fake-canvas';
import { installFakeNetwork, manifestOf, routesOf } from '../testing/footage';
import { expectPureRender, renderAt, visibleAlphas } from '../testing/scenes';

let network: ReturnType<typeof installFakeNetwork> | undefined;
afterEach(() => network?.restore());
let n = 0;

async function make(params: Record<string, unknown> = {}, cards = 0) {
  const footage = `title${++n}`;
  network = installFakeNetwork(routesOf(footage, manifestOf()));
  const specs = [{ footage, shot: 'hero', key: 'cta' }, { footage, shot: 'hero' }, { footage, clip: 'demo', at: 'end', key: 'cta' }, { footage, shot: 'hero' }].slice(0, cards);
  const scene = new TitleCard({ g: fakeContext(), start: 0, end: 0, params: { name: 'Acme', ...params, ...(cards ? { cards: specs } : {}) } });
  await scene.init();
  return scene;
}
const texts = (g: ReturnType<typeof fakeContext>) => g.calls('fillText').map((c) => c.args[0]);

describe('TitleCard timing', () => {
  test('runs 5 s unless told otherwise', async () => {
    expect((await make()).duration()).toBe(5);
    expect((await make({ dur: 8 })).duration()).toBe(8);
  });

  test('stops once, a frame before it starts to clear, where everything is built', async () => {
    for (const dur of [4, 5, 9]) {
      const scene = await make({ dur });
      expect(scene.stops()).toEqual([dur - 0.7 - 1 / 60]);
    }
  });

  test('has narration only when it has a line, from 0.6 s until just before the end, with its caption', async () => {
    expect((await make()).narration()).toEqual([]);
    const lines = (await make({ line: 'Acme, a thing.', caption: 'Acme: a thing.', dur: 6 })).narration();
    expect(lines).toEqual([{ id: 'title', at: 0.6, until: 5.8, text: 'Acme, a thing.', caption: 'Acme: a thing.' }]);
    expect(lines[0]!.until).toBeLessThan(6);
  });
});

describe('TitleCard speaker notes', () => {
  test('none unless it has a notes param; then one note, at its stop', async () => {
    expect((await make()).notes()).toEqual([]);
    expect((await make({ notes: '' })).notes()).toEqual([]);
    for (const dur of [4, 5, 9]) {
      const scene = await make({ dur, notes: 'Say hello.' });
      expect(scene.notes()).toEqual([{ at: scene.stops()[0]!, text: 'Say hello.' }]);
    }
  });

  test('a deck card needs no narration line, and notes do not become narration', async () => {
    const scene = await make({ notes: 'Say hello.' });
    expect(scene.narration()).toEqual([]);
  });
});

describe('TitleCard sounds', () => {
  test('a swish per card, panned toward where it lands, then the chime, then a whoosh out at the exit', async () => {
    const scene = await make({ dur: 5 }, 3);
    const cues = scene.cues();
    const swishes = cues.filter((c) => c.kind === 'swish');
    expect(swishes.length).toBe(3);
    expect(swishes.map((c) => Math.sign(c.pan!))).toEqual([-1, 0, 1]); // left, middle, right
    expect(cues.filter((c) => c.kind === 'chime').length).toBe(1);
    const out = cues.find((c) => c.kind === 'whoosh-out')!;
    expect(out.t).toBeCloseTo(5 - 0.7);
    expect(out.dur).toBe(0.7);
  });

  test('pans stay within +-0.6 and the swishes land one after another', async () => {
    const cues = (await make({}, 3)).cues().filter((c) => c.kind === 'swish');
    for (const c of cues) expect(Math.abs(c.pan!)).toBeLessThanOrEqual(0.6);
    expect(cues.map((c) => c.t)).toEqual([...cues.map((c) => c.t)].sort((a, b) => a - b));
  });

  test('the kicker ticks only if there is one', async () => {
    expect((await make()).cues().some((c) => c.kind === 'tick')).toBe(false);
    expect((await make({ kicker: 'Open source' })).cues().some((c) => c.kind === 'tick')).toBe(true);
  });

  test('every sound happens inside the scene, in a time order of the scene\'s own', async () => {
    for (const cards of [0, 1, 2, 3, 4]) {
      const scene = await make({ kicker: 'k', dur: 5 }, cards);
      for (const c of scene.cues()) {
        expect(c.t).toBeGreaterThanOrEqual(0);
        expect(c.t + (c.dur ?? 0)).toBeLessThanOrEqual(scene.duration());
      }
    }
  });

  test('more than three card specs are cut to three', async () => {
    expect((await make({}, 4)).cues().filter((c) => c.kind === 'swish').length).toBe(3);
  });
});

describe('TitleCard rendering', () => {
  const full = { subtitle: 'A thing', kicker: 'Open source' };

  test('is a pure function of time with every alpha in range, with no cards, one, two and three', async () => {
    for (const cards of [0, 1, 2, 3]) expectPureRender(await make(full, cards), 5, 75);
  });

  test('is pure at other lengths too', async () => {
    expectPureRender(await make({ ...full, dur: 3 }, 3), 3, 45);
  });

  test('at the stop the name, line and kicker are all fully in', async () => {
    const scene = await make(full, 3);
    const [stop] = scene.stops();
    const g = renderAt(scene, stop!, 5);
    expect(texts(g)).toEqual(['Acme', 'A thing', 'Open source']);
    expect(visibleAlphas(g).filter((a) => a < 1)).toEqual([]);
    expect(g.calls('drawImage').length).toBe(3);
  });

  test('the cards come first, then the name, then the line, then the kicker', async () => {
    const scene = await make(full, 1);
    const alphaOf = (g: ReturnType<typeof fakeContext>, text: string) => g.calls('fillText').find((c) => c.args[0] === text)?.alpha ?? 0;
    expect(alphaOf(renderAt(scene, 0.2, 5), 'Acme')).toBe(0);
    expect(alphaOf(renderAt(scene, 1.2, 5), 'Acme')).toBeGreaterThan(0);
    expect(alphaOf(renderAt(scene, 1.0, 5), 'A thing')).toBe(0);
    expect(alphaOf(renderAt(scene, 1.9, 5), 'A thing')).toBeGreaterThan(0);
    expect(alphaOf(renderAt(scene, 1.7, 5), 'Open source')).toBe(0);
  });

  test('without a subtitle or kicker, only the name is written', async () => {
    const g = renderAt(await make({}, 0), 2, 5);
    expect(texts(g)).toEqual(['Acme']);
  });

  test('clears before the end, so it can crossfade or cut on a bare backdrop', async () => {
    const scene = await make(full, 3);
    for (const lt of [5 - 0.1, 5 - 1 / 60, 5]) {
      const g = renderAt(scene, lt, 5);
      expect(visibleAlphas(g).filter((a) => a > 0)).toEqual([]);
    }
  });

  test('the exit starts after the stop, not before: the stop frame is not yet fading', async () => {
    const scene = await make(full, 3);
    const stop = scene.stops()[0]!;
    expect(visibleAlphas(renderAt(scene, stop, 5)).every((a) => a === 1)).toBe(true);
    expect(visibleAlphas(renderAt(scene, stop + 0.3, 5)).some((a) => a < 1)).toBe(true);
  });

  test('fades out monotonically through the exit', async () => {
    const scene = await make(full, 1);
    let previous = Infinity;
    for (const lt of range(5 - 0.7, 5, 42)) {
      const name = renderAt(scene, lt, 5).calls('fillText').find((c) => c.args[0] === 'Acme')!.alpha;
      expect(name).toBeLessThanOrEqual(previous + 1e-12);
      previous = name;
    }
  });
});
