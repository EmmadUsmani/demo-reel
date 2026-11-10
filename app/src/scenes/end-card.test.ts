import { afterEach, describe, expect, test } from 'bun:test';
import EndCard from './end-card';
import { fakeContext } from '../testing/fake-canvas';
import { installFakeNetwork, manifestOf, routesOf } from '../testing/footage';
import { expectAmbientMotion, expectPureRender, renderAt, visibleAlphas } from '../testing/scenes';

let network: ReturnType<typeof installFakeNetwork> | undefined;
afterEach(() => network?.restore());
let n = 0;

async function make(params: Record<string, unknown> = {}, withCard = false) {
  const footage = `end${++n}`;
  network = installFakeNetwork(routesOf(footage, manifestOf()));
  const card = withCard ? { card: { footage, shot: 'hero', key: 'cta' } } : {};
  const scene = new EndCard({ g: fakeContext(), start: 0, end: 0, params: { name: 'Acme', line: 'That is Acme.', ...card, ...params } });
  await scene.init();
  return scene;
}
const texts = (g: ReturnType<typeof fakeContext>) => g.calls('fillText').map((c) => c.args[0]);
const full = { subtitle: 'open source', pill: 'Beta', chips: ['Fast', 'Small', 'Local'] };

describe('EndCard speaker notes', () => {
  test('none unless it has a notes param; then one note, at the start of the card, so before its stop wherever a crossfade puts that', async () => {
    expect((await make()).notes()).toEqual([]);
    expect((await make({ notes: '' })).notes()).toEqual([]);
    for (const dur of [4, 5.4, 8]) {
      const scene = await make({ dur, notes: 'Thank them.' });
      expect(scene.notes()).toEqual([{ at: 0, text: 'Thank them.' }]);
    }
  });

  test('a deck card needs no line: notes without one leave the narration empty', async () => {
    expect((await make({ line: undefined, notes: 'Thank them.' })).narration()).toEqual([]);
  });
});

describe('EndCard timing and sound', () => {
  test('runs 5.4 s unless told otherwise', async () => {
    expect((await make()).duration()).toBe(5.4);
    expect((await make({ dur: 7 })).duration()).toBe(7);
  });

  test('stops a frame before the fade to the backdrop begins', async () => {
    for (const dur of [4, 5.4, 8]) expect((await make({ dur })).stops()).toEqual([dur - 0.7 - 1 / 60]);
  });

  test('speaks its line from 0.5 s until 0.4 s before the end, with the caption, and not without a line', async () => {
    expect((await make({ line: undefined })).narration()).toEqual([]);
    expect((await make({ caption: 'That is Acme!' })).narration()).toEqual([{ id: 'end', at: 0.5, until: 5, text: 'That is Acme.', caption: 'That is Acme!' }]);
  });

  test('always chimes; swishes for a card, pops for a pill, ticks once per chip panned left to right', async () => {
    const bare = (await make()).cues().map((c) => c.kind);
    expect(bare).toEqual(['chime']);
    const all = (await make(full, true)).cues();
    expect(all.map((c) => c.kind)).toEqual(['swish', 'chime', 'pop', 'tick', 'tick', 'tick']);
    const ticks = all.filter((c) => c.kind === 'tick');
    expect(ticks.map((c) => c.pan!)).toEqual([...ticks.map((c) => c.pan!)].sort((a, b) => a - b));
    expect(ticks[1]!.pan).toBeCloseTo(0);
    expect(ticks.map((c) => c.pitch!)).toEqual([...ticks.map((c) => c.pitch!)].sort((a, b) => a - b));
  });

  test('every sound lands inside the scene', async () => {
    const scene = await make({ ...full, chips: ['a', 'b', 'c', 'd'] }, true);
    for (const c of scene.cues()) {
      expect(c.t).toBeGreaterThanOrEqual(0);
      expect(c.t).toBeLessThan(scene.duration());
    }
  });
});

