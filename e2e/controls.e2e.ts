// The player's controls, end to end in headless Chrome: every keyboard shortcut, narration, captions and
// scrubbing. bun run test:e2e (see harness.ts for what it needs).
import { beforeAll, describe, expect, test } from 'bun:test';
import type { Page } from 'playwright-core';
import { drawn, open, readCaptions, seek, serve, state, until } from './harness';

let server: Awaited<ReturnType<typeof serve>>;
beforeAll(async () => { server = await serve(); }, 240_000);

const captions = await readCaptions();
const ev = <T>(page: Page, fn: (P: any) => T) => page.evaluate(`(${fn.toString()})(window.__player)`) as Promise<T>;
const pressed = (page: Page, selector: string) => page.getAttribute(selector, 'aria-pressed');
/** Press space (a user gesture, so the sound may start) and pause again: the video has started, and is held. */
async function startAndHold(page: Page) {
  await page.keyboard.press(' ');
  await until(page, (P) => P.playing);
  await page.keyboard.press('k');
  await until(page, (P) => !P.playing);
}

describe('keyboard: video', () => {
  test('space and k play and pause, and a paused video stays put', async () => {
    const { page, problems } = await open(server.browser, `${server.url}?t=60`);
    await page.keyboard.press(' ');
    await until(page, (P) => P.playing && P.t > 60.3);
    await page.keyboard.press('k');
    await until(page, (P) => !P.playing);
    const held = (await state(page)).t;
    expect((await state(page)).audioPaused).toBe(true);
    await page.waitForTimeout(500);
    expect((await state(page)).t).toBe(held);
    await page.keyboard.press('k');
    await until(page, (P) => P.playing && P.t > 60);
    await page.keyboard.press(' ');
    await until(page, (P) => !P.playing);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('pausing and playing again at once keeps playing: the sound\'s own pause is not a pause from outside', async () => {
    const { page } = await open(server.browser, `${server.url}?t=60`);
    await page.keyboard.press(' ');
    await until(page, (P) => P.playing && P.t > 60.3);
    // in one task, as a double tap of the key can be: the audio's pause event arrives after the video plays again
    await page.evaluate(() => { const P = (window as any).__player; P.pause(); P.play(); });
    const t = (await state(page)).t;
    await page.waitForTimeout(800); // long enough for a wrong pause to have happened
    await page.waitForFunction((t) => (window as any).__player.t > t + 0.5, t, { timeout: 5000 });
    const s = await state(page);
    expect(s.playing).toBe(true);
    expect(s.audioPaused).toBe(false);
    await page.close();
  }, 60_000);

  test('clicking the picture plays and pauses too', async () => {
    const { page } = await open(server.browser, `${server.url}?t=60`);
    await page.click('.big'); // before the first play, the Play button covers the picture
    await until(page, (P) => P.playing);
    await page.click('canvas');
    await until(page, (P) => !P.playing);
    await page.click('.play');
    await until(page, (P) => P.playing);
    expect(await page.getAttribute('.play', 'aria-label')).toBe('Pause');
    await page.click('.play');
    await until(page, (P) => !P.playing);
    expect(await page.getAttribute('.play', 'aria-label')).toBe('Play');
    await page.close();
  }, 60_000);

  test('arrows seek five seconds, shift-arrows one frame, Home to the start, while paused', async () => {
    const { page } = await open(server.browser, `${server.url}?t=60`);
    await page.keyboard.press('ArrowRight');
    await until(page, (P) => P.t === 65);
    await page.keyboard.press('ArrowLeft');
    await until(page, (P) => P.t === 60);
    await page.keyboard.press('Shift+ArrowRight');
    await until(page, (P) => Math.abs(P.t - (60 + 1 / 60)) < 1e-9);
    await page.keyboard.press('Shift+ArrowLeft');
    await until(page, (P) => Math.abs(P.t - 60) < 1e-9);
    await drawn(page, (await state(page)).t);
    expect(await page.textContent('.time')).toMatch(/^1:00 \/ /);
    await page.keyboard.press('Home');
    await drawn(page, 0);
    expect((await state(page)).playing).toBe(false);
    expect(await page.textContent('.time')).toMatch(/^0:00 \/ /);
    await page.close();
  }, 60_000);

  test('seeking is clamped to the video: not before its start, and a hair short of its end', async () => {
    const { page } = await open(server.browser, `${server.url}?t=2`);
    await page.keyboard.press('ArrowLeft');
    await until(page, (P) => P.t === 0);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    expect((await state(page)).t).toBe(0);
    await seek(page, (await state(page)).to - 2);
    await page.keyboard.press('ArrowRight');
    await until(page, (P) => P.t === P.to - 1e-3);
    const s = await state(page);
    expect(s.t).toBeLessThan(s.to);
    expect(s.playing).toBe(false);
    await page.close();
  }, 60_000);

  test('seeking while playing keeps playing, with the sound following', async () => {
    const { page } = await open(server.browser, `${server.url}?t=60`);
    await page.keyboard.press(' ');
    await until(page, (P) => P.playing && P.t > 60.5);
    await page.keyboard.press('ArrowRight');
    await until(page, (P) => P.t > 65.4 && P.t < 67 && Math.abs(P.t - P.track().currentTime) < 0.1);
    await page.keyboard.press('ArrowLeft');
    await until(page, (P) => P.t > 60.4 && P.t < 62 && Math.abs(P.t - P.track().currentTime) < 0.1);
    const s = await state(page);
    expect(s.playing).toBe(true);
    expect(s.audioPaused).toBe(false);
    await page.close();
  }, 60_000);

  test('n, c and v switch narration, captions and slides mode, and their buttons show it', async () => {
    const { page } = await open(server.browser, server.url);
    expect(await pressed(page, '.voice')).toBe('true');
    await page.keyboard.press('n');
    expect(await pressed(page, '.voice')).toBe('false');
    expect((await state(page)).narration).toBe(false);
    await page.keyboard.press('n');
    expect(await pressed(page, '.voice')).toBe('true');
    expect(await pressed(page, '.cc')).toBe('false');
    await page.keyboard.press('c');
    expect(await pressed(page, '.cc')).toBe('true');
    await page.keyboard.press('c');
    expect(await pressed(page, '.cc')).toBe('false');
    expect(await pressed(page, '.mode')).toBe('false');
    await page.keyboard.press('v');
    expect(await pressed(page, '.mode')).toBe('true');
    expect(await ev(page, (P) => P.mode)).toBe('slides');
    expect(await page.evaluate(() => document.querySelector('#player')!.classList.contains('slides'))).toBe(true);
    await page.keyboard.press('v');
    expect(await ev(page, (P) => P.mode)).toBe('video');
    expect(await page.evaluate(() => document.querySelector('#player')!.classList.contains('slides'))).toBe(false);
    await page.close();
  }, 60_000);

  test('the buttons do what the keys do', async () => {
    const { page } = await open(server.browser, server.url);
    await page.click('.cc');
    expect(await pressed(page, '.cc')).toBe('true');
    await page.click('.voice');
    expect((await state(page)).narration).toBe(false);
    await page.click('.mode');
    expect(await ev(page, (P) => P.mode)).toBe('slides');
    await page.click('.mode');
    expect(await ev(page, (P) => P.mode)).toBe('video');
    await page.close();
  }, 60_000);

  test('m mutes the sound that is heard, and it stays muted across a switch of track', async () => {
    const { page } = await open(server.browser, `${server.url}?t=60`);
    await page.keyboard.press(' ');
    await until(page, (P) => P.playing && P.track().currentTime > 60.3);
    expect(await ev(page, (P) => P.tracks.mix.muted)).toBe(false);
    await page.keyboard.press('m');
    await until(page, (P) => P.muted && P.tracks.mix.muted);
    await page.keyboard.press('n'); // to the effects track
    await until(page, (P) => P.track() === P.tracks.effects && !P.tracks.effects.paused && P.tracks.effects.muted);
    await page.keyboard.press('m');
    await until(page, (P) => !P.muted && !P.tracks.effects.muted);
    expect((await state(page)).playing).toBe(true);
    await page.close();
  }, 60_000);

  test('Escape closes the Share box', async () => {
    const { page } = await open(server.browser, server.url);
    await page.click('.share-on');
    expect(await page.isVisible('.share')).toBe(true);
    expect(await pressed(page, '.share-on')).toBe('true');
    await page.keyboard.press('Escape');
    expect(await page.isVisible('.share')).toBe(false);
    expect(await pressed(page, '.share-on')).toBe('false');
    await page.close();
  }, 60_000);

  test('shortcuts with ctrl, meta or alt held are left to the browser', async () => {
    const { page } = await open(server.browser, server.url);
    for (const combo of ['Control+c', 'Meta+c', 'Alt+c', 'Control+n', 'Meta+k', 'Control+ ', 'Alt+ArrowRight']) await page.keyboard.press(combo);
    const s = await state(page);
    expect(s.narration).toBe(true);
    expect(s.playing).toBe(false);
    expect(await pressed(page, '.cc')).toBe('false');
    await page.close();
  }, 60_000);

  test('typing in the Share box does not trigger shortcuts', async () => {
    const { page } = await open(server.browser, server.url);
    await page.click('.share-on');
    for (const field of ['.link-t', '.embed']) {
      await page.click(field);
      for (const key of ['n', 'c', 'k', ' ', 'm', 'v']) await page.keyboard.press(key);
    }
    const s = await state(page);
    expect(s).toMatchObject({ narration: true, playing: false });
    expect(await pressed(page, '.cc')).toBe('false');
    expect(await ev(page, (P) => [P.mode, P.muted])).toEqual(['video', false]);
    await page.close();
  }, 60_000);

  test('keys that are not shortcuts do nothing (and are not swallowed)', async () => {
    const { page } = await open(server.browser, `${server.url}?t=60`);
    for (const key of ['a', 'x', 'ArrowUp', 'End', 'Enter', 'PageDown', 'K', 'N']) await page.keyboard.press(key);
    expect(await state(page)).toMatchObject({ t: 60, playing: false, narration: true });
    expect(await page.evaluate(() => new Promise((resolve) => {
      window.addEventListener('keydown', (e) => resolve(e.defaultPrevented), { once: true });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', cancelable: true }));
    }))).toBe(false);
    await page.close();
  }, 60_000);

  test('a shortcut it handles has its default action cancelled (space does not scroll)', async () => {
    const { page } = await open(server.browser, server.url);
    const prevented = await page.evaluate(() => {
      const results: Record<string, boolean> = {};
      for (const key of [' ', 'ArrowRight', 'n', 'Home']) {
        const e = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
        document.body.dispatchEvent(e);
        results[key] = e.defaultPrevented;
      }
      return results;
    });
    expect(prevented).toEqual({ ' ': true, ArrowRight: true, n: true, Home: true });
    await page.close();
  }, 60_000);
});

describe('keyboard: slides', () => {
  const slide = (page: Page) => ev(page, (P) => P.deck.slide);
  // a second press during a step finishes it at once, so each pair of presses is one slide, without waiting for the narration
  const step = async (page: Page, key: string) => { await page.keyboard.press(key); await page.keyboard.press(key); };

  test('space, Enter, PageDown, arrows and k step forward; Backspace, PageUp and the arrow step back', async () => {
    const { page, problems } = await open(server.browser, `${server.url}?mode=slides`);
    expect(await slide(page)).toBe(-1);
    await step(page, 'Enter');
    expect(await slide(page)).toBe(0);
    await step(page, 'PageDown');
    expect(await slide(page)).toBe(1);
    await step(page, ' ');
    expect(await slide(page)).toBe(2);
    await step(page, 'ArrowRight');
    expect(await slide(page)).toBe(3);
    await step(page, 'k');
    expect(await slide(page)).toBe(4);
    await page.keyboard.press('Backspace');
    expect(await slide(page)).toBe(3);
    await page.keyboard.press('PageUp');
    expect(await slide(page)).toBe(2);
    await page.keyboard.press('ArrowLeft');
    expect(await slide(page)).toBe(1);
    const s = await ev(page, (P) => [P.t, P.deck.stops[1], P.playing]);
    expect(s[0]).toBeCloseTo(s[1] as number, 3);
    expect(s[2]).toBe(false);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('Home goes back to the start of the video, End to the last slide', async () => {
    const { page } = await open(server.browser, `${server.url}?mode=slides&slide=6`);
    await page.keyboard.press('Home');
    expect(await ev(page, (P) => [P.deck.slide, P.t, P.from])).toEqual([-1, 0, 0]);
    expect(await page.textContent('.count')).toMatch(/^– \/ \d+$/);
    await page.keyboard.press('End');
    const last = await ev(page, (P) => [P.deck.slide, P.deck.count - 1, P.t, P.deck.stops.at(-1)]);
    expect(last[0]).toBe(last[1]);
    expect(last[2]).toBe(last[3]);
    await page.keyboard.press('ArrowLeft');
    expect(await slide(page)).toBe((last[1] as number) - 1);
    await page.close();
  }, 60_000);

  test('back at the very start does nothing, and the pager buttons are disabled where a step is not possible', async () => {
    const { page } = await open(server.browser, `${server.url}?mode=slides`);
    await page.keyboard.press('ArrowLeft');
    expect(await slide(page)).toBe(-1);
    expect(await page.isDisabled('.back')).toBe(true);
    expect(await page.isDisabled('.fwd')).toBe(false);
    await page.click('.fwd');
    await page.click('.fwd');
    expect(await slide(page)).toBe(0);
    expect(await page.isDisabled('.back')).toBe(false);
    await page.click('.back');
    expect(await slide(page)).toBe(-1);
    await page.keyboard.press('End');
    expect(await page.isDisabled('.fwd')).toBe(true);
    await page.close();
  }, 60_000);

  test('in slides mode the arrows step slides and do not seek five seconds', async () => {
    const { page } = await open(server.browser, `${server.url}?mode=slides&slide=3`);
    const before = (await state(page)).t;
    await page.keyboard.press('ArrowLeft');
    const after = (await state(page)).t;
    expect(after).toBeLessThan(before - 0.5);
    expect(after).toBe(await ev(page, (P) => P.deck.stops[1]));
    await page.close();
  }, 60_000);
});

describe('captions', () => {
  const sample = [0, Math.floor(captions.length / 4), Math.floor(captions.length / 2), Math.floor((3 * captions.length) / 4), captions.length - 1];
  const shown = (page: Page, text: string | null) => page.waitForFunction((text) => {
    const el = document.querySelector('.caption') as HTMLElement;
    return text === null ? el.hidden : !el.hidden && el.textContent === text;
  }, text, { timeout: 10_000 });

  test('a line is on screen exactly while it is spoken: its start counts, its end does not', async () => {
    const { page } = await open(server.browser, server.url);
    await startAndHold(page);
    await page.keyboard.press('c');
    for (const i of sample) {
      const line = captions[i]!;
      await seek(page, line.at);
      await shown(page, line.text);
      await seek(page, (line.at + line.end) / 2);
      await shown(page, line.text);
      await seek(page, line.end - 0.01);
      await shown(page, line.text);
      const next = captions[i + 1];
      await seek(page, line.end);
      await shown(page, next && next.at <= line.end ? next.text : null);
    }
    await page.close();
  }, 90_000);

  test('nothing shows before the first line, in a gap between lines, or after the last', async () => {
    const { page } = await open(server.browser, server.url);
    await startAndHold(page);
    await page.keyboard.press('c');
    await seek(page, captions[0]!.at / 2);
    await shown(page, null);
    const i = captions.findIndex((c, k) => k > 0 && c.at - captions[k - 1]!.end > 0.1);
    await seek(page, (captions[i - 1]!.end + captions[i]!.at) / 2);
    await shown(page, null);
    await seek(page, captions.at(-1)!.end + 0.2);
    await shown(page, null);
    await page.close();
  }, 60_000);

  test('captions are off until switched on, and off again with the same key', async () => {
    const { page } = await open(server.browser, server.url);
    const line = captions[Math.floor(captions.length / 2)]!;
    await startAndHold(page);
    await seek(page, (line.at + line.end) / 2);
    await drawn(page, (await state(page)).t);
    expect((await state(page)).caption).toBeNull();
    await page.keyboard.press('c');
    await shown(page, line.text);
    await page.keyboard.press('c');
    await shown(page, null);
    await page.close();
  }, 60_000);

  test('?captions=1 turns them on, but they wait for the first play, which starts at ?t', async () => {
    const line = captions[Math.floor(captions.length / 2)]!;
    const mid = (line.at + line.end) / 2;
    const { page } = await open(server.browser, `${server.url}?captions=1&t=${mid}`);
    expect(await pressed(page, '.cc')).toBe('true');
    await drawn(page, mid);
    expect((await state(page)).caption).toBeNull(); // the poster frame is clean
    await page.keyboard.press(' ');
    await shown(page, line.text);
    expect((await state(page)).t).toBeGreaterThanOrEqual(mid);
    await page.close();
  }, 60_000);

  test('while playing, the caption follows the speech from one line to the next', async () => {
    const i = captions.reduce((best, c, k) => (k + 1 < captions.length && captions[k + 1]!.at - c.at < captions[best + 1]!.at - captions[best]!.at ? k : best), 0);
    const [a, b] = [captions[i]!, captions[i + 1]!];
    const { page } = await open(server.browser, `${server.url}?captions=1&t=${a.at - 0.4}`);
    await page.keyboard.press(' ');
    await shown(page, a.text);
    expect((await state(page)).t).toBeLessThan(a.end + 0.2);
    await shown(page, b.text);
    const s = await state(page);
    expect(s.t).toBeGreaterThanOrEqual(b.at);
    expect(s.playing).toBe(true);
    await page.close();
  }, 60_000);

  test('every caption the player shows is a written line (no respelling for the voice)', async () => {
    const { page } = await open(server.browser, server.url);
    await startAndHold(page);
    await page.keyboard.press('c');
    const written = captions.map((c) => c.text);
    for (const i of sample) {
      await seek(page, (captions[i]!.at + captions[i]!.end) / 2);
      await shown(page, captions[i]!.text);
      expect(written).toContain((await state(page)).caption!);
    }
    expect(written.some((text) => /\b(?:[A-Z]\.){2,}/.test(text))).toBe(false);
    await page.close();
  }, 60_000);

  test('pausing straight after the first play still shows the caption of the held frame', async () => {
    const line = captions[Math.floor(captions.length / 2)]!;
    const mid = (line.at + line.end) / 2;
    const { page } = await open(server.browser, `${server.url}?captions=1&t=${mid}`);
    await page.keyboard.press(' ');
    await page.keyboard.press('k'); // before the sound has moved the clock
    await until(page, (P) => !P.playing);
    await shown(page, line.text);
    await page.close();
  }, 60_000);

  test('without captions.json, a caption is the line from the edit, for its beat', async () => {
    const page = await server.browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.route('**/captions.json', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForFunction(() => (window as any).__player, null, { timeout: 60_000 });
    const lines = await ev(page, (P) => P.engine.narration().map((l: any) => ({ at: l.at, until: l.until, text: l.caption ?? l.text })));
    expect(lines.length).toBe(captions.length);
    const line = lines[Math.floor(lines.length / 2)]!;
    await startAndHold(page);
    await page.keyboard.press('c');
    await seek(page, (line.at + line.until) / 2);
    await shown(page, line.text);
    await page.close();
  }, 60_000);
});

describe('narration', () => {
  test('?narration=0 plays the effects track from the start, in sync, with the Narration button off', async () => {
    const { page, problems } = await open(server.browser, `${server.url}?narration=0&t=40`);
    expect(await pressed(page, '.voice')).toBe('false');
    await page.keyboard.press(' ');
    await until(page, (P) => P.playing && P.t > 41.5);
    const s = await state(page);
    expect(s).toMatchObject({ narration: false, heard: 'effects', audioPaused: false, mixPaused: true });
    expect(Math.abs(s.t - s.audioTime!)).toBeLessThan(0.1);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('switching while paused starts nothing; the next play uses the chosen track', async () => {
    const { page } = await open(server.browser, `${server.url}?t=50`);
    await page.keyboard.press('n');
    await page.waitForTimeout(200);
    expect(await state(page)).toMatchObject({ playing: false, heard: 'effects', audioPaused: true, mixPaused: true, t: 50 });
    await page.keyboard.press(' ');
    await until(page, (P) => P.playing && P.track() === P.tracks.effects && !P.track().paused && P.t > 50.3 && Math.abs(P.t - P.track().currentTime) < 0.1);
    expect((await state(page)).mixPaused).toBe(true);
    await page.close();
  }, 60_000);

  test('switching while playing keeps the picture going, with one track heard at a time, however fast it is switched', async () => {
    const { page } = await open(server.browser, `${server.url}?t=120`);
    await page.keyboard.press(' ');
    await until(page, (P) => P.playing && P.t > 120.5);
    const before = (await state(page)).t;
    for (let i = 0; i < 5; i++) await page.keyboard.press('n');
    await until(page, (P) => !P.narration && P.track() === P.tracks.effects && !P.tracks.effects.paused && Math.abs(P.t - P.track().currentTime) < 0.1);
    const s = await state(page);
    expect(s.mixPaused).toBe(true);
    expect(s.playing).toBe(true);
    expect(s.t).toBeGreaterThan(before - 0.1); // no jump back
    expect(s.t).toBeLessThan(before + 4);
    await page.keyboard.press('n');
    await until(page, (P) => P.narration && !P.tracks.mix.paused && P.tracks.effects.paused && Math.abs(P.t - P.tracks.mix.currentTime) < 0.1);
    await page.close();
  }, 60_000);

  test('scrubbing with the narration off keeps the effects in sync', async () => {
    const { page } = await open(server.browser, `${server.url}?narration=0&t=10`);
    await page.keyboard.press(' ');
    await until(page, (P) => P.playing && P.t > 10.5);
    await seek(page, 300);
    await until(page, (P) => P.t > 300.4 && Math.abs(P.t - P.tracks.effects.currentTime) < 0.1 && P.tracks.mix.paused);
    await page.close();
  }, 60_000);
});

describe('scrubbing', () => {
  /** Drive the range input as a user does: set its value and fire `input`. */
  const scrubTo = (page: Page, t: number) => page.evaluate((t) => {
    const input = document.querySelector('.scrub') as HTMLInputElement;
    input.value = String(t);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, t);

  test('while paused, scrubbing shows the frame, moves the clock and the audio position, and starts nothing', async () => {
    const { page, problems } = await open(server.browser, `${server.url}?t=20`);
    await scrubTo(page, 187.5);
    await drawn(page, 187.5);
    const s = await state(page);
    expect(s).toMatchObject({ t: 187.5, playing: false, audioPaused: true });
    expect(s.audioTime).toBeCloseTo(187.5, 1);
    expect(await page.textContent('.time')).toMatch(/^3:07 \/ /);
    expect(await page.inputValue('.scrub')).toBe('187.5');
    await scrubTo(page, 3);
    await drawn(page, 3);
    expect(await page.textContent('.time')).toMatch(/^0:03 \/ /);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('different times draw different pictures; the same time draws the same one', async () => {
    const { page } = await open(server.browser, `${server.url}?t=20`);
    const shot = async (t: number) => {
      await scrubTo(page, t);
      await drawn(page, t);
      return page.evaluate(() => (document.querySelector('canvas') as HTMLCanvasElement).toDataURL());
    };
    const scenes = (await state(page)).scenes;
    const at = (k: number) => Math.round((scenes[k]!.start + 1) * 100) / 100; // the bar steps by 0.01 s
    const a = await shot(at(2)), b = await shot(at(8)), a2 = await shot(at(2));
    expect(a).not.toBe(b);
    expect(a2).toBe(a);
    await page.close();
  }, 60_000);

  test('scrubbing while playing carries on playing from there', async () => {
    const { page } = await open(server.browser, `${server.url}?t=20`);
    await page.keyboard.press(' ');
    await until(page, (P) => P.playing && P.t > 20.5);
    await scrubTo(page, 250);
    await until(page, (P) => P.t > 250.4 && P.t < 252 && Math.abs(P.t - P.track().currentTime) < 0.1);
    expect((await state(page)).playing).toBe(true);
    await page.close();
  }, 60_000);

  test('clicking the bar seeks in proportion to where it was clicked', async () => {
    const { page } = await open(server.browser, `${server.url}?t=20`);
    const box = (await page.locator('.scrub').boundingBox())!;
    const { to } = await state(page);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
    await until(page, (P) => Math.abs(P.t - P.to / 2) < P.to * 0.02);
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
    await until(page, (P) => Math.abs(P.t - P.to * 0.9) < P.to * 0.02);
    expect((await state(page)).t).toBeLessThan(to);
    await page.close();
  }, 60_000);

  test('the bar spans the video, with a tick at the start of each scene after the first', async () => {
    const { page } = await open(server.browser, server.url);
    const { scenes, to } = await state(page);
    expect(await page.getAttribute('.scrub', 'max')).toBe(String(to));
    expect(await page.getAttribute('.scrub', 'min')).toBe('0');
    const lefts = await page.$$eval('.marks i', (marks) => marks.map((m) => parseFloat((m as HTMLElement).style.left)));
    const starts = scenes.map((s) => s.start).filter((t) => t > 0);
    expect(lefts.length).toBe(starts.length);
    lefts.forEach((left, k) => expect(left).toBeCloseTo((starts[k]! / to) * 100, 3));
    await page.close();
  }, 60_000);

  test('hovering the bar shows the time and scene under the pointer, and leaving hides it', async () => {
    const { page } = await open(server.browser, server.url);
    const { scenes, to } = await state(page);
    expect(await page.isHidden('.tip')).toBe(true);
    const box = (await page.locator('.track').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.waitForSelector('.tip:not([hidden])');
    const text = (await page.textContent('.tip'))!;
    const t = to * 0.5;
    const scene = scenes.filter((e) => t >= e.start && t < e.end).at(-1)!.id;
    expect(text).toMatch(new RegExp(`^\\d+:\\d\\d  ·  ${scene}$`));
    const minutes = +text.split(':')[0]!;
    expect(minutes).toBe(Math.floor(t / 60));
    await page.mouse.move(box.x + box.width / 2, box.y - 200);
    await page.waitForSelector('.tip', { state: 'hidden' });
    await page.close();
  }, 60_000);
});
