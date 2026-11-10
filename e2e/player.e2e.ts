// The HTML player, end to end in headless Chrome: bun run test:e2e (see harness.ts for what it needs).
import { beforeAll, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { EDIT, fps, open, ROOT, serve, state } from './harness';

let server: Awaited<ReturnType<typeof serve>>;
beforeAll(async () => { server = await serve(); }, 240_000);

const captions: { at: number; end: number; text: string }[] = await Bun.file(path.join(ROOT, `out/audio-${EDIT}/captions.json`)).json();

describe('full video', () => {
  test('boots on the poster, without errors, and the first play starts at the beginning', async () => {
    const { page, problems } = await open(server.browser, server.url);
    const before = await state(page);
    expect(before.playing).toBe(false);
    expect(before.bigHidden).toBe(false);
    expect(before.t).toBeGreaterThan(0); // a poster from inside the video, not its blank first frame
    await page.click('.big');
    await page.waitForTimeout(1500);
    const after = await state(page);
    expect(after.playing).toBe(true);
    expect(after.heard).toBe('mix');
    expect(after.t).toBeGreaterThan(0.8);
    expect(after.t).toBeLessThan(3);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('the picture keeps to the sound', async () => {
    const { page } = await open(server.browser, server.url);
    await page.click('.big');
    await page.waitForTimeout(1000);
    const drift = await page.evaluate(async () => {
      const P = (window as any).__player, out: number[] = [];
      for (let i = 0; i < 40; i++) { await new Promise((r) => requestAnimationFrame(r)); out.push(P.t - P.track().currentTime); await new Promise((r) => setTimeout(r, 50)); }
      return out;
    });
    expect(Math.max(...drift.map(Math.abs))).toBeLessThan(0.05);
    await page.close();
  }, 60_000);

  test('plays through every scene: seeking into each keeps it drawing', async () => {
    const { page, problems } = await open(server.browser, server.url);
    await page.click('.big');
    for (const scene of (await state(page)).scenes) {
      await page.evaluate((t) => (window as any).__player.seek(t), scene.start + 0.3);
      await page.waitForTimeout(250);
      expect({ scene: scene.id, playing: (await state(page)).playing }).toEqual({ scene: scene.id, playing: true });
      expect(await fps(page, 600)).toBeGreaterThan(20);
    }
    expect(problems).toEqual([]);
    await page.close();
  }, 180_000);

  test('narration off switches to the effects track at the same moment, and back', async () => {
    const { page } = await open(server.browser, server.url);
    await page.click('.big');
    await page.evaluate(() => (window as any).__player.seek(100));
    await page.waitForTimeout(500);
    await page.keyboard.press('n');
    await page.waitForTimeout(700);
    const off = await state(page);
    expect(off).toMatchObject({ narration: false, heard: 'effects', audioPaused: false, mixPaused: true, playing: true });
    expect(Math.abs(off.t - off.audioTime!)).toBeLessThan(0.05);
    expect(off.t).toBeGreaterThan(100);
    expect(off.t).toBeLessThan(102);
    await page.keyboard.press('n');
    await page.waitForTimeout(500);
    expect(await state(page)).toMatchObject({ narration: true, heard: 'mix', audioPaused: false });
    await page.close();
  }, 60_000);

  test('captions show the written line being spoken', async () => {
    const { page } = await open(server.browser, server.url);
    const line = captions.find((c) => c.text.includes('VM'))!;
    await page.click('.big');
    await page.keyboard.press('c');
    await page.evaluate((t) => (window as any).__player.seek(t), (line.at + line.end) / 2);
    await page.waitForTimeout(300);
    expect((await state(page)).caption).toBe(line.text);
    expect(line.text).not.toContain('V.M.');
    await page.keyboard.press('c');
    await page.waitForTimeout(100);
    expect((await state(page)).caption).toBeNull();
    await page.close();
  }, 60_000);

  test('pauses when its sound is paused from outside (media keys, headphones)', async () => {
    const { page } = await open(server.browser, server.url);
    await page.click('.big');
    await page.waitForTimeout(800);
    await page.evaluate(() => (window as any).__player.tracks.mix.pause());
    await page.waitForTimeout(300);
    const s = await state(page);
    expect(s.playing).toBe(false);
    const t = s.t;
    await page.waitForTimeout(500);
    expect((await state(page)).t).toBe(t);
    await page.close();
  }, 60_000);

  test('stops at the end and offers a replay', async () => {
    const { page } = await open(server.browser, server.url);
    await page.click('.big');
    await page.evaluate(() => { const P = (window as any).__player; P.seek(P.to - 0.6); });
    await page.waitForTimeout(2000);
    const s = await state(page);
    expect(s.playing).toBe(false);
    expect(s.t).toBeGreaterThan(s.to - 0.05);
    expect(s.bigHidden).toBe(false);
    expect(await page.getAttribute('.play', 'aria-label')).toBe('Play');
    await page.click('.big');
    await page.waitForTimeout(500);
    expect((await state(page)).t).toBeLessThan(2);
    await page.close();
  }, 60_000);

  test('without its soundtrack, it plays silently on the wall clock', async () => {
    const page = await server.browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.route('**/audio/**', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForFunction(() => (window as any).__player);
    await page.click('.big');
    await page.waitForTimeout(1500);
    const s = await state(page);
    expect(s.heard).toBeNull();
    expect(s.playing).toBe(true);
    expect(s.t).toBeGreaterThan(1);
    expect(await page.isHidden('.voice')).toBe(true);
    expect(await page.isHidden('.mute')).toBe(true);
    await page.close();
  }, 60_000);
});

describe('hosted where media and fonts must come from data (a Claude artifact)', () => {
  test('still plays with sound and its fonts, and #slide-<n> opens a slide', async () => {
    const page = await server.browser.newPage({ viewport: { width: 1280, height: 720 } });
    // the artifact host's policy, in short: the page's own files by fetch, media and fonts only from data
    const policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src data: blob:; media-src data: blob:; font-src data:";
    await page.route(`${server.url}`, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
    });
    await page.goto(`${server.url}#slide-4`);
    await page.waitForFunction(() => (window as any).__player, null, { timeout: 60_000 });
    expect(await page.evaluate(() => document.fonts.check('600 16px Inter') && document.fonts.check('16px "Instrument Serif"'))).toBe(true);
    expect(await page.evaluate(() => [(window as any).__player.mode, (window as any).__player.deck.slide])).toEqual(['slides', 3]);
    await page.keyboard.press('v'); // to video mode, on slide 4's frame
    await page.keyboard.press(' ');
    await page.waitForTimeout(3000);
    const s = await state(page);
    expect(s.playing).toBe(true);
    expect(s.heard).toBe('mix');
    expect(s.audioPaused).toBe(false);
    expect(await page.evaluate(() => (window as any).__player.tracks.mix.src.startsWith('blob:'))).toBe(true);
    expect(Math.abs(s.t - s.audioTime!)).toBeLessThan(0.05);
    await page.close();
  }, 90_000);
});
