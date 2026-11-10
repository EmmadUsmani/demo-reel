// An edit that is a deck (Edit.deck) and speaker notes, end to end in headless Chrome: bun run test:e2e.
// The project edits have no deck, so the dev server's page boots again with news-digest turned into one
// (the entry module run a second time over its EDITS), and a scene's notes() is replaced on a fresh engine.
import { beforeAll, describe, expect, test } from 'bun:test';
import type { Page } from 'playwright-core';
import { EDIT, open, presenterSettled, presenterState, serve, serveDev } from './harness';

let server: Awaited<ReturnType<typeof serve>>;
let dev: Awaited<ReturnType<typeof serveDev>>;
beforeAll(async () => { server = await serve(); dev = await serveDev(); }, 240_000);

let boots = 0;
/** The dev server's page, started as a presenter (it asks for no sound), then booted again as `deck` says at `search`. */
async function boot(search: string, deck: boolean) {
  const page = await (await server.browser.newContext()).newPage();
  const problems: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => { if (r.failure()?.errorText !== 'net::ERR_ABORTED') problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`response ${r.status()}: ${r.url()}`); });
  await page.goto(`${dev.url}player.html?edit=${EDIT}&view=presenter`);
  await page.waitForFunction(() => (window as any).__player, null, { timeout: 60_000 });
  const mark = requests.length;
  page.on('request', (r) => requests.push(r.url()));
  await page.evaluate(async ({ search, deck, edit, n }) => {
    const { EDITS } = await import('/src/timeline.ts' as string);
    EDITS[edit].deck = deck;
    delete (window as any).__player;
    history.replaceState(null, '', `${location.pathname}${search}`);
    await import(`/src/player/entry.ts?boot=${n}` as string);
  }, { search, deck, edit: EDIT, n: ++boots });
  await page.waitForFunction(() => (window as any).__player, null, { timeout: 60_000 });
  return { page, problems, soundtrack: () => requests.slice(mark).filter((url) => /\/audio\//.test(url)) };
}

const settled = (page: Page) => page.waitForFunction(() => { const P = (window as any).__player; return P.deck.target === null && !P.playing && P.drawn === P.t; }, null, { timeout: 30_000 });

describe('an edit that is a deck', () => {
  test('opens in slides mode with the narration off, asks for no soundtrack, and steps silently on the wall clock', async () => {
    const { page, problems, soundtrack } = await boot(`?edit=${EDIT}`, true);
    const info = () => page.evaluate(() => {
      const P = (window as any).__player;
      return { mode: P.mode as string, narration: P.narration as boolean, tracks: Object.keys(P.tracks), slide: P.deck.slide as number, t: P.t as number, playing: P.playing as boolean, silent: P.silent as boolean, slidesClass: P.root.classList.contains('slides') };
    });
    expect(await info()).toMatchObject({ mode: 'slides', narration: false, tracks: [], slide: -1, slidesClass: true });
    expect(await page.isHidden('.voice')).toBe(true);
    expect(await page.isHidden('.mute')).toBe(true);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const playing = await info();
    expect(playing.playing).toBe(true);
    expect(playing.t).toBeGreaterThan(0);
    await settled(page);
    const arrived = await info();
    expect(arrived.slide).toBe(0);
    await page.waitForTimeout(500);
    expect(soundtrack()).toEqual([]);
    expect(problems).toEqual([]);
    await page.close();
  }, 120_000);

  test('the URL wins over the edit: ?mode=video opens the video (still with no soundtrack), ?narration=1 turns the narration on', async () => {
    const video = await boot(`?edit=${EDIT}&mode=video`, true);
    expect(await video.page.evaluate(() => (window as any).__player.mode)).toBe('video');
    expect(await video.page.isVisible('.track')).toBe(true);
    expect(video.soundtrack()).toEqual([]);
    expect(video.problems).toEqual([]);
    await video.page.close();
    const loud = await boot(`?edit=${EDIT}&narration=1`, true);
    expect(await loud.page.evaluate(() => { const P = (window as any).__player; return [P.mode, P.narration]; })).toEqual(['slides', true]);
    await loud.page.close();
  }, 120_000);

  test('a video edit is unchanged: video mode, narration on, and its soundtrack is asked for', async () => {
    const { page, soundtrack } = await boot(`?edit=${EDIT}`, false);
    expect(await page.evaluate(() => { const P = (window as any).__player; return [P.mode, P.narration]; })).toEqual(['video', true]);
    await page.waitForFunction(() => Object.keys((window as any).__player.tracks).length === 2);
    expect(soundtrack().length).toBeGreaterThan(0);
    await page.close();
  }, 120_000);

  test('the Slides toggle still works on a deck, and the presenter view of it asks for no captions file either', async () => {
    const { page, soundtrack } = await boot(`?edit=${EDIT}`, true);
    await page.keyboard.press('v');
    expect(await page.evaluate(() => (window as any).__player.mode)).toBe('video');
    await page.keyboard.press('v');
    expect(await page.evaluate(() => (window as any).__player.mode)).toBe('slides');
    expect(soundtrack()).toEqual([]);
    await page.close();
    const presenter = await boot(`?edit=${EDIT}&view=presenter`, true);
    await presenterSettled(presenter.page);
    expect(presenter.soundtrack()).toEqual([]);
    expect(presenter.problems).toEqual([]);
    await presenter.page.close();
  }, 120_000);
});

describe('speaker notes', () => {
  test("without authored notes a slide's notes are the narration said on the way to it: the player and the presenter agree", async () => {
    const player = await open(server.browser, `${server.url}?mode=slides`);
    const presenter = await open(server.browser, `${server.url}?view=presenter`);
    await player.page.keyboard.press('s');
    for (const k of [1, 2, 3, 7]) {
      await player.page.evaluate((k) => (window as any).__player.go(k - 1), k);
      await presenter.page.evaluate((k) => (window as any).__player.go(k - 1), k);
      const shown = await presenter.page.evaluate(() => [...document.querySelectorAll('.p-notes p')].map((p) => p.textContent));
      const inPlayer = await player.page.evaluate(() => [...document.querySelectorAll('.notes p:not(.hint)')].map((p) => p.textContent));
      expect(shown.length).toBeGreaterThan(0);
      expect(shown, `slide ${k}`).toEqual(inPlayer);
    }
    expect(player.problems).toEqual([]);
    expect(presenter.problems).toEqual([]);
    await player.page.close();
    await presenter.page.close();
  }, 120_000);

  test('authored notes replace the narration on the slides they fall on, per slide, in the player and the presenter', async () => {
    const { page } = await open(server.browser, `${server.url}?view=presenter`);
    const page2 = await (await server.browser.newContext()).newPage();
    const problems: string[] = [];
    page2.on('pageerror', (e) => problems.push(e.message));
    page2.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
    await page2.goto(`${dev.url}player.html?edit=${EDIT}&view=presenter`);
    await page2.waitForFunction(() => (window as any).__player, null, { timeout: 60_000 });
    const result = await page2.evaluate(async (edit) => {
      const { EDITS } = await import('/src/timeline.ts' as string);
      const { Engine } = await import('/src/engine/engine.ts' as string);
      const { Presenter } = await import('/src/player/presenter.ts' as string);
      const { Player } = await import('/src/player/player.ts' as string);
      const make = async () => {
        const canvas = document.createElement('canvas');
        const engine = new Engine(canvas, EDITS[edit].timeline);
        await engine.init();
        // a note 1 s into the first scene, and one 1 s into the third
        engine.scenes.get(engine.timeline[0].id).notes = () => [{ at: 1, text: 'Authored: welcome' }];
        engine.scenes.get(engine.timeline[2].id).notes = () => [{ at: 1, text: 'Authored: third scene' }];
        const root = document.createElement('div');
        root.className = 'player';
        document.body.append(root);
        return { canvas, engine, root };
      };
      const a = await make();
      const presenter = new Presenter(a.root, a.canvas, a.engine, { name: edit, title: 'x', sound: false });
      const b = await make();
      const player = new Player(b.root, b.canvas, b.engine, { name: edit, title: 'x', mode: 'slides', captions: false, narration: false, sound: false });
      const third = a.engine.timeline[2];
      const stops: number[] = presenter.deck.stops;
      const slideOfThird = stops.findIndex((t) => t > third.start + 1 - 1e-6);
      const inPresenter = (k: number) => { presenter.go(k); return [...a.root.querySelectorAll('.p-notes p')].map((p) => p.textContent); };
      const inPlayer = (k: number) => { player.go(k); return [...b.root.querySelectorAll('.notes p:not(.hint)')].map((p) => p.textContent); };
      const narration = a.engine.narration().map((l: any) => l.caption ?? l.text);
      const at = (k: number) => ({ presenter: inPresenter(k), player: inPlayer(k) });
      return { exported: a.engine.notes(), firstSlide: at(0), thirdSlide: at(slideOfThird), otherSlide: at(1), narration, thirdStart: third.start };
    }, EDIT);
    expect(result.exported).toEqual([
      { at: expect.any(Number), text: 'Authored: welcome', scene: expect.any(String) },
      { at: expect.any(Number), text: 'Authored: third scene', scene: expect.any(String) },
    ]);
    expect(result.exported[1]!.at).toBeCloseTo(result.thirdStart + 1, 6);
    expect(result.firstSlide).toEqual({ presenter: ['Authored: welcome'], player: ['Authored: welcome'] });
    expect(result.thirdSlide).toEqual({ presenter: ['Authored: third scene'], player: ['Authored: third scene'] });
    // a slide with none authored keeps its narration
    expect(result.otherSlide.presenter.length).toBeGreaterThan(0);
    expect(result.otherSlide.presenter).toEqual(result.otherSlide.player);
    expect(result.otherSlide.presenter.every((line: string) => result.narration.includes(line))).toBe(true);
    expect(problems).toEqual([]);
    await page.close();
    await page2.close();
  }, 120_000);

  test('the export API lists the authored notes next to the narration (none for news-digest)', async () => {
    const page = await (await server.browser.newContext()).newPage();
    await page.goto(`${dev.url}?edit=${EDIT}&export=1`);
    await page.waitForFunction(() => (window as any).__video?.ready, null, { timeout: 60_000 });
    const v = await page.evaluate(() => { const V = (window as any).__video; return { notes: V.notes, narration: V.narration.length }; });
    expect(v.notes).toEqual([]);
    expect(v.narration).toBeGreaterThan(20);
    await page.close();
  }, 120_000);
});
