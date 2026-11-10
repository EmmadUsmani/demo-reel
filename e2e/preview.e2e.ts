// The preview page and the export page (?export=1, window.__video), end to end in headless Chrome on a Vite dev
// server (they are not in a built player). bun run test:e2e (see harness.ts for what it needs).
import { beforeAll, describe, expect, test } from 'bun:test';
import type { Page } from 'playwright-core';
import { EDIT, open, readCaptions, serve, serveDev, state } from './harness';

let server: Awaited<ReturnType<typeof serve>>;
let dev: Awaited<ReturnType<typeof serveDev>>;
beforeAll(async () => { server = await serve(); dev = await serveDev(); }, 240_000);

const captions = await readCaptions();

/** The page, with every error collected in `problems`. */
async function app(query: string, viewport = { width: 1280, height: 720 }) {
  const page = await server.browser.newPage({ viewport });
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  await page.goto(`${dev.url}?edit=${EDIT}${query}`);
  return { page, problems };
}
const exported = async (query = '') => {
  const { page, problems } = await app(`&export=1${query}`, { width: 1920, height: 1080 });
  await page.waitForFunction(() => (window as any).__video?.ready || (window as any).__video?.error, null, { timeout: 120_000 });
  return { page, problems };
};
const video = <T>(page: Page, fn: (V: any) => T) => page.evaluate(`(${fn.toString()})(window.__video)`) as Promise<T>;
/** A SHA-256 of the PNG of the frame at `t`, hashed in the page (the PNG is megabytes). */
const frameHash = (page: Page, t: number, samples = 1) => page.evaluate(async ([t, samples]) => {
  const V = (window as any).__video;
  await V.still(t, samples);
  const bytes = Uint8Array.from(atob(await V.png()), (c) => c.charCodeAt(0));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}, [t, samples] as const);

