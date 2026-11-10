// The player's layout and timing, end to end in headless Chrome: the picture's shape at any window size and in
// full screen, the controls hiding when idle, picture and sound over several seconds of playback, and a
// browser that refuses to start the sound. bun run test:e2e (see harness.ts for what it needs).
import type { Page } from 'playwright-core';
import { beforeAll, describe, expect, test } from 'bun:test';
import { drawn, fps, open, readCaptions, seek, serve, state, until } from './harness';

let server: Awaited<ReturnType<typeof serve>>;
beforeAll(async () => { server = await serve(); }, 240_000);

const ev = <T>(page: Page, fn: (P: any) => T) => page.evaluate(`(${fn.toString()})(window.__player)`) as Promise<T>;
const rect = (page: Page, selector: string) => page.$eval(selector, (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; });
const idle = (page: Page) => page.evaluate(() => document.querySelector('#player')!.classList.contains('idle'));

describe('layout', () => {
  const sizes = [[1280, 720], [1920, 1080], [800, 800], [600, 900], [1000, 400], [2560, 1080], [320, 568]] as const;

  test('the picture is the largest 16:9 box that fits the window, centred, at any size', async () => {
    const { page } = await open(server.browser, server.url);
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForFunction(([w, h]) => { const r = document.querySelector('.frame')!.getBoundingClientRect(); return r.width <= w! + 0.5 && r.height <= h! + 0.5 && Math.abs(r.width / r.height - 16 / 9) < 0.01; }, [w, h]);
      const f = await rect(page, '.frame');
      const label = `${w}x${h}`;
      expect(f.w / f.h, label).toBeCloseTo(16 / 9, 2);
      expect(f.w, label).toBeLessThanOrEqual(w + 0.5);
      expect(f.h, label).toBeLessThanOrEqual(h + 0.5);
      expect(Math.min(Math.abs(f.w - w), Math.abs(f.h - h)), `${label}: touches the window on one axis`).toBeLessThan(1);
      expect(f.x, label).toBeCloseTo((w - f.w) / 2, 0);
      expect(f.y, label).toBeCloseTo((h - f.h) / 2, 0);
      const c = await rect(page, 'canvas');
      expect([c.x, c.y, c.w, c.h].map(Math.round), `${label}: the canvas fills the frame`).toEqual([f.x, f.y, f.w, f.h].map(Math.round));
    }
    expect(await page.$eval('canvas', (c) => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height])).toEqual([1920, 1080]); // resolution does not follow the window
    await page.close();
  }, 60_000);

  test('the Play button is centred on the picture and the controls sit inside it', async () => {
    const { page } = await open(server.browser, server.url);
    for (const [w, h] of [[1280, 720], [700, 900]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForFunction((w) => window.innerWidth === w, w);
      await page.waitForFunction(() => { const r = document.querySelector('.frame')!.getBoundingClientRect(); return Math.abs(r.width / r.height - 16 / 9) < 0.01; });
      const f = await rect(page, '.frame'), big = await rect(page, '.big'), bar = await rect(page, '.bar');
      expect(big.x + big.w / 2).toBeCloseTo(f.x + f.w / 2, 0);
      expect(big.y + big.h / 2).toBeCloseTo(f.y + f.h / 2, 0);
      expect(bar.x).toBeGreaterThanOrEqual(f.x - 0.5);
      expect(bar.right).toBeLessThanOrEqual(f.right + 0.5);
      expect(bar.bottom).toBeLessThanOrEqual(f.bottom + 0.5);
    }
    await page.close();
  }, 60_000);

  test('a caption stays inside the picture, even when the window is narrow', async () => {
    const captions = await readCaptions();
    const longest = captions.reduce((a, b) => (b.text.length > a.text.length ? b : a));
    const { page } = await open(server.browser, `${server.url}?captions=1&t=${(longest.at + longest.end) / 2}`);
    for (const [w, h] of [[1280, 720], [480, 800]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.keyboard.press(' ');
      await page.waitForFunction((text) => (document.querySelector('.caption') as HTMLElement).textContent === text, longest.text);
      await page.keyboard.press('k');
      await until(page, (P) => !P.playing);
      const f = await rect(page, '.frame'), c = await rect(page, '.caption');
      expect(c.x).toBeGreaterThanOrEqual(f.x - 0.5);
      expect(c.right).toBeLessThanOrEqual(f.right + 0.5);
      expect(c.y).toBeGreaterThanOrEqual(f.y);
      expect(c.bottom).toBeLessThanOrEqual(f.bottom);
    }
    await page.close();
  }, 60_000);

  test('with the speaker notes open, the picture shrinks to leave them room, and keeps its shape', async () => {
    const { page } = await open(server.browser, `${server.url}?mode=slides&slide=3`);
    const before = await rect(page, '.frame');
    await page.keyboard.press('s');
    await page.waitForFunction((h) => document.querySelector('.frame')!.getBoundingClientRect().height < h, before.h);
    const f = await rect(page, '.frame'), n = await rect(page, '.notes');
    expect(f.w / f.h).toBeCloseTo(16 / 9, 2);
    expect(f.bottom).toBeLessThanOrEqual(n.y + 0.5);
    expect(n.bottom).toBeLessThanOrEqual(720.5);
    await page.keyboard.press('s');
    await page.waitForFunction((h) => Math.abs(document.querySelector('.frame')!.getBoundingClientRect().height - h) < 1, before.h);
    await page.close();
  }, 60_000);

  test('resizing the window while playing keeps playing, in sync, drawing', async () => {
    const { page, problems } = await open(server.browser, `${server.url}?t=100`);
    await page.keyboard.press(' ');
    await until(page, (P) => P.playing && P.t > 100.5);
    for (const [w, h] of [[900, 500], [1500, 900], [640, 640]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForFunction((w) => Math.abs(document.querySelector('.frame')!.getBoundingClientRect().width / document.querySelector('.frame')!.getBoundingClientRect().height - 16 / 9) < 0.01 && window.innerWidth === w, w);
    }
    await until(page, (P) => P.playing && Math.abs(P.t - P.track().currentTime) < 0.1);
    expect(await fps(page, 600)).toBeGreaterThan(20);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('f goes full screen on the player and f again leaves it; the picture keeps its shape', async () => {
    const { page } = await open(server.browser, server.url);
    const full = () => page.evaluate(() => document.fullscreenElement?.id ?? null);
    await page.keyboard.press('f');
    await page.waitForFunction(() => document.fullscreenElement !== null, null, { timeout: 5000 });
    expect(await full()).toBe('player');
    const f = await rect(page, '.frame');
    expect(f.w / f.h).toBeCloseTo(16 / 9, 2);
    expect(f.w).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth) + 0.5);
    await page.keyboard.press('f');
    await page.waitForFunction(() => document.fullscreenElement === null, null, { timeout: 5000 });
    await page.click('.fs');
    await page.waitForFunction(() => document.fullscreenElement !== null, null, { timeout: 5000 });
    await page.click('.fs');
    await page.waitForFunction(() => document.fullscreenElement === null, null, { timeout: 5000 });
    await page.close();
  }, 60_000);
});

describe('controls that hide', () => {
  test('they stay while nothing plays; they hide when the video plays untouched, and wake on the pointer or a key', async () => {
    const { page } = await open(server.browser, `${server.url}?t=60`);
    await page.waitForTimeout(3000); // longer than the hide delay
    expect(await idle(page)).toBe(false);
    expect(await page.$eval('.bar', (el) => getComputedStyle(el).opacity)).toBe('1');
    await page.keyboard.press(' ');
    await until(page, (P) => P.playing);
    await page.waitForFunction(() => document.querySelector('#player')!.classList.contains('idle'), null, { timeout: 8000 });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.bar')!).opacity === '0');
    expect(await page.$eval('.bar', (el) => getComputedStyle(el).pointerEvents)).toBe('none');
    expect(await page.$eval('canvas', (el) => getComputedStyle(el).cursor)).toBe('none');
    await page.mouse.move(300, 300);
    await page.mouse.move(310, 305);
    expect(await idle(page)).toBe(false);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.bar')!).opacity === '1');
    await page.waitForFunction(() => document.querySelector('#player')!.classList.contains('idle'), null, { timeout: 8000 });
    await page.keyboard.press('ArrowRight'); // a key wakes them too
    expect(await idle(page)).toBe(false);
    await page.close();
  }, 60_000);

  test('pausing brings them back at once', async () => {
    const { page } = await open(server.browser, `${server.url}?t=60`);
    await page.keyboard.press(' ');
    await page.waitForFunction(() => document.querySelector('#player')!.classList.contains('idle'), null, { timeout: 8000 });
    await page.keyboard.press('k');
    await until(page, (P) => !P.playing);
    expect(await idle(page)).toBe(false);
    await page.close();
  }, 60_000);

  test('they stay while the Share box is open', async () => {
    const { page } = await open(server.browser, `${server.url}?t=60`);
    await page.keyboard.press(' ');
    await until(page, (P) => P.playing);
    await page.mouse.move(400, 300);
    await page.click('.share-on');
    await page.waitForTimeout(3500);
    expect(await idle(page)).toBe(false);
    expect(await page.isVisible('.share')).toBe(true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#player')!.classList.contains('idle'), null, { timeout: 8000 });
    await page.close();
  }, 60_000);

  test('in slides mode they hide on a held slide, once the deck has started, and wake on the pointer', async () => {
    const waiting = await open(server.browser, `${server.url}?mode=slides`);
    await waiting.page.waitForTimeout(3000);
    expect(await idle(waiting.page)).toBe(false); // before the first slide, the Start button needs them
    await waiting.page.close();
    const { page } = await open(server.browser, `${server.url}?mode=slides&slide=3`);
    expect((await state(page)).playing).toBe(false);
    await page.waitForFunction(() => document.querySelector('#player')!.classList.contains('idle'), null, { timeout: 8000 });
    await page.mouse.move(200, 200);
    await page.mouse.move(210, 205);
    expect(await idle(page)).toBe(false);
    await page.close();
  }, 60_000);
});

describe('picture and sound over time', () => {
  /** Sample the player on every animation frame for `ms`: the clock, the picture's frame, the sound. */
  const sample = (page: Page, ms: number) => page.evaluate(async (ms) => {
    const P = (window as any).__player;
    const rows: { wall: number; t: number; drawn: number; audio: number }[] = [];
    const start = performance.now();
    while (performance.now() - start < ms) {
      if (!Number.isNaN(P.drawn)) rows.push({ wall: (performance.now() - start) / 1000, t: P.t, drawn: P.drawn, audio: P.track().currentTime }); // drawn is NaN until a seek's frame is drawn
      await new Promise((r) => requestAnimationFrame(r));
    }
    return rows;
  }, ms);

  /** `warmup`: seconds after the sampling starts that the sound may still be getting going. */
  const check = (all: Awaited<ReturnType<typeof sample>>, label: string, warmup = 0) => {
    const rows = all.filter((r) => r.wall >= warmup);
    const drift = rows.map((r) => Math.abs(r.t - r.audio));
    expect(Math.max(...drift), `${label}: the clock keeps to the sound`).toBeLessThan(0.15);
    const lag = rows.map((r) => Math.abs(r.drawn - r.audio));
    expect(Math.max(...lag), `${label}: the drawn frame keeps to the sound`).toBeLessThan(0.2);
    for (let i = 1; i < all.length; i++) expect(all[i]!.t, `${label}: time never runs backwards`).toBeGreaterThanOrEqual(all[i - 1]!.t - 1e-9);
    const first = all[0]!, last = all.at(-1)!;
    expect(last.audio - first.audio, `${label}: the sound plays at normal speed`).toBeCloseTo(last.wall - first.wall, 0);
    expect(last.t - first.t, `${label}: and so does the picture`).toBeCloseTo(last.wall - first.wall, 0);
  };

  test('over five seconds, the drawn frame, the clock and the sound stay together', async () => {
    const { page, problems } = await open(server.browser, `${server.url}?t=40`);
    await page.keyboard.press(' ');
    await until(page, (P) => P.playing && P.t > 40.5);
    const rows = await sample(page, 5000);
    expect(rows.length).toBeGreaterThan(50);
    check(rows, '40 s');
    expect(await fps(page, 800)).toBeGreaterThan(20);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('across a change of scene, too', async () => {
    const { page } = await open(server.browser, server.url);
    const { scenes } = await state(page);
    const start = scenes[5]!.start;
    await seek(page, start - 2);
    await page.keyboard.press(' ');
    await until(page, (P) => P.playing && P.t > P.from);
    await seek(page, start - 2);
    const rows = await sample(page, 4500);
    check(rows, 'a scene change');
    expect(rows.at(-1)!.t).toBeGreaterThan(start + 1);
    await page.close();
  }, 60_000);

  test('after a pause, playing again picks up at the same moment with the sound where the picture is', async () => {
    const { page } = await open(server.browser, `${server.url}?t=200`);
    await page.keyboard.press(' ');
    await until(page, (P) => P.playing && P.t > 201);
    await page.keyboard.press('k');
    await until(page, (P) => !P.playing && P.tracks.mix.paused);
    const held = (await state(page)).t;
    await page.keyboard.press('k');
    await until(page, (P) => P.playing);
    const rows = await sample(page, 2500);
    expect(rows[0]!.t).toBeGreaterThanOrEqual(held - 1e-9);
    expect(rows[0]!.t).toBeLessThan(held + 0.6);
    check(rows, 'after a pause', 0.5);
    await page.close();
  }, 60_000);
});

describe('a browser that refuses to start the sound', () => {
  test('the video plays on silently, with the sound controls gone, until the next play', async () => {
    const page = await server.browser.newPage({ viewport: { width: 1280, height: 720 } });
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(e.message));
    // what the browser's autoplay rules do to a play that is not a user gesture: reject it with NotAllowedError
    await page.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      (window as any).__refuseSound = true;
      HTMLMediaElement.prototype.play = function () {
        return (window as any).__refuseSound ? Promise.reject(new DOMException('play() failed: not allowed', 'NotAllowedError')) : play.call(this);
      };
    });
    await page.goto(server.url);
    await page.waitForFunction(() => (window as any).__player, null, { timeout: 60_000 });
    await page.keyboard.press(' ');
    await until(page, (P) => P.silent === true);
    await until(page, (P) => P.playing && P.t > 1);
    const silent = await state(page);
    expect(silent.heard).toBeNull();
    expect(silent.t).toBeGreaterThan(1);
    expect(await page.isHidden('.mute')).toBe(true);
    expect(problems).toEqual([]);
    await page.keyboard.press('k');
    await until(page, (P) => !P.playing);
    await page.evaluate(() => { (window as any).__refuseSound = false; }); // the user has now interacted: the sound may start
    await page.keyboard.press('k');
    await until(page, (P) => P.playing && P.silent === false && !P.tracks.mix.paused && Math.abs(P.t - P.tracks.mix.currentTime) < 0.15);
    expect(await page.isVisible('.mute')).toBe(true);
    await page.close();
  }, 60_000);
});
