// The single-file player (scripts/build.ts --single), end to end in headless Chrome: opened from file://,
// with no server, and under the strict policy of a Claude artifact. bun run test:e2e.
import { beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { buildSingle, open, readCaptions, ROOT, serve, serveAsArtifact, state } from './harness';

let server: Awaited<ReturnType<typeof serve>>;
let file: string;
beforeAll(async () => { server = await serve(); file = buildSingle(); }, 240_000);

const fileUrl = (f: string, suffix = '') => `file://${f}${suffix}`;

/** Whether the canvas shows a picture: its pixels, shrunk to a grid, are not all one colour. */
const drawsSomething = (page: Page) => page.evaluate(() => {
  const small = document.createElement('canvas');
  small.width = 32; small.height = 18;
  const g = small.getContext('2d')!;
  g.drawImage(document.querySelector('canvas')!, 0, 0, 32, 18);
  const px = g.getImageData(0, 0, 32, 18).data;
  const colours = new Set<string>();
  for (let i = 0; i < px.length; i += 4) colours.add(`${px[i]},${px[i + 1]},${px[i + 2]}`);
  return colours.size;
});

describe('opened from file://', () => {
  test('boots on the poster with no errors, no failed request, and a picture on the canvas', async () => {
    const { page, problems } = await open(server.browser, fileUrl(file));
    expect((await state(page)).t).toBeGreaterThan(0);
    expect(await drawsSomething(page)).toBeGreaterThan(8);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('captions come from the embedded captions.json', async () => {
    const { page, problems } = await open(server.browser, fileUrl(file));
    const line = (await readCaptions()).find((c) => c.text.includes('VM'))!;
    await page.click('.big');
    await page.keyboard.press('c');
    await page.evaluate((t) => (window as any).__player.seek(t), (line.at + line.end) / 2);
    await page.waitForTimeout(300);
    expect((await state(page)).caption).toBe(line.text);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('the sound plays: the mix track advances with the picture', async () => {
    const { page, problems } = await open(server.browser, fileUrl(file));
    await page.click('.big');
    await page.waitForFunction(() => (window as any).__player.track()?.currentTime > 1.2, null, { timeout: 15_000 });
    const s = await state(page);
    expect(s).toMatchObject({ playing: true, heard: 'mix', audioPaused: false });
    expect(Math.abs(s.t - s.audioTime!)).toBeLessThan(0.1);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('slides mode opens from the query and from the #slides name, and forward reaches the first stop', async () => {
    for (const suffix of ['?mode=slides', '#slides']) {
      const { page, problems } = await open(server.browser, fileUrl(file, suffix));
      const deck = () => page.evaluate(() => { const P = (window as any).__player; return { slide: P.deck.slide as number, target: P.deck.target as number | null, t: P.t as number, stop: P.deck.stops[0] as number, playing: P.playing as boolean }; });
      expect((await deck()).slide).toBe(-1);
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => { const P = (window as any).__player; return P.deck.target === null && !P.playing && P.deck.slide === 0; }, null, { timeout: 30_000 });
      const d = await deck();
      expect(d.t).toBeCloseTo(d.stop, 3);
      expect(problems).toEqual([]);
      await page.close();
    }
  }, 90_000);

  test('a screenshot at 1440x900', async () => {
    const { page } = await open(server.browser, fileUrl(file));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.click('.big');
    await page.evaluate(() => (window as any).__player.seek(100));
    await page.waitForTimeout(800);
    mkdirSync(path.join(ROOT, 'out/shots'), { recursive: true });
    await page.screenshot({ path: path.join(ROOT, 'out/shots/single-file.png') });
    await page.close();
  }, 60_000);
});

describe('under an artifact\'s content security policy', () => {
  test('plays, with sound and captions, and no policy violation', async () => {
    const host = serveAsArtifact(file);
    const { page, problems } = await open(server.browser, host.url);
    expect(await drawsSomething(page)).toBeGreaterThan(8);
    const line = (await readCaptions()).find((c) => c.text.includes('VM'))!;
    await page.click('.big');
    await page.keyboard.press('c');
    await page.waitForFunction(() => (window as any).__player.track()?.currentTime > 1.2, null, { timeout: 15_000 });
    expect(await state(page)).toMatchObject({ playing: true, heard: 'mix', audioPaused: false });
    await page.evaluate((t) => (window as any).__player.seek(t), (line.at + line.end) / 2);
    await page.waitForTimeout(300);
    expect((await state(page)).caption).toBe(line.text);
    expect(problems).toEqual([]);
    await page.close();
    host.stop();
  }, 60_000);

  test('the policy is really in force: a sandboxed origin where no connection is allowed, not even to a data: URL', async () => {
    const host = serveAsArtifact(file);
    const { page } = await open(server.browser, host.url);
    expect(await page.evaluate(() => origin)).toBe('null');
    const refused = (url: string) => page.evaluate((u) => new Promise<boolean>((done) => {
      const request = new XMLHttpRequest(); // the page's fetch is the shim's: ask the browser directly
      request.onload = () => done(false);
      request.onerror = () => done(true);
      try { request.open('GET', u); request.send(); } catch { done(true); }
    }), url);
    expect(await refused('https://example.com/')).toBe(true);
    expect(await refused('data:text/plain,hi')).toBe(true);
    await page.close();
    host.stop();
  }, 60_000);
});