describe('EndCard rendering', () => {
  test('is a pure function of time with every alpha in range, bare, with everything, and with a card', async () => {
    expectPureRender(await make(), 5.4, 80);
    expectPureRender(await make(full), 5.4, 80);
    expectPureRender(await make(full, true), 5.4, 80);
    expectPureRender(await make({ ...full, dur: 3.5 }, true), 3.5, 60);
  });

  test('at the stop the name, line, pill, chips and card are all fully in', async () => {
    const scene = await make(full, true);
    const g = renderAt(scene, scene.stops()[0]!, 5.4);
    expect(texts(g)).toEqual(['BETA', 'Acme', 'open source', 'Fast', 'Small', 'Local']);
    expect(visibleAlphas(g).every((a) => a === 1)).toBe(true);
    expect(g.calls('drawImage').length).toBe(1);
  });

  test('without a card the text moves up to fill the space, and nothing is drawn as an image', async () => {
    const withCard = await make({}, true), without = await make();
    const nameY = (s: typeof withCard) => renderAt(s, 3, 5.4).calls('fillText').find((c) => c.args[0] === 'Acme')!.args[2] as number;
    expect(nameY(without)).toBeLessThan(nameY(withCard));
    expect(renderAt(without, 3, 5.4).calls('drawImage')).toEqual([]);
  });

  test('builds in order: the name, then the subtitle, then the chips one after another', async () => {
    const scene = await make(full);
    const alpha = (lt: number, text: string) => renderAt(scene, lt, 5.4).calls('fillText').find((c) => c.args[0] === text)?.alpha ?? 0;
    expect(alpha(0.3, 'Acme')).toBe(0);
    expect(alpha(0.8, 'Acme')).toBeGreaterThan(0);
    expect(alpha(0.8, 'open source')).toBe(0);
    expect(alpha(1.3, 'open source')).toBeGreaterThan(0);
    expect(alpha(1.35, 'Fast')).toBeGreaterThan(0);
    expect(alpha(1.35, 'Local')).toBe(0);
    expect(alpha(2.0, 'Local')).toBe(1);
  });

  test('a pill is written in capitals', async () => {
    expect(texts(renderAt(await make({ pill: 'Coming soon' }), 3, 5.4))).toContain('COMING SOON');
  });

  test('chips are centred as a row, in order', async () => {
    const scene = await make({ chips: ['One', 'Two', 'Three'] });
    const g = renderAt(scene, 4, 5.4);
    const rects = g.calls('roundRect').map((c) => ({ left: c.matrix[4]! + (c.args[0] as number), width: c.args[2] as number }));
    expect(rects.length).toBe(3);
    expect(rects.map((r) => r.left)).toEqual([...rects.map((r) => r.left)].sort((a, b) => a - b));
    const last = rects[2]!;
    expect((rects[0]!.left + last.left + last.width) / 2).toBeCloseTo(960, 5);
  });

  test('fades to the bare backdrop over the last 0.7 s and ends completely covered', async () => {
    const scene = await make(full, true);
    // the cover is a second full-slide backdrop drawn over everything, at the fade's alpha
    const cover = (lt: number) => renderAt(scene, lt, 5.4).calls('fillRect').filter((c) => (c.args as number[]).join() === '0,0,1920,1080')[1]?.alpha;
    expect(cover(5.4 - 0.7 - 1 / 60)).toBeUndefined(); // nothing over the card until the fade starts
    expect(cover(5.4 - 0.7)).toBeUndefined();
    expect(cover(5.4 - 0.35)).toBeGreaterThan(0);
    expect(cover(5.4 - 0.35)).toBeLessThan(1);
    expect(cover(5.4)).toBe(1);
    let previous = 0;
    for (let lt = 5.4 - 0.7 + 1 / 60; lt <= 5.4; lt += 1 / 60) {
      const alpha = cover(lt)!;
      expect(alpha).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = alpha;
    }
  });
});

describe('EndCard ambient motion', () => {
  test('the backdrop and what bobs on it follow Frame.ambient, so a held slide keeps moving', async () => {
    expectAmbientMotion(await make({}, true), 3, 5.4);
  });
});
