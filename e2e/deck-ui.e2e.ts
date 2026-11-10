// The deck's interface, end to end in headless Chrome: the switch between the audience view and the
// presenter view, the progress bar of a step, and ambient motion on a held slide. bun run test:e2e.
// The pilot deck (news-digest-deck, built as one file) shows all three; news-digest, built as a folder by
// the harness, is a video whose scenes are mostly not ambient (their held frame is a still).
import { beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { buildSingleOf, open, presenterSettled, ROOT, serve, serveAsArtifact, serveDev } from './harness';

const DECK = 'news-digest-deck';
const SHOTS = path.join(ROOT, 'out', 'shots');
/** The pilot's slides: 1 title ... 7 observe (the flowing packets) 8 end. */
const OBSERVE = 7;

let server: Awaited<ReturnType<typeof serve>>;
let dev: Awaited<ReturnType<typeof serveDev>>;
let file: string;
beforeAll(async () => { server = await serve(); dev = await serveDev(); file = buildSingleOf(DECK); }, 240_000);

const pilot = (suffix = '') => `file://${file}${suffix}`;

const settled = (page: Page) => page.waitForFunction(() => { const P = (window as any).__player; return P.deck.target === null && !P.playing && P.drawn === P.t; }, null, { timeout: 30_000 });

/** A fingerprint of every pixel of the engine's canvas. */
const pixels = (page: Page) => page.evaluate(() => {
  const canvas = (window as any).__player.canvas as HTMLCanvasElement;
  const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let hash = 2166136261;
  for (let i = 0; i < data.length; i += 4) hash = Math.imul(hash ^ (data[i]! | (data[i + 1]! << 8) | (data[i + 2]! << 16)), 16777619);
  return hash >>> 0;
});

/** The progress bar's state: its fraction and state as the page shows them, and whether it is on screen. */
const bar = (page: Page, selector: string) => page.evaluate((selector) => {
  const el = document.querySelector(selector) as HTMLElement;
  const fill = el.firstElementChild as HTMLElement;
  return { state: el.dataset.state!, fraction: +el.dataset.fraction!, shown: !el.hidden && getComputedStyle(el).display !== 'none', fill: getComputedStyle(fill).backgroundColor, scale: fill.style.transform };
}, selector);

/** Two pixel fingerprints of a held slide ~half a second apart, with the video time they were drawn at. */
async function heldTwice(page: Page) {
  const at = () => page.evaluate(() => (window as any).__player.t as number);
  const t0 = await at();
  const first = await pixels(page);
  await page.waitForTimeout(500);
  const second = await pixels(page);
  expect(await at(), 'the video time stands still while held').toBe(t0);
  return { first, second };
}

/** Wait until the page is the view `view` on slide `slide` (0-based, -1 before the first), drawn and settled. */
const onView = (page: Page, view: 'presenter' | 'player', slide: number) => page.waitForFunction(({ view, slide }) => {
  const P = (window as any).__player;
  const presenter = !!P?.root.classList.contains('presenter');
  return P && presenter === (view === 'presenter') && P.deck.slide === slide && P.deck.target === null && !P.playing && P.drawn === P.t;
}, { view, slide }, { timeout: 60_000 });

/** Hover first, as a person does: the controls hide when idle and wake on a pointer move. */
async function press(page: Page, selector: string) {
  await page.mouse.move(640, 300);
  await page.click(selector);
}

describe('the progress bar of a step', () => {
  test('player, slides mode: empty before the first slide, fills while the step plays, then is done and a different colour', async () => {
    const { page, problems } = await open(server.browser, pilot());
    await settled(page);
    expect(await bar(page, '.progress')).toMatchObject({ state: 'empty', fraction: 0, shown: true });
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    const a = await bar(page, '.progress');
    await page.waitForTimeout(800);
    const b = await bar(page, '.progress');
    expect(a.state).toBe('playing');
    expect(b.state).toBe('playing');
    expect(a.fraction).toBeGreaterThan(0);
    expect(b.fraction).toBeGreaterThan(a.fraction);
    expect(b.fraction).toBeLessThan(1);
    expect(b.scale).toBe(`scaleX(${b.fraction.toFixed(3)})`);
    await settled(page);
    const done = await bar(page, '.progress');
    expect(done).toMatchObject({ state: 'done', fraction: 1, shown: true });
    expect(done.fill).not.toBe(b.fill);
    expect(problems).toEqual([]);
    await page.close();
  }, 90_000);

  test('player: a step finished early by a second press is done at once; going back to the start empties it', async () => {
    const { page } = await open(server.browser, pilot());
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    expect((await bar(page, '.progress')).state).toBe('playing');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => (document.querySelector('.progress') as HTMLElement).dataset.state === 'done');
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => (document.querySelector('.progress') as HTMLElement).dataset.state === 'empty');
    expect((await bar(page, '.progress')).fraction).toBe(0);
    await page.close();
  }, 60_000);

  test('player, video mode: no bar (the scrub bar does that job)', async () => {
    const { page, problems } = await open(server.browser, `${server.url}?mode=video`);
    expect((await bar(page, '.progress')).shown).toBe(false);
    await page.keyboard.press('v'); // to slides: it shows
    await settled(page);
    expect((await bar(page, '.progress')).shown).toBe(true);
    await page.keyboard.press('v');
    expect((await bar(page, '.progress')).shown).toBe(false);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('presenter: empty and "Now" before the first slide; "Now · playing" while a step plays; "Now · ready" and done on arrival', async () => {
    const { page, problems } = await open(server.browser, pilot('#presenter'));
    await presenterSettled(page);
    const label = () => page.textContent('.p-state');
    expect(await bar(page, '.p-now .progress')).toMatchObject({ state: 'empty', fraction: 0, shown: true });
    expect(await label()).toBe('Now');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    const a = await bar(page, '.p-now .progress');
    await page.waitForTimeout(800);
    const b = await bar(page, '.p-now .progress');
    expect([a.state, b.state]).toEqual(['playing', 'playing']);
    expect(b.fraction).toBeGreaterThan(a.fraction);
    expect(b.fraction).toBeLessThan(1);
    expect(await label()).toBe('Now · playing');
    await presenterSettled(page);
    const done = await bar(page, '.p-now .progress');
    expect(done).toMatchObject({ state: 'done', fraction: 1 });
    expect(done.fill).not.toBe(b.fill);
    expect(await label()).toBe('Now · ready');
    expect(problems).toEqual([]);
    await page.close();
  }, 90_000);
});

describe('switching between the audience view and the presenter view', () => {
  /** From the audience view on slide `k` (1-based) to the presenter on it and back; the page's URL starts with `base`. */
  async function there(page: Page, k: number, base: string) {
    await onView(page, 'player', k - 1);
    await press(page, '.presenter-on');
    await onView(page, 'presenter', k - 1);
    expect(new URL(page.url()).hash).toBe(`#presenter-${k}`);
    expect(await page.textContent('.p-count')).toStartWith(`${k} /`);
    await page.click('.p-audience');
    await onView(page, 'player', k - 1);
    expect(new URL(page.url()).hash).toBe(`#slide-${k}`);
    expect(page.url().startsWith(base)).toBe(true);
    expect(await page.textContent('.count')).toStartWith(`${k} /`);
  }

  test('on the built folder: Presenter opens the presenter on the slide, Audience view comes back to it', async () => {
    const { page, problems } = await open(server.browser, `${server.url}?mode=slides&slide=3`);
    await there(page, 3, server.url);
    expect(problems).toEqual([]);
    await page.close();
  }, 120_000);

  test('before the first slide the bare names are used, and the other view is before the first slide too', async () => {
    const { page, problems } = await open(server.browser, `${server.url}?mode=slides`);
    await onView(page, 'player', -1);
    await press(page, '.presenter-on');
    await onView(page, 'presenter', -1);
    expect(new URL(page.url()).hash).toBe('#presenter');
    await page.click('.p-audience');
    await onView(page, 'player', -1);
    expect(new URL(page.url()).hash).toBe('#slides');
    expect(problems).toEqual([]);
    await page.close();
  }, 120_000);

  test('in video mode Presenter opens on the slide at or before the current time', async () => {
    const { page, problems } = await open(server.browser, `${server.url}?mode=video`);
    expect(await page.isVisible('.presenter-on')).toBe(true);
    const at = await page.evaluate(() => { const P = (window as any).__player; const t = P.deck.stops[3] + 0.5; P.seek(t); return t; });
    expect(at).toBeGreaterThan(0);
    await page.waitForFunction((t) => (window as any).__player.drawn === t, at);
    await press(page, '.presenter-on');
    await onView(page, 'presenter', 3);
    expect(new URL(page.url()).hash).toBe('#presenter-4');
    expect(problems).toEqual([]);
    await page.close();
  }, 120_000);

  test('the Share box still has its presenter link', async () => {
    const { page } = await open(server.browser, `${server.url}?mode=slides&slide=2`);
    await onView(page, 'player', 1);
    await press(page, '.share-on');
    expect(await page.inputValue('.link-presenter')).toContain('view=presenter&slide=2');
    expect(await page.getAttribute('.open-presenter', 'href')).toContain('view=presenter');
    await page.close();
  }, 60_000);

  test('on the single file, from file://', async () => {
    const { page, problems } = await open(server.browser, pilot('#slide-4'));
    await there(page, 4, `file://${file}`);
    expect(problems).toEqual([]);
    await page.close();
  }, 120_000);

  test('on the single file as a Claude artifact serves it (sandboxed, no connections)', async () => {
    const host = serveAsArtifact(file);
    const { page, problems } = await open(server.browser, `${host.url}#slide-5`);
    await there(page, 5, host.url);
    expect(problems).toEqual([]);
    await page.close();
    host.stop();
  }, 120_000);

  test('a hash name wins over the query: #slides under ?view=presenter is the audience view', async () => {
    const { page } = await open(server.browser, `${server.url}?view=presenter&mode=video#slide-2`);
    await onView(page, 'player', 1);
    expect(await page.evaluate(() => (window as any).__player.mode)).toBe('slides');
    await page.close();
  }, 60_000);

  test('the presenter header\'s Audience view pill fits a 390x844 phone with no horizontal overflow', async () => {
    const { page, problems } = await open(server.browser, pilot('#presenter-3'));
    for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(size);
      await presenterSettled(page);
      await page.waitForTimeout(200);
      const box = await page.evaluate(() => {
        const r = (document.querySelector('.p-audience') as HTMLElement).getBoundingClientRect();
        return { left: r.left, right: r.right, scroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), inner: window.innerWidth };
      });
      expect(box.scroll, `${size.width}`).toBeLessThanOrEqual(box.inner);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(box.inner);
    }
    expect(problems).toEqual([]);
    await page.close();
  }, 90_000);
});

