import { afterEach, describe, expect, test } from 'bun:test';
import { cardLayout, loadCard } from './cards';
import { installFakeNetwork, manifestOf, routesOf } from '../testing/footage';

describe('cardLayout', () => {
  test('one card sits centred over the title, a little bigger', () => {
    expect(cardLayout(1)).toEqual([[0, -200, 560 * 1.15, 0.03]]);
  });

  test('none is laid out like one (the title card draws no cards then)', () => {
    expect(cardLayout(0)).toEqual(cardLayout(1));
  });

  test('two cards lean away from each other either side of the centre', () => {
    const [left, right] = cardLayout(2);
    expect(left![0]).toBe(-right![0]);
    expect(left![3]).toBeLessThan(0);
    expect(right![3]).toBeGreaterThan(0);
  });

  test('three cards fan out with the middle one highest and biggest', () => {
    const [left, middle, right] = cardLayout(3);
    expect(left![0]).toBe(-right![0]);
    expect(middle![0]).toBe(0);
    expect(middle![1]).toBeLessThan(left![1]);
    expect(middle![2]).toBeGreaterThan(left![2]);
  });

  test('more than three lays out three', () => {
    expect(cardLayout(7)).toEqual(cardLayout(3));
  });

  test('every card is above the centre of the frame and wide enough to read, whatever the width', () => {
    for (const width of [300, 560, 800]) for (const count of [1, 2, 3]) {
      for (const [, y, w] of cardLayout(count, width)) {
        expect(y).toBeLessThan(0);
        expect(w).toBeGreaterThan(width * 0.8);
      }
    }
  });

  test('every card stays on the slide (centre within 1920 wide) at the default width', () => {
    for (const count of [1, 2, 3]) for (const [x, , w] of cardLayout(count)) expect(Math.abs(x) + w / 2).toBeLessThan(960);
  });
});

describe('loadCard', () => {
  let network: ReturnType<typeof installFakeNetwork>;
  afterEach(() => network?.restore());
  let n = 0;
  const footage = (over = {}) => {
    const name = `cards${++n}`;
    network = installFakeNetwork(routesOf(name, manifestOf(over)));
    return name;
  };

  test('a shot with no key is the whole plate', async () => {
    const card = await loadCard({ footage: footage(), shot: 'hero' });
    expect(card.crop).toEqual({ x: 0, y: 0, w: 2880, h: 1800 });
  });

  test('a key crops to that box, grown by 24 px of padding, in plate pixels (dpr 2)', async () => {
    const card = await loadCard({ footage: footage(), shot: 'hero', key: 'cta' });
    expect(card.crop).toEqual({ x: (100 - 24) * 2, y: (200 - 24) * 2, w: (300 + 48) * 2, h: (100 + 48) * 2 });
  });

  test('pad is configurable, and the crop never starts left of or above the plate', async () => {
    const name = footage();
    expect((await loadCard({ footage: name, shot: 'hero', key: 'cta', pad: 0 })).crop).toEqual({ x: 200, y: 400, w: 600, h: 200 });
    const near = await loadCard({ footage: footage({ shots: { hero: { file: 'hero.png', w: 1440, h: 900, scrollY: 0, boxes: { cta: { x: 5, y: 5, w: 50, h: 50 } } } } }), shot: 'hero', key: 'cta' });
    expect(near.crop.x).toBe(0);
    expect(near.crop.y).toBe(0);
  });

  test('a crop never runs off the right or bottom of the plate', async () => {
    const card = await loadCard({ footage: footage({ shots: { hero: { file: 'hero.png', w: 1440, h: 900, scrollY: 0, boxes: { cta: { x: 1300, y: 800, w: 300, h: 300 } } } } }), shot: 'hero', key: 'cta' });
    expect(card.crop.x + card.crop.w).toBeLessThanOrEqual(2880);
    expect(card.crop.y + card.crop.h).toBeLessThanOrEqual(1800);
  });

  test('a box on a scrolled plate is measured from the top of that plate', async () => {
    const shifted = footage({ shots: { hero: { file: 'hero.png', w: 1440, h: 900, scrollY: 150, boxes: { cta: { x: 100, y: 350, w: 300, h: 100 } } } } });
    expect((await loadCard({ footage: shifted, shot: 'hero', key: 'cta' })).crop.y).toBe((350 - 150 - 24) * 2);
  });

  test('asking for a shot or box that is not there says which', async () => {
    const name = footage();
    await expect(loadCard({ footage: name, shot: 'nope' })).rejects.toThrow(`footage/${name} has no shot 'nope'`);
    await expect(loadCard({ footage: name, shot: 'hero', key: 'nope' })).rejects.toThrow("shot 'hero' has no box 'nope'");
  });

  test('without a shot or a clip there is nothing to cut', async () => {
    await expect(loadCard({ footage: footage() })).rejects.toThrow('a card needs a shot or a clip');
  });

  test('a clip card is cut from one decoded frame of the recording', async () => {
    const name = footage();
    const card = await loadCard({ footage: name, clip: 'demo', at: 4 });
    expect(network.fetched.at(-1)).toBe(`footage/${name}/clips/demo/0004.jpg`);
    expect((card.image as any).name).toBe('clips/demo/0004.jpg');
    expect(card.crop).toEqual({ x: 0, y: 0, w: 2880, h: 1800 });
  });

  test('the frame is the clip\'s first by default, a frame number clamped into the clip, or a mark\'s frame', async () => {
    const name = footage();
    const frameOf = async (at?: string | number) => { await loadCard({ footage: name, clip: 'demo', at }); return network.fetched.at(-1)!.split('/').at(-1); };
    expect(await frameOf()).toBe('0000.jpg');
    expect(await frameOf(-3)).toBe('0000.jpg');
    expect(await frameOf(999)).toBe('0029.jpg');
    expect(await frameOf('end')).toBe('0029.jpg');
  });

  test('a mark\'s box is measured from the scroll the page had at that mark', async () => {
    const card = await loadCard({ footage: footage(), clip: 'demo', at: 'end', key: 'cta' });
    expect(card.crop.y).toBe((250 - 50 - 24) * 2);
  });

  test('a clip, mark or mark box that is not there says which', async () => {
    const name = footage();
    await expect(loadCard({ footage: name, clip: 'nope' })).rejects.toThrow(`footage/${name} has no clip 'nope'`);
    await expect(loadCard({ footage: name, clip: 'demo', at: 'nowhere' })).rejects.toThrow("clip 'demo' has no mark 'nowhere'");
    await expect(loadCard({ footage: name, clip: 'demo', at: 'end', key: 'nope' })).rejects.toThrow("clip 'demo' mark 'end' has no box 'nope'");
  });
});
