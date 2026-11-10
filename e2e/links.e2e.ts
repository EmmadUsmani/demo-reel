// Links into the player, end to end in headless Chrome: deep links, the Share box, scene embeds, slide
// notes and bad URLs. bun run test:e2e (see harness.ts for what it needs).
import { beforeAll, describe, expect, test } from 'bun:test';
import type { Page } from 'playwright-core';
import { drawn, open, readCaptions, seek, serve, state, until } from './harness';

let server: Awaited<ReturnType<typeof serve>>;
beforeAll(async () => { server = await serve(); }, 240_000);

const captions = await readCaptions();
const ev = <T>(page: Page, fn: (P: any) => T) => page.evaluate(`(${fn.toString()})(window.__player)`) as Promise<T>;
const pressed = (page: Page, selector: string) => page.getAttribute(selector, 'aria-pressed');
const deckOf = (page: Page) => ev(page, (P) => ({ slide: P.deck.slide as number, stops: P.deck.stops as number[], t: P.t as number, mode: P.mode as string, started: P.started as boolean }));

describe('deep links', () => {
  test('?t= opens paused on that moment, and the first play carries on from there', async () => {
    const { page, problems } = await open(server.browser, `${server.url}?t=123.4`);
    expect(await state(page)).toMatchObject({ t: 123.4, playing: false, bigHidden: false });
    await drawn(page, 123.4);
    await page.keyboard.press(' ');
    await until(page, (P) => P.playing && P.t > 123.9 && P.t < 126);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('?t= outside the video is clamped into it, and the video still plays from the start when asked', async () => {
    const { page } = await open(server.browser, `${server.url}?t=-5`);
    expect((await state(page)).t).toBe(0);
    await page.close();
    const late = await open(server.browser, `${server.url}?t=999999`);
    const s = await state(late.page);
    expect(s.t).toBeCloseTo(s.to, 2);
    expect(s.t).toBeLessThan(s.to);
    await late.page.click('.big');
    await until(late.page, (P) => P.playing && P.t < 2); // at its end, play starts over
    expect(late.problems).toEqual([]);
    await late.page.close();
  }, 60_000);

  test('#slide-N opens slides mode on slide N, paused on its stop', async () => {
    for (const n of [1, 4, 20]) {
      const { page, problems } = await open(server.browser, `${server.url}#slide-${n}`);
      const d = await deckOf(page);
      expect(d).toMatchObject({ mode: 'slides', slide: n - 1, started: true });
      expect(d.t).toBeCloseTo(d.stops[n - 1]!, 3);
      expect(await page.textContent('.count')).toBe(`${n} / ${d.stops.length}`);
      expect((await state(page)).playing).toBe(false);
      expect(problems).toEqual([]);
      await page.close();
    }
  }, 90_000);

  test('#slides opens slides mode before the first slide', async () => {
    const { page } = await open(server.browser, `${server.url}#slides`);
    expect(await deckOf(page)).toMatchObject({ mode: 'slides', slide: -1, started: false });
    expect(await page.isVisible('.big')).toBe(true);
    expect(await page.getAttribute('.big', 'aria-label')).toBe('Start');
    await page.close();
  }, 60_000);

  test('?slide= past the end opens on the last slide; 0 and negative numbers before the first', async () => {
    const { page } = await open(server.browser, `${server.url}?mode=slides&slide=9999`);
    const d = await deckOf(page);
    expect(d.slide).toBe(d.stops.length - 1);
    expect(d.t).toBe(d.stops.at(-1)!);
    await page.close();
    for (const slide of ['0', '-3']) {
      const other = await open(server.browser, `${server.url}?mode=slides&slide=${slide}`);
      expect((await deckOf(other.page)).slide).toBe(-1);
      await other.page.close();
    }
  }, 90_000);

  test('?slide= without slides mode is ignored', async () => {
    const { page } = await open(server.browser, `${server.url}?slide=5`);
    const d = await deckOf(page);
    expect(d.mode).toBe('video');
    expect((await state(page)).playing).toBe(false);
    expect(await page.isVisible('.track')).toBe(true);
    await page.close();
  }, 60_000);

  test('nonsense values do not break the player: it opens on its poster or its first slide', async () => {
    const poster = (await open(server.browser, server.url));
    const posterT = (await state(poster.page)).t;
    await poster.page.close();
    for (const query of ['?t=abc', '?t=', '?t=NaN']) {
      const { page, problems } = await open(server.browser, `${server.url}${query}`);
      const s = await state(page);
      expect(Number.isFinite(s.t), `${query}: t ${s.t}`).toBe(true);
      expect(s.t).toBeGreaterThanOrEqual(0);
      expect(s.t).toBeLessThan(s.to);
      await drawn(page, s.t);
      expect(await page.textContent('.time')).toMatch(/^\d+:\d\d \/ \d+:\d\d$/);
      expect(problems, query).toEqual([]);
      await page.close();
    }
    const nonsense = await open(server.browser, `${server.url}?t=abc`);
    expect((await state(nonsense.page)).t, '?t=abc opens where no ?t does').toBe(posterT);
    await nonsense.page.close();
    for (const query of ['?mode=slides&slide=abc', '?mode=slides&slide=2.5', '?mode=slides&slide=1e9', '#slide-99999999999999999999']) {
      const { page, problems } = await open(server.browser, `${server.url}${query}`);
      const d = await deckOf(page);
      expect(Number.isInteger(d.slide), `${query}: slide ${d.slide}`).toBe(true);
      expect(Number.isFinite(d.t), `${query}: t ${d.t}`).toBe(true);
      expect(d.slide).toBeGreaterThanOrEqual(-1);
      expect(d.slide).toBeLessThan(d.stops.length);
      expect(problems, query).toEqual([]);
      await page.close();
    }
  }, 120_000);

  test('back and forward between links to different slides land on the slide of each link', async () => {
    const { page } = await open(server.browser, `${server.url}#slide-3`);
    expect((await deckOf(page)).slide).toBe(2);
    await page.goto(`${server.url}?mode=slides&slide=5`);
    await page.waitForFunction(() => (window as any).__player);
    expect((await deckOf(page)).slide).toBe(4);
    await page.goto(`${server.url}?t=77`);
    await page.waitForFunction(() => (window as any).__player);
    expect((await state(page)).t).toBe(77);
    await page.goBack();
    await page.waitForFunction(() => (window as any).__player);
    expect(await deckOf(page)).toMatchObject({ mode: 'slides', slide: 4 });
    await page.goBack();
    await page.waitForFunction(() => (window as any).__player);
    expect(await deckOf(page)).toMatchObject({ mode: 'slides', slide: 2 });
    await page.goForward();
    await page.waitForFunction(() => (window as any).__player);
    expect((await deckOf(page)).slide).toBe(4);
    await page.close();
  }, 90_000);

  // The hash is read once, when the page loads: changing it in a loaded page (a link clicked inside the page,
  // back/forward between two hashes) does nothing. Whether the player should follow it is the owner's call:
  // a host that passes only a #name (a Claude artifact) loads the page afresh for each.
  test.todo('changing #slide-N in a loaded page moves the deck to that slide');
});

describe('the Share box', () => {
  const link = (page: Page, which: '.link-t' | '.link-slide' | '.embed') => page.inputValue(which);

  test('the link to the moment opens the same moment, with the other options kept', async () => {
    const { page } = await open(server.browser, `${server.url}?captions=1&narration=0&t=61.234`);
    await page.click('.share-on');
    const url = await link(page, '.link-t');
    expect(url).toBe(`${server.url}?captions=1&narration=0&t=61.23`);
    await page.close();
    const opened = await open(server.browser, url);
    expect(await state(opened.page)).toMatchObject({ t: 61.23, playing: false, narration: false });
    expect(await pressed(opened.page, '.cc')).toBe('true');
    await opened.page.close();
  }, 60_000);

  test('the link follows the video: a paused moment found by scrubbing is the one linked', async () => {
    const { page } = await open(server.browser, server.url);
    await seek(page, 301.5);
    await page.click('.share-on');
    expect(await link(page, '.link-t')).toMatch(/\?t=301\.50$/);
    await page.keyboard.press('Escape');
    await seek(page, 12.25);
    await page.click('.share-on');
    expect(await link(page, '.link-t')).toMatch(/\?t=12\.25$/);
    await page.close();
  }, 60_000);

  test('the link to a moment found while playing opens within a hair of it', async () => {
    const { page } = await open(server.browser, `${server.url}?t=90`);
    await page.keyboard.press(' ');
    await until(page, (P) => P.playing && P.t > 91);
    await page.keyboard.press('k');
    await until(page, (P) => !P.playing);
    const t = (await state(page)).t;
    await page.click('.share-on');
    const opened = await open(server.browser, await link(page, '.link-t'));
    expect(Math.abs((await state(opened.page)).t - t)).toBeLessThanOrEqual(0.0051);
    await opened.page.close();
    await page.close();
  }, 60_000);

  test('the link to the slide is only offered in slides mode, and opens that slide', async () => {
    const { page } = await open(server.browser, server.url);
    await page.click('.share-on');
    expect(await page.isHidden('.link-slide')).toBe(true);
    await page.keyboard.press('Escape');
    await page.click('.mode');
    await page.keyboard.press('End');
    await page.click('.share-on');
    expect(await page.isVisible('.link-slide')).toBe(true);
    const url = await link(page, '.link-slide');
    const { stops } = await deckOf(page);
    expect(url).toBe(`${server.url}?mode=slides&slide=${stops.length}`);
    const opened = await open(server.browser, url);
    const d = await deckOf(opened.page);
    expect(d).toMatchObject({ mode: 'slides', slide: stops.length - 1 });
    expect(d.t).toBe(stops.at(-1)!);
    await opened.page.close();
    await page.close();
  }, 60_000);

  test('before the first slide, the slide link names slide 1', async () => {
    const { page } = await open(server.browser, `${server.url}?mode=slides`);
    await page.click('.share-on');
    expect(await link(page, '.link-slide')).toBe(`${server.url}?mode=slides&slide=1`);
    await page.close();
  }, 60_000);

  test('the embed is an iframe that plays the scene on screen, and only that scene', async () => {
    const { page } = await open(server.browser, server.url);
    const { scenes } = await state(page);
    const pacing = scenes.find((e) => e.id === 'pacing')!;
    await seek(page, pacing.start + 5);
    await page.click('.share-on');
    const html = await link(page, '.embed');
    expect(html).toMatch(/^<iframe src="[^"]+\?scene=pacing" width="960" height="540" /);
    const host = await server.browser.newPage();
    await host.setContent(`<body style="margin:0">${html}</body>`);
    const frame = host.frames().find((f) => f.url().includes('scene=pacing'))!;
    expect(frame).toBeDefined();
    await frame.waitForFunction(() => (window as any).__player, null, { timeout: 60_000 });
    const embedded = await frame.evaluate(() => { const P = (window as any).__player; return { from: P.from, to: P.to, scenes: P.engine.scenes.size, title: document.querySelector('.title')!.textContent }; });
    expect(embedded.scenes).toBe(1);
    expect(embedded.from).toBeCloseTo(pacing.start, 3);
    expect(embedded.to).toBeCloseTo(pacing.end, 3);
    expect(embedded.title).toContain('pacing');
    await host.close();
    await page.close();
  }, 90_000);

  test('on an embed, the links stay on the scene', async () => {
    const { page } = await open(server.browser, `${server.url}?scene=pacing`);
    await page.click('.share-on');
    expect(await link(page, '.link-t')).toMatch(/^[^?]+\?scene=pacing&t=\d+\.\d\d$/);
    expect(await link(page, '.embed')).toContain('?scene=pacing"');
    const opened = await open(server.browser, await link(page, '.link-t'));
    const s = await state(opened.page);
    const original = await state(page);
    expect([s.from, s.to]).toEqual([original.from, original.to]);
    await opened.page.close();
    await page.close();
  }, 60_000);

  test('opening and closing the box with its button; the fields select all of their text when focused', async () => {
    const { page } = await open(server.browser, server.url);
    expect(await page.isHidden('.share')).toBe(true);
    await page.click('.share-on');
    expect(await page.isVisible('.share')).toBe(true);
    for (const field of ['.link-t', '.embed']) {
      await page.focus(field);
      const selected = await page.$eval(field, (el) => { const f = el as HTMLInputElement; return f.value.length > 0 && f.selectionStart === 0 && f.selectionEnd === f.value.length; });
      expect(selected, field).toBe(true);
    }
    await page.click('.share-on');
    expect(await page.isHidden('.share')).toBe(true);
    await page.close();
  }, 60_000);
});

describe('scene embeds', () => {
  test('#scene-<id> is the same embed as ?scene=<id>', async () => {
    const a = await open(server.browser, `${server.url}#scene-pacing`);
    const b = await open(server.browser, `${server.url}?scene=pacing`);
    const sa = await state(a.page), sb = await state(b.page);
    expect([sa.from, sa.to, sa.t]).toEqual([sb.from, sb.to, sb.t]);
    expect(a.problems).toEqual([]);
    expect((await deckOf(a.page)).stops).toEqual((await deckOf(b.page)).stops);
    await a.page.close();
    await b.page.close();
  }, 60_000);

  test('it opens on its last stop, plays from its own start and never past its end, then offers a replay', async () => {
    const { page, problems } = await open(server.browser, `${server.url}?scene=pacing`);
    const s0 = await state(page);
    const { stops } = await deckOf(page);
    expect(s0.t).toBe(stops.at(-1)!);
    expect(await page.textContent('.title')).toContain('pacing');
    await page.click('.big');
    await until(page, (P) => P.playing && P.t < P.from + 3);
    expect((await state(page)).t).toBeGreaterThanOrEqual(s0.from);
    // the end of the scene: sample the clock until playback stops
    await seek(page, s0.to - 1);
    const seen = await page.evaluate(async () => {
      const P = (window as any).__player, out: number[] = [];
      const start = performance.now();
      while (P.playing && performance.now() - start < 8000) { out.push(P.t); await new Promise((r) => setTimeout(r, 25)); }
      return { max: Math.max(...out), n: out.length, playing: P.playing, t: P.t };
    });
    expect(seen.playing).toBe(false);
    expect(seen.max).toBeLessThan(s0.to);
    expect(seen.t).toBeGreaterThan(s0.to - 0.05);
    expect((await state(page)).audioPaused).toBe(true);
    expect(await page.getAttribute('.play', 'aria-label')).toBe('Play');
    await page.click('.big');
    await until(page, (P) => P.playing && P.t < P.from + 2);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('its bar and clock cover the scene, not the whole video', async () => {
    const { page } = await open(server.browser, `${server.url}?scene=pacing`);
    const s = await state(page);
    expect(+(await page.getAttribute('.scrub', 'min'))!).toBeCloseTo(s.from, 3);
    expect(+(await page.getAttribute('.scrub', 'max'))!).toBeCloseTo(s.to, 3);
    await seek(page, s.from);
    await drawn(page, s.from);
    const length = s.to - s.from;
    expect(await page.textContent('.time')).toBe(`0:00 / ${Math.floor(length / 60)}:${String(Math.floor(length % 60)).padStart(2, '0')}`);
    await page.keyboard.press('ArrowLeft'); // clamped to the scene's start
    expect((await state(page)).t).toBe(s.from);
    await page.keyboard.press('Home');
    expect((await state(page)).t).toBe(s.from);
    await page.close();
  }, 60_000);

  test('in slides mode it has only the scene\'s own slides, and Home returns to the scene\'s start', async () => {
    const full = await open(server.browser, `${server.url}?mode=slides`);
    const all = (await deckOf(full.page)).stops;
    const { scenes } = await state(full.page);
    await full.page.close();
    const pacing = scenes.find((e) => e.id === 'pacing')!;
    const own = all.filter((t) => t >= pacing.start && t < pacing.end);
    expect(own.length).toBeGreaterThan(0);
    const { page } = await open(server.browser, `${server.url}?scene=pacing&mode=slides`);
    const d = await deckOf(page);
    expect(d.stops).toEqual(own);
    expect(await page.textContent('.count')).toBe(`– / ${own.length}`);
    await page.keyboard.press('End');
    expect((await deckOf(page)).t).toBe(own.at(-1)!);
    await page.keyboard.press('Home');
    expect((await state(page)).t).toBeCloseTo(pacing.start, 3);
    await page.close();
  }, 60_000);

  test('an embed plays the sound of its stretch of the soundtrack', async () => {
    const { page } = await open(server.browser, `${server.url}#scene-guardrails`);
    const s = await state(page);
    await page.click('.big');
    await until(page, (P) => P.playing && P.t > P.from + 1 && Math.abs(P.t - P.track().currentTime) < 0.1);
    expect((await state(page)).audioTime!).toBeGreaterThan(s.from);
    await page.close();
  }, 60_000);
});

describe('speaker notes', () => {
  /** Where each caption belongs: the first slide whose stop is at or after the line's start. */
  const slideOf = (stops: number[], at: number) => stops.findIndex((stop) => at <= stop);

  test('they are a slides-mode panel: hidden in video mode, and the key only toggles them in slides', async () => {
    const { page } = await open(server.browser, server.url);
    expect(await page.isHidden('.notes')).toBe(true);
    expect(await page.isHidden('.notes-on')).toBe(true);
    await page.keyboard.press('v');
    expect(await page.isVisible('.notes-on')).toBe(true);
    expect(await page.isHidden('.notes')).toBe(true);
    await page.keyboard.press('s');
    expect(await page.isVisible('.notes')).toBe(true);
    expect(await pressed(page, '.notes-on')).toBe('true');
    await page.keyboard.press('v'); // the choice sticks, but video mode has no panel
    expect(await page.isHidden('.notes')).toBe(true);
    await page.keyboard.press('v');
    expect(await page.isVisible('.notes')).toBe(true);
    await page.click('.notes-on');
    expect(await page.isHidden('.notes')).toBe(true);
    await page.close();
  }, 60_000);

  test('before the first slide, they say how to start', async () => {
    const { page } = await open(server.browser, `${server.url}?mode=slides`);
    await page.keyboard.press('s');
    expect(await page.textContent('.notes')).toContain('Press → or click the slide to start');
    await page.close();
  }, 60_000);

  test('every slide shows the lines said on the way to it, in their written form, and every line is on one slide', async () => {
    const { page } = await open(server.browser, `${server.url}?mode=slides`);
    await page.keyboard.press('s');
    const { stops } = await deckOf(page);
    const seen: string[] = [];
    for (let k = 0; k < stops.length; k++) {
      await page.evaluate((k) => (window as any).__player.go(k), k);
      const notes = await page.$eval('.notes', (el) => ({ head: el.querySelector('h2')?.textContent, lines: [...el.querySelectorAll('p:not(.hint)')].map((p) => p.textContent), hint: el.querySelector('.hint')?.textContent }));
      const expected = captions.filter((c) => slideOf(stops, c.at) === k).map((c) => c.text);
      expect({ slide: k, head: notes.head, lines: notes.lines }).toEqual({ slide: k, head: `Slide ${k + 1} of ${stops.length}`, lines: expected });
      if (!expected.length) expect(notes.hint).toBe('No narration on this slide.');
      seen.push(...(notes.lines as string[]));
    }
    expect(seen).toEqual(captions.map((c) => c.text));
    await page.close();
  }, 90_000);

  test('while a step plays, the notes are those of the slide it is playing to', async () => {
    const { page } = await open(server.browser, `${server.url}?mode=slides&slide=2`);
    await page.keyboard.press('s');
    expect(await page.textContent('.notes')).toContain('Slide 2 of');
    await page.keyboard.press('ArrowRight');
    await until(page, (P) => P.deck.target === 2);
    expect(await page.textContent('.notes')).toContain('Slide 3 of');
    expect(await page.textContent('.count')).toMatch(/^3 \/ /);
    await page.keyboard.press('ArrowLeft'); // undo the step: back to the slide it left
    expect(await page.textContent('.notes')).toContain('Slide 2 of');
    await page.close();
  }, 60_000);
});

describe('bad links', () => {
  const failure = async (query: string) => {
    const page = await server.browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${server.url}${query}`);
    await page.waitForSelector('.player.failed .status', { timeout: 60_000 });
    const text = (await page.textContent('.status'))!;
    expect(await page.evaluate(() => (window as any).__player)).toBeUndefined();
    await page.close();
    return text;
  };

  test('an unknown scene says so, instead of a blank page', async () => {
    const text = await failure('?scene=nope');
    expect(text).toContain('This video failed to load');
    expect(text).toContain("no scene 'nope'");
    expect(text).toContain('pacing'); // and lists the scenes there are
  }, 60_000);

  test('the same through #scene-<id>', async () => {
    expect(await failure('#scene-nope')).toContain("no scene 'nope'");
  }, 60_000);

  test('an unknown edit says so, and lists the edits there are', async () => {
    const text = await failure('?edit=nope');
    expect(text).toContain("no edit 'nope'");
    expect(text).toContain('news-digest');
  }, 60_000);
});