describe('ambient motion on a held slide', () => {
  test('the pilot\'s flowing-packets slide keeps moving while held: the video time stands still, the pixels change', async () => {
    const { page, problems } = await open(server.browser, pilot(`#slide-${OBSERVE}`));
    await settled(page);
    const { first, second } = await heldTwice(page);
    expect(second).not.toBe(first);
    expect(await page.evaluate(() => (window as any).__player.ambient.held)).toBe(true);
    expect(problems).toEqual([]);
    mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({ path: path.join(SHOTS, 'deck-ui-pilot-observe.png') });
    await page.close();
  }, 90_000);

  test('the same in the presenter view', async () => {
    const { page, problems } = await open(server.browser, pilot(`#presenter-${OBSERVE}`));
    await presenterSettled(page);
    const { first, second } = await heldTwice(page);
    expect(second).not.toBe(first);
    expect(problems).toEqual([]);
    await page.close();
  }, 90_000);

  /** The first slide of news-digest on a scene that does not use ambient (its held frame is a pure function of t). */
  async function plainSlide() {
    const { page } = await open(server.browser, `${server.url}?mode=slides`);
    const slide = await page.evaluate(() => (window as any).__player.engine.stops().findIndex((s: { scene: string }) => s.scene === 'loop') + 1);
    await page.close();
    expect(slide).toBeGreaterThan(0);
    return slide;
  }

  test('a slide of a scene that does not use ambient does not change while held, in the player and in the presenter', async () => {
    const slide = await plainSlide();
    for (const query of [`?mode=slides&slide=${slide}`, `?view=presenter&slide=${slide}`]) {
      const { page, problems } = await open(server.browser, `${server.url}${query}`);
      if (query.includes('presenter')) await presenterSettled(page);
      else await settled(page);
      const { first, second } = await heldTwice(page);
      expect(second, query).toBe(first);
      expect(problems).toEqual([]);
      await page.close();
    }
  }, 120_000);

  test('in video mode at a fixed paused time the picture does not change, even on an ambient scene', async () => {
    const { page, problems } = await open(server.browser, pilot('?mode=video&t=47.2'));
    await page.waitForFunction(() => { const P = (window as any).__player; return P.drawn === P.t; });
    const { first, second } = await heldTwice(page);
    expect(second).toBe(first);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('the next step carries on from the held clock: ambient does not jump when it starts', async () => {
    const { page } = await open(server.browser, pilot(`#slide-${OBSERVE}`));
    await settled(page);
    await page.waitForTimeout(700);
    const before = await page.evaluate(() => (window as any).__player.drawnAmbient as number);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => (window as any).__player.deck.target !== null);
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => { const P = (window as any).__player; return { ambient: P.drawnAmbient as number, t: P.t as number, stop: P.deck.stops[P.deck.slide] as number }; });
    expect(after.ambient).toBeGreaterThanOrEqual(before);
    expect(after.ambient - before).toBeLessThan(0.6);
    expect(after.ambient).toBeGreaterThan(after.t + 0.5); // it carries the time held (>0.7 s), not the video time
    await page.close();
  }, 60_000);

  test('a still is not touched by ambient: the same time gives the same pixels, and only an explicit ambient clock changes them', async () => {
    const page = await server.browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await page.goto(`${dev.url}?edit=${DECK}&export=1`);
    await page.waitForFunction(() => (window as any).__video?.ready || (window as any).__video?.error, null, { timeout: 120_000 });
    const hashes = await page.evaluate(async () => {
      const V = (window as any).__video;
      const hash = async () => {
        const bytes = Uint8Array.from(atob(await V.png()), (c) => c.charCodeAt(0));
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
      };
      const t = V.stops[6].t as number;
      await V.still(t);
      const one = await hash();
      await V.engine.prepare(t, 1, 0.5, 60, t + 3);
      V.engine.render(t, 1, 0.5, 60, t + 3);
      const shifted = await hash();
      await V.still(t);
      const two = await hash();
      return { one, shifted, two };
    });
    expect(hashes.two).toBe(hashes.one);
    expect(hashes.shifted).not.toBe(hashes.one);
    expect(problems).toEqual([]);
    await page.close();
  }, 180_000);
});