describe('export page (?export=1)', () => {
  test('boots to a ready window.__video without errors, on a bare canvas', async () => {
    const { page, problems } = await exported();
    expect(await video(page, (V) => ({ ready: V.ready, error: V.error, errors: V.errors }))).toEqual({ ready: true, error: undefined, errors: [] });
    expect(await page.evaluate(() => document.body.classList.contains('export'))).toBe(true);
    expect(await page.isHidden('#ui')).toBe(true);
    expect(await page.isHidden('#errs')).toBe(true);
    expect(await page.title()).toBe(`${EDIT} — demo-reel`);
    const [w, h] = await video(page, (V) => [V.width, V.height]);
    const box = (await page.locator('#c').boundingBox())!;
    expect([box.width, box.height]).toEqual([1920, 1080]);
    expect(w / h).toBeCloseTo(16 / 9, 3);
    expect(problems).toEqual([]);
    await page.close();
  }, 120_000);

  test('describes the edit: its title, scenes, duration and stops, the same as the built player plays', async () => {
    const { page } = await exported();
    const v = await video(page, (V) => ({ title: V.title, duration: V.duration, timeline: V.timeline, stops: V.stops.map((s: any) => s.t) as number[], stopScenes: V.stops.map((s: any) => s.scene) as string[], scale: V.scale, width: V.width, height: V.height }));
    const player = await open(server.browser, server.url);
    const built = await player.page.evaluate(() => { const P = (window as any).__player; return { title: document.querySelector('.title')!.textContent, duration: P.to as number, stops: P.deck.stops as number[], timeline: P.engine.timeline.map((e: any) => ({ id: e.id, start: e.start, end: e.end })) }; });
    expect(v.title).toBe(built.title as string);
    expect(v.duration).toBeCloseTo(built.duration, 6);
    expect(v.timeline).toEqual(built.timeline);
    expect(v.duration).toBeCloseTo(Math.max(...v.timeline.map((e: { end: number }) => e.end)), 6);
    expect(v.stops.length).toBeGreaterThan(20);
    for (let i = 0; i < v.stops.length; i++) {
      expect(v.stops[i]!).toBeCloseTo(built.stops[i]!, 6);
      expect(v.stops[i]!).toBeGreaterThanOrEqual(0);
      expect(v.stops[i]!).toBeLessThan(v.duration);
      if (i) expect(v.stops[i]!).toBeGreaterThan(v.stops[i - 1]!);
    }
    expect(v.stopScenes.every((id) => v.timeline.some((e: { id: string }) => e.id === id))).toBe(true);
    await player.page.close();
    await page.close();
  }, 120_000);

  test('lists the narration and cues in video time, matching the captions the player shows', async () => {
    const { page } = await exported();
    const v = await video(page, (V) => ({
      narration: V.narration.map((l: any) => ({ at: l.at, until: l.until, text: l.caption ?? l.text, scene: l.scene })) as { at: number; until: number; text: string; scene: string }[],
      cues: V.cues.map((c: any) => ({ t: c.t, scene: c.scene })) as { t: number; scene: string }[],
      duration: V.duration as number,
    }));
    expect(v.narration.length).toBe(captions.length);
    v.narration.forEach((line, i) => {
      expect(line.text, `line ${i}`).toBe(captions[i]!.text);
      expect(line.at).toBeCloseTo(captions[i]!.at, 3);
      expect(line.until).toBeGreaterThan(line.at);
      expect(line.until).toBeLessThanOrEqual(v.duration + 1);
    });
    expect(v.cues.length).toBeGreaterThan(0);
    for (const cue of v.cues) expect(cue.t).toBeGreaterThanOrEqual(0);
    await page.close();
  }, 120_000);

  test('still() draws the same frame for the same time, whatever was drawn in between', async () => {
    const { page } = await exported();
    const { timeline } = await video(page, (V) => ({ timeline: V.timeline as { id: string; start: number }[] }));
    const times = [0.5, ...[1, 4, 9, 14, 20].map((k) => timeline[k]!.start + 2.25)];
    const first = new Map<number, string>();
    for (const t of times) first.set(t, await frameHash(page, t));
    for (const t of [...times].reverse()) expect(await frameHash(page, t), `t=${t}, in reverse`).toBe(first.get(t)!);
    for (const t of times.slice(1)) { await frameHash(page, 0.1); expect(await frameHash(page, t), `t=${t}, after going back to the start`).toBe(first.get(t)!); }
    expect(new Set(first.values()).size, 'different times, different pictures').toBe(times.length);
    await page.close();
  }, 180_000);

  test('a frame with motion blur samples is deterministic too', async () => {
    const { page } = await exported();
    const t = (await video(page, (V) => V.timeline[3].start as number)) + 1.1;
    expect(await frameHash(page, t, 4)).toBe(await frameHash(page, t, 4));
    await page.close();
  }, 120_000);

  test('png() is a PNG of the canvas size', async () => {
    const { page } = await exported();
    await video(page, (V) => V.still(5));
    const png = await page.evaluate(async () => { const b = atob(await (window as any).__video.png()); return { head: [...b.slice(0, 8)].map((c) => c.charCodeAt(0)), w: (b.charCodeAt(16) << 24) | (b.charCodeAt(17) << 16) | (b.charCodeAt(18) << 8) | b.charCodeAt(19), h: (b.charCodeAt(20) << 24) | (b.charCodeAt(21) << 16) | (b.charCodeAt(22) << 8) | b.charCodeAt(23), canvas: [(document.getElementById('c') as HTMLCanvasElement).width, (document.getElementById('c') as HTMLCanvasElement).height] }; });
    expect(png.head).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect([png.w, png.h]).toEqual(png.canvas);
    await page.close();
  }, 120_000);

  test('the export draws the same picture as the player, at the same time', async () => {
    const { page } = await exported();
    const player = await open(server.browser, server.url);
    const { timeline } = await video(page, (V) => ({ timeline: V.timeline as { id: string; start: number }[] }));
    await player.page.keyboard.press(' ');
    await player.page.keyboard.press('k');
    for (const k of [2, 6, 12]) {
      const t = Math.round((timeline[k]!.start + 3) * 100) / 100;
      const exportHash = await frameHash(page, t);
      await player.page.evaluate((t) => (window as any).__player.seek(t), t);
      await player.page.waitForFunction((t) => (window as any).__player.drawn === t, t);
      const playerHash = await player.page.evaluate(async () => {
        const blob = await new Promise<Blob>((done) => (document.querySelector('canvas') as HTMLCanvasElement).toBlob((b) => done(b!), 'image/png'));
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');
      });
      expect(playerHash, `t=${t}`).toBe(exportHash);
    }
    await player.page.close();
    await page.close();
  }, 180_000);

  test('?only= loads just those scenes', async () => {
    const { page } = await exported('&only=hook,title');
    const v = await video(page, (V) => ({ ids: V.engine.scenes.size as number, errors: V.errors as string[] }));
    expect(v.ids).toBe(2);
    expect(v.errors).toEqual([]);
    await page.close();
  }, 120_000);

  test('a bad edit name reports an error on window.__video, for a script waiting on it, instead of leaving it waiting', async () => {
    const page = await server.browser.newPage();
    await page.goto(`${dev.url}?edit=nope&export=1`);
    await page.waitForFunction(() => (window as any).__video?.ready || (window as any).__video?.error, null, { timeout: 10_000 });
    expect(await page.evaluate(() => (window as any).__video.error)).toContain("no edit 'nope'");
    await page.close();
  }, 60_000);
});

