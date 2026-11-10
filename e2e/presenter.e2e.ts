// The presenter's view (?view=presenter), end to end in headless Chrome: bun run test:e2e.
import { beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { open, presenterSettled, presenterState, ROOT, readCaptions, serve } from './harness';

let server: Awaited<ReturnType<typeof serve>>;
beforeAll(async () => { server = await serve(); }, 240_000);

const PHONE = { width: 390, height: 844 };
const LAPTOP = { width: 1440, height: 900 };
const SHOTS = path.join(ROOT, 'out', 'shots');

async function presenter(query = '?view=presenter', size?: { width: number; height: number }) {
  const { page, problems } = await open(server.browser, `${server.url}${query}`);
  if (size) await page.setViewportSize(size);
  await presenterSettled(page);
  return { page, problems };
}

/** A fingerprint of the next-slide canvas and how many distinct colours it holds (a blank still holds one or two). */
const still = (page: Page) => page.evaluate(() => {
  const canvas = document.querySelector('.p-still') as HTMLCanvasElement;
  const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let hash = 2166136261;
  const colours = new Set<number>();
  for (let i = 0; i < data.length; i += 4) {
    hash = Math.imul(hash ^ (data[i]! | (data[i + 1]! << 8) | (data[i + 2]! << 16)), 16777619);
    if (i % 28 === 0) colours.add((data[i]! >> 3) | ((data[i + 1]! >> 3) << 5) | ((data[i + 2]! >> 3) << 10));
  }
  return { hash: hash >>> 0, colours: colours.size };
});

/** The same fingerprint of the slide on screen (the engine's canvas), scaled onto a canvas of the still's size. */
const current = (page: Page) => page.evaluate(() => {
  const P = (window as any).__player;
  const scaled = document.createElement('canvas');
  scaled.width = 960;
  scaled.height = 540;
  const g = scaled.getContext('2d', { alpha: false })!;
  g.drawImage(P.canvas, 0, 0, 960, 540);
  const data = g.getImageData(0, 0, 960, 540).data;
  let hash = 2166136261;
  for (let i = 0; i < data.length; i += 4) hash = Math.imul(hash ^ (data[i]! | (data[i + 1]! << 8) | (data[i + 2]! << 16)), 16777619);
  return hash >>> 0;
});

describe('presenter view', () => {
  test('opens before slide 1 with no errors: the next still drawn, the notes hinting to start, no soundtrack asked for', async () => {
    const { page, problems } = await open(server.browser, `${server.url}?view=presenter`);
    const audio: string[] = [];
    page.on('request', (r) => { if (/\/audio\/.*\.(mp3|wav)/.test(r.url())) audio.push(r.url()); });
    await presenterSettled(page);
    const s = await presenterState(page);
    expect(s.slide).toBe(-1);
    expect(s.count).toBe(`– / ${s.stops.length}`);
    expect(s.stops.length).toBeGreaterThan(20);
    expect(s.paragraphs).toEqual(['Press Next (or →) to start. ← goes back.']);
    expect(s).toMatchObject({ prevDisabled: true, nextDisabled: false, stillShown: true, endShown: false, stopwatch: 'idle', elapsed: '0:00' });
    const next = await still(page);
    expect(next.colours).toBeGreaterThan(8);
    expect(await page.isVisible('.p-now canvas')).toBe(true);
    await page.waitForTimeout(500);
    expect(audio).toEqual([]);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('forward plays to the next stop and holds: k / N and the notes follow, the still moves on, and it is the very frame the slide then shows', async () => {
    const { page, problems } = await presenter();
    const before = await still(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const mid = await presenterState(page);
    expect(mid).toMatchObject({ playing: true, target: 0, count: `1 / ${mid.stops.length}` });
    expect(mid.t).toBeGreaterThan(0);
    await presenterSettled(page);
    const s1 = await presenterState(page);
    expect(s1).toMatchObject({ slide: 0, target: null, playing: false, count: `1 / ${s1.stops.length}` });
    expect(s1.t).toBeCloseTo(s1.stops[0]!, 3);
    const captions = await readCaptions();
    expect(s1.paragraphs).toEqual(captions.filter((c) => c.at <= s1.stops[0]! + 1e-6).map((c) => c.text));
    expect(s1.paragraphs.length).toBeGreaterThan(0);
    const after = await still(page); // now slide 2
    expect(after.hash).not.toBe(before.hash);
    expect(after.colours).toBeGreaterThan(8);
    await page.keyboard.press('ArrowRight');
    await presenterSettled(page);
    expect((await presenterState(page)).slide).toBe(1);
    expect(await current(page)).toBe(after.hash);
    expect(problems).toEqual([]);
    await page.close();
  }, 90_000);

  test('forward during a step finishes it; back returns at once; Enter and Backspace work as in slides mode', async () => {
    const { page } = await presenter('?view=presenter&slide=3');
    expect(await presenterState(page)).toMatchObject({ slide: 2, count: expect.stringMatching(/^3 \//) });
    await page.keyboard.press('ArrowRight'); // starts the step to slide 4
    await page.waitForTimeout(250);
    await page.keyboard.press('Enter'); // finishes it
    await presenterSettled(page);
    expect(await presenterState(page)).toMatchObject({ slide: 3, target: null, playing: false });
    await page.keyboard.press('ArrowLeft');
    await presenterSettled(page);
    const back = await presenterState(page);
    expect(back).toMatchObject({ slide: 2, playing: false });
    expect(back.t).toBeCloseTo(back.stops[2]!, 3);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await presenterSettled(page);
    expect((await presenterState(page)).slide).toBe(3);
    await page.keyboard.press('Backspace');
    await presenterSettled(page);
    expect((await presenterState(page)).slide).toBe(2);
    await page.close();
  }, 90_000);

  test('End goes to the last slide (no next still, Next disabled), Home to the start; the notes and the still follow', async () => {
    const { page } = await presenter();
    await page.keyboard.press('End');
    await presenterSettled(page);
    const last = await presenterState(page);
    expect(last).toMatchObject({ slide: last.stops.length - 1, count: `${last.stops.length} / ${last.stops.length}`, stillShown: false, endShown: true, nextDisabled: true, prevDisabled: false });
    expect(await page.isVisible('.p-end')).toBe(true);
    expect(await page.isVisible('.p-still')).toBe(false);
    expect(last.paragraphs.length).toBeGreaterThan(0);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    expect(await presenterState(page)).toMatchObject({ slide: last.slide, playing: false });
    await page.keyboard.press('Home');
    await presenterSettled(page);
    const first = await presenterState(page);
    expect(first).toMatchObject({ slide: -1, count: `– / ${first.stops.length}`, stillShown: true, endShown: false, prevDisabled: true });
    expect(await still(page)).toMatchObject({ colours: expect.any(Number) });
    await page.close();
  }, 90_000);

  test('the buttons step like the keys, and a click on the Next button then Space pauses (it does not step again)', async () => {
    const { page } = await presenter();
    await page.click('.p-fwd');
    await presenterSettled(page);
    expect((await presenterState(page)).slide).toBe(0);
    await page.click('.p-fwd');
    await page.waitForTimeout(250);
    await page.keyboard.press('Space'); // the click left no focus on the button: Space is the pause key
    const paused = await presenterState(page);
    expect(paused).toMatchObject({ target: 1, playing: true });
    await page.waitForTimeout(500);
    expect((await presenterState(page)).t).toBe(paused.t);
    await page.keyboard.press('Space');
    await presenterSettled(page);
    expect((await presenterState(page)).slide).toBe(1);
    await page.click('.p-prev');
    await presenterSettled(page);
    expect((await presenterState(page)).slide).toBe(0);
    await page.close();
  }, 90_000);

  test('the timer starts on the first step forward (not before, not on back or Home), pauses, resumes and resets', async () => {
    const { page } = await presenter('?view=presenter&slide=2');
    await page.waitForTimeout(1200);
    expect(await presenterState(page)).toMatchObject({ stopwatch: 'idle', elapsed: '0:00', pause: 'Start' });
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    expect((await presenterState(page)).stopwatch).toBe('idle');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.p-elapsed')!.textContent === '0:01', null, { timeout: 5000 });
    expect(await presenterState(page)).toMatchObject({ stopwatch: 'running', pause: 'Pause' });
    await page.click('.p-pause');
    const paused = await presenterState(page);
    expect(paused).toMatchObject({ stopwatch: 'paused', pause: 'Resume' });
    await page.waitForTimeout(1300);
    expect((await presenterState(page)).elapsed).toBe(paused.elapsed);
    await page.keyboard.press('End'); // a step while paused does not restart it
    await presenterSettled(page);
    expect((await presenterState(page)).stopwatch).toBe('paused');
    await page.click('.p-pause');
    await page.waitForFunction((was) => document.querySelector('.p-elapsed')!.textContent !== was, paused.elapsed, { timeout: 5000 });
    await page.click('.p-reset');
    expect(await presenterState(page)).toMatchObject({ stopwatch: 'idle', elapsed: '0:00', pause: 'Start' });
    await page.keyboard.press('Home');
    await presenterSettled(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    expect((await presenterState(page)).stopwatch).toBe('running');
    await page.close();
  }, 90_000);

  test('the wall clock shows the time of day as hh:mm', async () => {
    const { page } = await presenter();
    const shown = await page.textContent('.p-clock');
    expect(shown).toMatch(/^\d\d:\d\d$/);
    const now = await page.evaluate(() => ({ getHours: new Date().getHours(), getMinutes: new Date().getMinutes() })); // the browser's own time zone
    const minutes = (text: string) => +text.slice(0, 2) * 60 + +text.slice(3);
    const gap = Math.abs(minutes(shown!) - (now.getHours * 60 + now.getMinutes));
    expect(Math.min(gap, 1440 - gap)).toBeLessThanOrEqual(1);
    await page.close();
  }, 60_000);

  test('#presenter opens the presenter view; #presenter-3 opens it on slide 3; ?slide= does too', async () => {
    for (const [url, slide] of [[`${server.url}#presenter`, -1], [`${server.url}#presenter-3`, 2], [`${server.url}?view=presenter&slide=4`, 3]] as const) {
      const { page, problems } = await presenter(url.slice(server.url.length));
      const s = await presenterState(page);
      expect(s.slide, url).toBe(slide);
      expect(await page.isVisible('.p-nav')).toBe(true);
      expect(problems).toEqual([]);
      await page.close();
    }
  }, 90_000);

  test('the normal player links to it from its Share box, on the slide on screen', async () => {
    const { page } = await open(server.browser, `${server.url}?mode=slides&slide=4`);
    await page.click('.share-on');
    const link = await page.inputValue('.link-presenter');
    expect(link).toBe(`${server.url}?view=presenter&slide=4`);
    expect(await page.getAttribute('.open-presenter', 'href')).toBe(link);
    expect(await page.getAttribute('.open-presenter', 'target')).toBe('_blank');
    await page.keyboard.press('Escape');
    await page.keyboard.press('v'); // in video mode too, on the slide at the time on screen
    await page.evaluate(() => { const P = (window as any).__player; P.seek(P.deck.stops[6] + 0.5); });
    await page.click('.share-on');
    expect(await page.inputValue('.link-presenter')).toBe(`${server.url}?view=presenter&slide=7`);
    expect(await page.isHidden('.link-slide')).toBe(true);
    const target = await page.getAttribute('.open-presenter', 'href');
    await page.goto(target!);
    await page.waitForFunction(() => (window as any).__player?.stopwatch, null, { timeout: 30_000 });
    await presenterSettled(page);
    expect((await presenterState(page)).slide).toBe(6);
    await page.close();
  }, 90_000);
});

describe('presenter layout', () => {
  /** What must hold at any size: nothing wider than the screen, the page does not scroll, Next is on screen and tappable. */
  async function fits(page: Page, size: { width: number; height: number }) {
    const m = await page.evaluate(() => {
      const wide = [...document.querySelectorAll<HTMLElement>('.presenter *')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5);
      }).map((el) => el.className || el.tagName);
      const fwd = document.querySelector('.p-fwd')!.getBoundingClientRect();
      const top = document.elementFromPoint(fwd.x + fwd.width / 2, fwd.y + fwd.height / 2);
      return {
        scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight, wide,
        fwd: { x: fwd.x, y: fwd.y, w: fwd.width, h: fwd.height }, fwdOnTop: !!top?.closest('.p-fwd'),
        notes: document.querySelector('.p-notes')!.getBoundingClientRect().height, now: document.querySelector('.p-now .p-shot')!.getBoundingClientRect().height,
        font: parseFloat(getComputedStyle(document.querySelector('.p-notes')!).fontSize), head: document.querySelector('.p-head')!.getBoundingClientRect().height,
      };
    });
    expect(m.scrollW).toBeLessThanOrEqual(size.width);
    expect(m.scrollH).toBeLessThanOrEqual(size.height);
    expect(m.wide).toEqual([]);
    expect(m.fwd.h).toBeGreaterThanOrEqual(44);
    expect(m.fwd.w).toBeGreaterThanOrEqual(44);
    expect(m.fwd.x).toBeGreaterThanOrEqual(0);
    expect(m.fwd.x + m.fwd.w).toBeLessThanOrEqual(size.width);
    expect(m.fwd.y + m.fwd.h).toBeLessThanOrEqual(size.height);
    expect(m.fwdOnTop).toBe(true);
    return m;
  }

  test('on a phone in portrait (390×844): nothing overflows, Next is big at the bottom, the notes get the room, on every slide', async () => {
    mkdirSync(SHOTS, { recursive: true });
    const { page, problems } = await presenter('?view=presenter&slide=2', PHONE);
    for (const slide of [2, 6, 12]) {
      await page.evaluate((k) => (window as any).__player.go(k), slide);
      await presenterSettled(page);
      const m = await fits(page, PHONE);
      expect(m.fwd.h).toBeGreaterThanOrEqual(64);
      expect(m.fwd.y + m.fwd.h).toBeGreaterThan(PHONE.height - 100); // at the bottom
      expect(m.notes).toBeGreaterThan(m.now * 1.5); // the notes are primary, the slides smaller
      expect(m.font).toBeGreaterThanOrEqual(20);
    }
    await page.screenshot({ path: path.join(SHOTS, 'presenter-phone.png') });
    await page.keyboard.press('End');
    await presenterSettled(page);
    await fits(page, PHONE);
    await page.screenshot({ path: path.join(SHOTS, 'presenter-phone-last.png') });
    expect(problems).toEqual([]);
    await page.close();
  }, 120_000);

  test('on a laptop (1440×900): the slides are large, the notes big and readable, nothing overflows', async () => {
    mkdirSync(SHOTS, { recursive: true });
    const { page, problems } = await presenter('?view=presenter&slide=3', LAPTOP);
    const m = await fits(page, LAPTOP);
    expect(m.font).toBeGreaterThanOrEqual(24);
    expect(m.now).toBeGreaterThan(300);
    expect(m.notes).toBeGreaterThan(150);
    await page.screenshot({ path: path.join(SHOTS, 'presenter-laptop.png') });
    expect(problems).toEqual([]);
    await page.close();
  }, 90_000);

  test('at the default 1280×720, in landscape on a phone (844×390) and in a narrow window: still no overflow, Next reachable', async () => {
    for (const size of [{ width: 1280, height: 720 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
      const { page } = await presenter('?view=presenter&slide=3', size);
      await fits(page, size);
      await page.close();
    }
  }, 120_000);
});