/** The player's (or the presenter's) handle, read in the page. */
const ev = <T>(page: Page, fn: (P: any) => T) => page.evaluate(`(${fn.toString()})(window.__player)`) as Promise<T>;

/** Where the step's bar is on screen, with a y inside it. */
const barBox = (page: Page, selector: string) => page.evaluate((selector) => {
  const r = (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
  return { left: r.left, width: r.width, y: r.top + 3 };
}, selector);

/** Drag the bar from `from` to each of `through` (fractions of its width, or beyond it), then release. */
async function drag(page: Page, selector: string, from: number, ...through: number[]) {
  const box = await barBox(page, selector);
  const x = (f: number) => box.left + f * box.width;
  await page.mouse.move(x(from), box.y);
  await page.mouse.down();
  for (const f of through) await page.mouse.move(x(f), box.y, { steps: 3 });
  await page.mouse.up();
}

/** The step the bar stands for, from the page: where it starts and ends, s. */
const stepOf = (page: Page) => ev(page, (P) => {
  const index = P.deck.target ?? P.deck.slide;
  return { from: index < 1 ? P.deck.start : P.deck.stops[index - 1], to: P.deck.stops[index], index };
});

describe('Space pauses and resumes, the step and the ambient motion together', () => {
  const VIEWS = [['the player', '', '.progress'], ['the presenter', '#presenter', '.p-now .progress']] as const;

  for (const [name, hash, barSelector] of VIEWS) {
    test(`${name}: a playing step stops where it is, shows paused, and plays on from there`, async () => {
      const { page, problems } = await open(server.browser, pilot(hash));
      if (hash) await presenterSettled(page);
      else await settled(page);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(500);
      await page.keyboard.press('Space');
      const at = await ev(page, (P) => ({ t: P.t as number, paused: P.ambient.paused as boolean }));
      expect(at.paused).toBe(true);
      expect((await bar(page, barSelector)).state).toBe('paused');
      const still = await pixels(page);
      await page.waitForTimeout(600);
      expect(await ev(page, (P) => P.t), 'the step stands still').toBe(at.t);
      expect(await pixels(page), 'and so does its ambient motion').toBe(still);
      if (hash) expect(await page.textContent('.p-state')).toBe('Now · paused');
      await page.keyboard.press('Space');
      await page.waitForFunction((t) => (window as any).__player.t > t + 0.2, at.t);
      expect((await bar(page, barSelector)).state).toBe('playing');
      expect(problems).toEqual([]);
      await page.close();
    }, 60_000);

    test(`${name}: a held slide's ambient motion stops while paused and goes on after`, async () => {
      const { page, problems } = await open(server.browser, pilot(hash ? `#presenter-${OBSERVE}` : `#slide-${OBSERVE}`));
      if (hash) await presenterSettled(page);
      else await settled(page);
      const moving = await heldTwice(page);
      expect(moving.second).not.toBe(moving.first);
      await page.keyboard.press('Space');
      expect(await ev(page, (P) => P.ambient.paused)).toBe(true);
      expect((await bar(page, barSelector)).state, 'a held slide that is frozen is still done').toBe('done');
      const frozen = await heldTwice(page);
      expect(frozen.second).toBe(frozen.first);
      await page.keyboard.press('Space');
      const again = await heldTwice(page);
      expect(again.second).not.toBe(again.first);
      expect(problems).toEqual([]);
      await page.close();
    }, 60_000);
  }

  test('stepping while paused plays the new step; k pauses too', async () => {
    const { page } = await open(server.browser, pilot(`#slide-${OBSERVE}`));
    await settled(page);
    await page.keyboard.press('k');
    expect(await ev(page, (P) => P.ambient.paused)).toBe(true);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    expect(await ev(page, (P) => [P.ambient.paused, P.playing, P.deck.target])).toEqual([false, true, OBSERVE]);
    await page.close();
  }, 60_000);

  test('the player\'s video mode is untouched: Space plays and pauses the video', async () => {
    const { page } = await open(server.browser, `${server.url}?mode=video&t=30`);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => (window as any).__player.playing);
    await page.keyboard.press('Space');
    expect(await ev(page, (P) => P.playing)).toBe(false);
    await page.close();
  }, 60_000);
});

