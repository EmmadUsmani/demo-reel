// Slides mode and scene embeds, end to end in headless Chrome: bun run test:e2e.
import { beforeAll, describe, expect, test } from 'bun:test';
import type { Page } from 'playwright-core';
import { open, serve, state } from './harness';

let server: Awaited<ReturnType<typeof serve>>;
beforeAll(async () => { server = await serve(); }, 240_000);

const deck = (page: Page) => page.evaluate(() => {
  const P = (window as any).__player;
  return {
    slide: P.deck.slide as number, target: P.deck.target as number | null, stops: P.deck.stops as number[], t: P.t as number, playing: P.playing as boolean,
    count: document.querySelector('.count')!.textContent, notes: (document.querySelector('.notes') as HTMLElement).hidden ? null : document.querySelector('.notes')!.textContent,
  };
});
const waitArrived = (page: Page) => page.waitForFunction(() => { const P = (window as any).__player; return P.deck.target === null && !P.playing; }, null, { timeout: 30_000 });

describe('slides', () => {
  test('starts before slide 1; forward plays to the first stop with sound, and holds there', async () => {
    const { page, problems } = await open(server.browser, `${server.url}?mode=slides`);
    const d0 = await deck(page);
    expect(d0.slide).toBe(-1);
    expect(d0.count).toBe(`– / ${d0.stops.length}`);
    expect(d0.stops.length).toBeGreaterThan(20);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    const s = await state(page);
    expect(s.playing).toBe(true);
    expect(s.heard).toBe('mix');
    await waitArrived(page);
    const d1 = await deck(page);
    expect(d1.slide).toBe(0);
    expect(d1.t).toBeCloseTo(d1.stops[0]!, 3);
    expect(d1.count).toBe(`1 / ${d1.stops.length}`);
    expect((await state(page)).audioPaused).toBe(true);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('forward during a step finishes it; back returns at once', async () => {
    const { page } = await open(server.browser, `${server.url}?mode=slides&slide=3`);
    const d = await deck(page);
    expect(d.slide).toBe(2);
    expect(d.t).toBeCloseTo(d.stops[2]!, 3);
    await page.keyboard.press('ArrowRight'); // starts the step to slide 4
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowRight'); // finishes it
    await page.waitForTimeout(200);
    const done = await deck(page);
    expect(done).toMatchObject({ slide: 3, target: null, playing: false });
    expect(done.t).toBeCloseTo(done.stops[3]!, 3);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    const back = await deck(page);
    expect(back).toMatchObject({ slide: 2, playing: false });
    expect(back.t).toBeCloseTo(back.stops[2]!, 3);
    await page.close();
  }, 60_000);

  test("speaker notes show what's said on the way to the slide, in its written form", async () => {
    const { page } = await open(server.browser, `${server.url}?mode=slides&slide=2`);
    await page.keyboard.press('s');
    await page.waitForTimeout(150);
    const notes = (await deck(page)).notes!;
    expect(notes).toContain('Slide 2 of');
    expect(notes).toContain('One Codex agent, on one exe.dev VM');
    expect(notes).not.toContain('V.M.');
    await page.close();
  }, 60_000);

  test('switching modes keeps the place: video → slides snaps to the slide on screen', async () => {
    const { page } = await open(server.browser, server.url);
    await page.evaluate(() => (window as any).__player.seek(200));
    await page.keyboard.press('v');
    await page.waitForTimeout(150);
    const d = await deck(page);
    expect(d.stops[d.slide]!).toBeLessThanOrEqual(200);
    expect(d.stops[d.slide + 1]!).toBeGreaterThan(200);
    expect(d.t).toBeCloseTo(d.stops[d.slide]!, 3);
    expect(await page.isHidden('.track')).toBe(true);
    await page.keyboard.press('v');
    await page.waitForTimeout(150);
    expect(await page.isVisible('.track')).toBe(true);
    await page.close();
  }, 60_000);

  test('end: forward on the last slide does nothing', async () => {
    const { page } = await open(server.browser, `${server.url}?mode=slides`);
    await page.keyboard.press('End');
    const d = await deck(page);
    expect(d.slide).toBe(d.stops.length - 1);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    expect(await deck(page)).toMatchObject({ slide: d.stops.length - 1, target: null, playing: false });
    await page.close();
  }, 60_000);
});

describe('scene embed', () => {
  test('?scene= plays that scene alone: its range, its stops, and the sound from its start', async () => {
    const { page, problems } = await open(server.browser, `${server.url}?scene=pacing`);
    const s = await state(page);
    const pacing = s.scenes.find((e) => e.id === 'pacing')!;
    expect(s.from).toBeCloseTo(pacing.start, 3);
    expect(s.to).toBeCloseTo(pacing.end, 3);
    expect(await page.evaluate(() => (window as any).__player.engine.scenes.size)).toBe(1);
    const stops = (await deck(page)).stops;
    expect(stops.every((t) => t >= pacing.start && t < pacing.end)).toBe(true);
    await page.click('.big');
    await page.waitForTimeout(800);
    const playing = await state(page);
    expect(playing.t).toBeGreaterThan(pacing.start);
    expect(playing.t).toBeLessThan(pacing.start + 2);
    expect(Math.abs(playing.t - playing.audioTime!)).toBeLessThan(0.05);
    expect(await page.textContent('.time')).toMatch(/^0:0\d \/ /);
    await page.evaluate(() => { const P = (window as any).__player; P.seek(P.to - 0.4); });
    await page.waitForTimeout(1200);
    expect((await state(page)).playing).toBe(false);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('share offers a link to the moment and an iframe for the scene on screen', async () => {
    const { page } = await open(server.browser, server.url);
    await page.evaluate(() => (window as any).__player.seek(300));
    await page.click('.share-on');
    const link = await page.inputValue('.link-t');
    const embed = await page.inputValue('.embed');
    expect(link).toMatch(/\?t=300\.00$/);
    const scene = (await state(page)).scenes.filter((e) => 300 >= e.start && 300 < e.end).at(-1)!.id;
    expect(embed).toContain(`?scene=${scene}`);
    expect(embed).toMatch(/^<iframe src="http:\/\/localhost:\d+\/\?scene=/);
    await page.close();
  }, 60_000);
});