describe('preview page', () => {
  const info = (page: Page) => page.textContent('#info');
  /** The time the info line shows, s. */
  const shown = async (page: Page) => parseFloat((await info(page))!);
  const at = (page: Page, t: number) => page.waitForFunction((t) => Math.abs(parseFloat(document.getElementById('info')!.textContent!) - t) < 0.006, t, { timeout: 10_000 });

  let timeline: { id: string; start: number; end: number }[];
  beforeAll(async () => {
    const { page } = await open(server.browser, server.url);
    timeline = (await state(page)).scenes;
    await page.close();
  }, 60_000);

  test('opens paused at 0:00 on the first scene, draws, and has no window.__video', async () => {
    const { page, problems } = await app('');
    await page.waitForFunction(() => /fps/.test(document.getElementById('info')!.textContent!));
    expect(await info(page)).toMatch(new RegExp(`^0\\.00s  \\[${timeline[0]!.id}\\]  \\d+fps`));
    await page.waitForTimeout(400);
    expect(await shown(page)).toBe(0);
    expect(await page.evaluate(() => (window as any).__video)).toBeUndefined();
    expect(await page.isHidden('#errs')).toBe(true);
    expect(await page.title()).toBe(`${EDIT} — demo-reel`);
    expect(problems).toEqual([]);
    await page.close();
  }, 120_000);

  test('the scene strip has one block per scene, in order, in proportion, and a click on one goes to its start', async () => {
    const { page } = await app('');
    await page.waitForSelector('.mark');
    const marks = await page.$$eval('.mark', (els) => els.map((el) => ({ text: el.textContent, left: parseFloat((el as HTMLElement).style.left), width: parseFloat((el as HTMLElement).style.width) })));
    expect(marks.map((m) => m.text)).toEqual(timeline.map((e) => e.id));
    const duration = Math.max(...timeline.map((e) => e.end));
    marks.forEach((m, k) => {
      expect(m.left).toBeCloseTo((timeline[k]!.start / duration) * 100, 3);
      expect(m.width).toBeCloseTo(((timeline[k]!.end - timeline[k]!.start) / duration) * 100, 3);
    });
    const target = timeline.find((e) => e.id === 'pacing')!;
    await page.click(`.mark:text-is("pacing")`);
    await at(page, target.start);
    expect(await info(page)).toMatch(/pacing\]/); // in its crossfade from the scene before, both are named
    await page.close();
  }, 120_000);

  test('?t= opens there; a ?t= that is not a number opens at the start', async () => {
    const { page } = await app('&t=100');
    await at(page, 100);
    await page.close();
    const bad = await app('&t=abc');
    await at(bad.page, 0);
    expect(await info(bad.page)).not.toContain('NaN');
    expect(bad.problems).toEqual([]);
    await bad.page.close();
  }, 120_000);

  test('space and a click on the picture play and pause, on the wall clock', async () => {
    const { page } = await app('&t=100');
    await at(page, 100);
    await page.keyboard.press(' ');
    await page.waitForFunction(() => parseFloat(document.getElementById('info')!.textContent!) > 100.8);
    await page.keyboard.press(' ');
    await page.waitForTimeout(100);
    const held = await shown(page);
    await page.waitForTimeout(400);
    expect(await shown(page)).toBe(held);
    await page.click('#c');
    await page.waitForFunction((held) => parseFloat(document.getElementById('info')!.textContent!) > held + 0.5, held);
    await page.click('#c');
    await page.close();
  }, 120_000);

  test('arrows seek a second, shift-arrows five, . and , a frame, and the seek is clamped to the video', async () => {
    const { page } = await app('&t=100');
    await at(page, 100);
    await page.keyboard.press('ArrowRight');
    await at(page, 101);
    await page.keyboard.press('Shift+ArrowRight');
    await at(page, 106);
    await page.keyboard.press('ArrowLeft');
    await at(page, 105);
    await page.keyboard.press('Shift+ArrowLeft');
    await at(page, 100);
    await page.keyboard.press('.');
    await at(page, 100 + 1 / 60);
    await page.keyboard.press(',');
    await at(page, 100);
    const to = Math.max(...timeline.map((e) => e.end));
    await page.evaluate((to) => { const s = document.getElementById('scrub') as HTMLInputElement; s.value = String(to - 0.5); s.dispatchEvent(new Event('input')); }, to);
    await page.keyboard.press('Shift+ArrowRight');
    await at(page, to - 0.001);
    await page.evaluate(() => { const s = document.getElementById('scrub') as HTMLInputElement; s.value = '0.5'; s.dispatchEvent(new Event('input')); });
    await page.keyboard.press('Shift+ArrowLeft');
    await at(page, 0);
    await page.close();
  }, 120_000);

  test('the scrubber seeks, and follows the time', async () => {
    const { page } = await app('&t=100');
    await at(page, 100);
    expect(+(await page.inputValue('#scrub'))).toBeCloseTo(100, 2);
    await page.evaluate(() => { const s = document.getElementById('scrub') as HTMLInputElement; s.value = '222.222'; s.dispatchEvent(new Event('input')); });
    await at(page, 222.22);
    expect(+(await page.inputValue('#scrub'))).toBeCloseTo(222.222, 2);
    expect(await info(page)).toContain(`[${timeline.filter((e) => 222.222 >= e.start && 222.222 < e.end).map((e) => e.id).join(' + ')}]`);
    await page.close();
  }, 120_000);

  test('] and [ jump between scene starts', async () => {
    const { page } = await app(`&t=${timeline[4]!.start + 2}`);
    await at(page, timeline[4]!.start + 2);
    await page.keyboard.press(']');
    await at(page, timeline[5]!.start);
    await page.keyboard.press('[');
    await at(page, timeline[4]!.start); // from inside a scene, to its own start
    await page.keyboard.press('[');
    await at(page, timeline[3]!.start); // from its start, to the one before
    await page.close();
  }, 120_000);

  test('l loops the scene on screen until pressed again, and h hides the controls', async () => {
    const scene = timeline[3]!;
    const { page } = await app(`&t=${scene.end - 0.9}`);
    await at(page, scene.end - 0.9);
    await page.keyboard.press('l');
    await page.waitForFunction(() => /LOOP/.test(document.getElementById('info')!.textContent!));
    await page.keyboard.press(' ');
    await page.waitForFunction((s) => { const t = parseFloat(document.getElementById('info')!.textContent!); return t >= s.start && t < s.start + 1.5; }, scene, { timeout: 10_000 }); // wrapped to the scene's start
    expect(await info(page)).toContain('LOOP');
    await page.keyboard.press('l');
    await page.waitForFunction(() => !/LOOP/.test(document.getElementById('info')!.textContent!));
    await page.keyboard.press(' ');
    expect(await page.isVisible('#ui')).toBe(true);
    await page.keyboard.press('h');
    expect(await page.isHidden('#ui')).toBe(true);
    await page.keyboard.press('h');
    expect(await page.isVisible('#ui')).toBe(true);
    await page.close();
  }, 120_000);

  test('the picture is the largest 16:9 that fits above the controls', async () => {
    const { page } = await app('');
    for (const [w, h] of [[1280, 720], [800, 900], [1600, 500]] as const) {
      await page.setViewportSize({ width: w, height: h });
      const c = (await page.locator('#c').boundingBox())!;
      expect(c.width / c.height).toBeCloseTo(16 / 9, 1);
      expect(c.width).toBeLessThanOrEqual(w + 0.5);
      expect(c.y + c.height).toBeLessThanOrEqual(h - 64 + 0.5);
    }
    await page.close();
  }, 60_000);
});