describe('scrubbing the progress bar', () => {
  for (const [name, hash, selector] of [['the player', '', '.progress'], ['the presenter', '#presenter', '.p-now .progress']] as const) {
    test(`${name}: dragging moves the step, which stays paused if paused, plays on if playing, arrives at the end and replays from an arrived slide`, async () => {
      const { page, problems } = await open(server.browser, pilot(hash));
      const arrived = () => (hash ? presenterSettled(page) : settled(page));
      await arrived();
      await drag(page, selector, 0.2, 0.9); // before the first slide there is no step to scrub
      expect(await ev(page, (P) => [P.deck.slide, P.deck.target])).toEqual([-1, null]);

      await page.keyboard.press('ArrowRight'); // the first step
      await page.waitForTimeout(300);
      await page.keyboard.press('Space');
      const step = await stepOf(page);
      const before = await pixels(page);
      await drag(page, selector, 0.1, 0.5);
      const mid = await ev(page, (P) => P.t as number);
      expect(mid).toBeCloseTo(step.from + (step.to - step.from) * 0.5, 1);
      expect((await bar(page, selector)).fraction).toBeCloseTo(0.5, 1);
      expect(await pixels(page), 'the picture follows').not.toBe(before);
      await page.waitForTimeout(500);
      expect(await ev(page, (P) => [P.t, P.ambient.paused]), 'paused before, paused after').toEqual([mid, true]);
      expect((await bar(page, selector)).state).toBe('paused');

      await page.keyboard.press('Space'); // playing again: release carries on
      await drag(page, selector, 0.5, 0.2);
      const low = await ev(page, (P) => P.t as number);
      expect(low).toBeCloseTo(step.from + (step.to - step.from) * 0.2, 1);
      await page.waitForFunction((t) => (window as any).__player.t > t + 0.3, low);
      expect(await ev(page, (P) => [P.playing, P.deck.target])).toEqual([true, 0]);

      await drag(page, selector, 0.3, 1.4); // past the end: arrives
      expect(await ev(page, (P) => [P.deck.slide, P.deck.target, P.t === P.deck.stops[0], P.playing])).toEqual([0, null, true, false]);
      expect(await bar(page, selector)).toMatchObject({ state: 'done', fraction: 1 });

      await drag(page, selector, 0.97, 0.3); // an arrived slide stands for the step that led to it: replay it from there
      expect(await ev(page, (P) => [P.deck.slide, P.deck.target])).toEqual([-1, 0]);
      await arrived();
      expect(await ev(page, (P) => [P.deck.slide, P.deck.target, P.t === P.deck.stops[0]])).toEqual([0, null, true]);
      expect(problems).toEqual([]);
      await page.close();
    }, 120_000);
  }

  test('a focused bar is a slider: ← / → move it within the step; unfocused, the arrows still change slide', async () => {
    const { page, problems } = await open(server.browser, pilot());
    await settled(page);
    expect(await page.getAttribute('.progress', 'role')).toBe('slider');
    expect(await page.getAttribute('.progress', 'aria-label')).toBe('Step progress');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.press('Space');
    await page.focus('.progress');
    const step = await stepOf(page);
    const t0 = await ev(page, (P) => P.t as number);
    await page.keyboard.press('ArrowRight');
    const t1 = await ev(page, (P) => P.t as number);
    expect(t1 - t0).toBeCloseTo((step.to - step.from) * 0.05, 1);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(await ev(page, (P) => P.t as number)).toBeCloseTo(t0 - (step.to - step.from) * 0.05, 1);
    expect(await ev(page, (P) => [P.deck.slide, P.deck.target])).toEqual([-1, 0]);
    expect(await page.getAttribute('.progress', 'aria-valuetext')).toBe('Paused');
    expect(+(await page.getAttribute('.progress', 'aria-valuenow'))!).toBeGreaterThanOrEqual(0);
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await page.keyboard.press('ArrowRight'); // no longer on the bar: slide navigation again (finishes the step)
    await settled(page);
    expect(await ev(page, (P) => P.deck.slide)).toBe(0);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);
});

describe('the corner controls', () => {
  for (const [name, hash, scope] of [['the player', '', '.frame'], ['the presenter', '#presenter', '.p-now']] as const) {
    test(`${name}: back, play/pause and next work, the middle one shows the right icon, and they are faint until hovered and clear of the bar`, async () => {
      const { page, problems } = await open(server.browser, pilot(hash));
      const arrived = () => (hash ? presenterSettled(page) : settled(page));
      await arrived();
      const pick = (c: string) => `${scope} .corner ${c}`;
      const slide = () => ev(page, (P) => [P.deck.slide, P.deck.target]);
      expect(await page.getAttribute(pick('.c-back'), 'aria-label')).toBe('Previous slide');
      expect(await page.getAttribute(pick('.c-next'), 'aria-label')).toBe('Next slide');
      expect(await page.getAttribute(pick('.c-pause'), 'aria-label')).toBe('Pause');
      expect(await page.isDisabled(pick('.c-back'))).toBe(true);

      const opacity = () => page.evaluate((s) => +getComputedStyle(document.querySelector(s) as HTMLElement).opacity, `${scope} .corner`);
      await page.mouse.move(640, 500);
      expect(await opacity()).toBeLessThan(0.5);
      const iconPause = await page.innerHTML(pick('.c-pause'));
      const box = await page.evaluate((s) => {
        const c = (document.querySelector(`${s} .corner`) as HTMLElement).getBoundingClientRect();
        const b = (document.querySelector(`${s} .progress`) as HTMLElement).getBoundingClientRect();
        return { cornerTop: c.top, barBottom: b.bottom };
      }, scope);
      expect(box.cornerTop).toBeGreaterThanOrEqual(box.barBottom);

      await page.mouse.move(640, 300);
      await page.hover(pick('.c-next'));
      await page.waitForTimeout(300);
      expect(await opacity()).toBe(1);
      await press(page, pick('.c-next'));
      await page.waitForTimeout(300);
      expect(await slide()).toEqual([-1, 0]);
      await arrived();
      expect(await slide()).toEqual([0, null]);
      await press(page, pick('.c-next'));
      await page.waitForTimeout(300);
      await press(page, pick('.c-pause'));
      expect(await page.getAttribute(pick('.c-pause'), 'aria-label')).toBe('Play');
      expect(await page.innerHTML(pick('.c-pause'))).not.toBe(iconPause);
      const t = await ev(page, (P) => P.t as number);
      await page.waitForTimeout(500);
      expect(await ev(page, (P) => P.t)).toBe(t);
      await press(page, pick('.c-pause'));
      expect(await page.getAttribute(pick('.c-pause'), 'aria-label')).toBe('Pause');
      await page.waitForFunction((t) => (window as any).__player.t > t, t);
      await press(page, pick('.c-back')); // undoes the step playing
      await arrived();
      expect(await slide()).toEqual([0, null]);
      await press(page, pick('.c-back'));
      await arrived();
      expect(await slide()).toEqual([-1, null]);
      expect(problems).toEqual([]);
      await page.close();
    }, 120_000);
  }

  test('in the player they go idle with the rest of the controls, and are not there in video mode', async () => {
    const { page } = await open(server.browser, pilot());
    await settled(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.player')!.classList.contains('idle'), null, { timeout: 10_000 });
    await page.waitForFunction(() => +getComputedStyle(document.querySelector('.corner')!).opacity === 0);
    await page.keyboard.press('v');
    expect(await page.isVisible('.corner')).toBe(false);
    await page.close();
  }, 60_000);

  test('on a phone (touch) the buttons are hit within 44px, and nothing overflows at 390x844, in the player and the presenter', async () => {
    for (const hash of ['#slide-3', '#presenter-3']) {
      const context = await server.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      const problems: string[] = [];
      page.on('pageerror', (e) => problems.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
      await page.goto(pilot(hash));
      await page.waitForFunction(() => (window as any).__player);
      if (hash.includes('presenter')) await presenterSettled(page); else await settled(page);
      const info = await page.evaluate(() => {
        const button = document.querySelector('.corner .c-next') as HTMLElement;
        const r = button.getBoundingClientRect();
        const hit = (x: number, y: number) => document.elementFromPoint(x, y)?.closest('button') === button;
        const cy = r.top + r.height / 2, cx = r.left + r.width / 2;
        return {
          coarse: matchMedia('(pointer: coarse)').matches,
          reach: [hit(r.right + 5, cy), hit(r.left + r.width / 2, r.bottom + 5), hit(cx, r.top - 5)],
          scroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), inner: window.innerWidth,
        };
      });
      expect(info.coarse, hash).toBe(true);
      expect(info.reach, hash).toEqual([true, true, true]);
      expect(info.scroll, hash).toBeLessThanOrEqual(info.inner);
      expect(problems).toEqual([]);
      await context.close();
    }
  }, 120_000);
});

describe('pause, scrubbing and the corner controls in the single file and as an artifact', () => {
  test('from file:// and sandboxed under the artifact\'s rules', async () => {
    const host = serveAsArtifact(file);
    for (const base of [pilot(), host.url]) {
      const { page, problems } = await open(server.browser, base);
      await settled(page);
      await press(page, '.corner .c-next');
      await page.waitForTimeout(400);
      await press(page, '.corner .c-pause');
      const t = await ev(page, (P) => P.t as number);
      await page.waitForTimeout(400);
      expect(await ev(page, (P) => P.t)).toBe(t);
      await drag(page, '.progress', 0.1, 0.6);
      expect(await ev(page, (P) => P.t as number)).toBeGreaterThan(t);
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowRight');
      await settled(page);
      expect(await ev(page, (P) => P.deck.slide)).toBe(0);
      expect(problems).toEqual([]);
      await page.close();
    }
    host.stop();
  }, 120_000);
});

describe('screenshots of the new interface', () => {
  test('the player and the presenter, mid-step and arrived', async () => {
    mkdirSync(SHOTS, { recursive: true });
    const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `deck-ui-${name}.png`) });
    const midway = (page: Page, selector: string) => page.waitForFunction((selector) => { const el = document.querySelector(selector) as HTMLElement; return el.dataset.state === 'playing' && +el.dataset.fraction! > 0.45; }, selector, { timeout: 30_000 });

    const player = await open(server.browser, pilot('#slide-1'));
    await settled(player.page);
    const corner = (name: string) => player.page.screenshot({ path: path.join(SHOTS, `deck-ui-bar-${name}.png`), clip: { x: 0, y: 0, width: 520, height: 110 } });
    await player.page.mouse.move(640, 500);
    await corner('done-slide-1');
    await player.page.keyboard.press('ArrowRight'); // slide 1 to 2: ten seconds of the product
    await midway(player.page, '.progress');
    await corner('playing');
    await player.page.mouse.move(640, 300);
    await shot(player.page, 'player-mid');
    await player.page.keyboard.press('Space');
    await player.page.mouse.move(640, 500);
    await corner('paused');
    await player.page.hover('.corner .c-pause');
    await player.page.waitForTimeout(300);
    await corner('paused-hover');
    await player.page.mouse.move(640, 500);
    await player.page.keyboard.press('Space');
    await settled(player.page);
    await player.page.mouse.move(600, 340);
    await shot(player.page, 'player-arrived');
    await corner('done');
    expect(player.problems).toEqual([]);
    await player.page.close();

    for (const [name, size] of [['laptop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
      const { page, problems } = await open(server.browser, pilot('#presenter-1'));
      await page.setViewportSize(size);
      await presenterSettled(page);
      await page.keyboard.press('ArrowRight');
      await midway(page, '.p-now .progress');
      await shot(page, `presenter-${name}-mid`);
      expect((await bar(page, '.p-now .progress')).fraction, `${name} mid-step`).toBeGreaterThan(0.4);
      expect(await page.textContent('.p-state')).toBe('Now · playing');
      await presenterSettled(page);
      await shot(page, `presenter-${name}-arrived`);
      expect(problems).toEqual([]);
      await page.close();
    }
  }, 180_000);
});
