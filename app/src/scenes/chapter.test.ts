import { afterEach, describe, expect, test } from 'bun:test';
import Chapter from './chapter';
import { fakeContext } from '../testing/fake-canvas';
import { installFakeNetwork, manifestOf, routesOf } from '../testing/footage';
import { expectPureRender, renderAt, visibleAlphas } from '../testing/scenes';

let network: ReturnType<typeof installFakeNetwork> | undefined;
afterEach(() => network?.restore());
let n = 0;
const DUR = 2.6;

async function make(withStill = false, params: Record<string, unknown> = {}) {
  const footage = `chapter${++n}`;
  network = installFakeNetwork(routesOf(footage, manifestOf()));
  const still = withStill ? { still: { footage, clip: 'demo', frame: 3 } } : {};
  const scene = new Chapter({ g: fakeContext(), start: 0, end: 0, params: { title: 'The editor', subtitle: 'Draw, type, drag', ...still, ...params } });
  await scene.init();
  return { scene, footage };
}
const texts = (g: ReturnType<typeof fakeContext>) => g.calls('fillText').map((c) => c.args[0]);

describe('Chapter speaker notes', () => {
  test('none unless it has a notes param; then one note, at its stop', async () => {
    expect((await make()).scene.notes()).toEqual([]);
    const { scene } = await make(false, { notes: 'Introduce the factory.' });
    expect(scene.notes()).toEqual([{ at: scene.stops()[0]!, text: 'Introduce the factory.' }]);
    expect(scene.narration()).toEqual([]);
  });
});

describe('Chapter timing and sound', () => {
  test('is 2.6 s long whatever the params say', async () => {
    expect((await make()).scene.duration()).toBe(DUR);
    expect((await make(false, { dur: 9 })).scene.duration()).toBe(DUR);
  });

  test('stops a frame before the exit starts, with the whole card built', async () => {
    const { scene } = await make();
    expect(scene.stops()).toEqual([DUR - 0.45 - 1 / 60]);
  });

  test('swishes in, then ticks, inside the scene; says nothing', async () => {
    const { scene } = await make();
    expect(scene.cues().map((c) => c.kind)).toEqual(['swish', 'tick']);
    for (const c of scene.cues()) expect(c.t).toBeLessThan(DUR);
    expect(scene.narration()).toEqual([]);
  });
});

describe('Chapter rendering', () => {
  test('is a pure function of time with every alpha in range, with and without a still', async () => {
    for (const withStill of [false, true]) {
      const { scene } = await make(withStill);
      await scene.prepare({ t: 0, lt: 1, p: 0, dur: DUR });
      expectPureRender(scene, DUR, 78);
    }
  });

  test('without a still it draws only the title and line', async () => {
    const { scene } = await make();
    const g = renderAt(scene, 2, DUR);
    expect(texts(g)).toEqual(['The editor', 'Draw, type, drag']);
    expect(g.calls('drawImage')).toEqual([]);
  });

  test('the still shows only once its frame is decoded, then as a polaroid', async () => {
    const { scene, footage } = await make(true);
    expect(renderAt(scene, 1, DUR).calls('drawImage')).toEqual([]);
    await scene.prepare({ t: 0, lt: 1, p: 0, dur: DUR });
    expect(network!.fetched).toContain(`footage/${footage}/clips/demo/0003.jpg`);
    const g = renderAt(scene, 1, DUR);
    expect(g.calls('drawImage').length).toBe(1);
  });

  test('at the stop the title, line and still are fully in', async () => {
    const { scene } = await make(true);
    await scene.prepare({ t: 0, lt: 1, p: 0, dur: DUR });
    const g = renderAt(scene, scene.stops()[0]!, DUR);
    expect(visibleAlphas(g)).toEqual([1, 1, 1]);
  });

  test('the title rises first and the line follows it', async () => {
    const { scene } = await make();
    const alpha = (lt: number, text: string) => renderAt(scene, lt, DUR).calls('fillText').find((c) => c.args[0] === text)!.alpha;
    expect(alpha(0.3, 'The editor')).toBe(0);
    expect(alpha(0.8, 'The editor')).toBeGreaterThan(0);
    expect(alpha(0.55, 'Draw, type, drag')).toBe(0);
    expect(alpha(1.0, 'Draw, type, drag')).toBeGreaterThan(0);
  });

  test('fades out through the last 0.45 s: nearly gone on the last frame, gone at the end', async () => {
    const { scene } = await make(true);
    await scene.prepare({ t: 0, lt: 1, p: 0, dur: DUR });
    expect(Math.max(...visibleAlphas(renderAt(scene, DUR - 1 / 60, DUR)))).toBeLessThan(0.15);
    expect(visibleAlphas(renderAt(scene, DUR, DUR)).filter((a) => a > 0)).toEqual([]);
    let previous = 1;
    for (let lt = DUR - 0.45; lt <= DUR; lt += 1 / 60) {
      const alpha = Math.max(...visibleAlphas(renderAt(scene, lt, DUR)));
      expect(alpha).toBeLessThanOrEqual(previous + 1e-9);
      previous = alpha;
    }
  });

  test('the exit does not begin before the stop', async () => {
    const { scene } = await make(true);
    await scene.prepare({ t: 0, lt: 1, p: 0, dur: DUR });
    expect(visibleAlphas(renderAt(scene, scene.stops()[0]!, DUR)).every((a) => a === 1)).toBe(true);
  });
});
