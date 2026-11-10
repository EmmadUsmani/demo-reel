// The pilot deck (news-digest-deck) as one file, end to end in headless Chrome: opened from file://, in
// slides mode and in the presenter's view, with the notes its scenes author. bun run test:e2e.
import { beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { ARTIFACT_LIMIT } from '../scripts/single-lib';
import { buildSingleOf, open, presenterSettled, presenterState, ROOT, serve, serveAsArtifact } from './harness';

const DECK = 'news-digest-deck';
const SHOTS = path.join(ROOT, 'out', 'shots');

let server: Awaited<ReturnType<typeof serve>>;
let file: string;
beforeAll(async () => { server = await serve(); file = buildSingleOf(DECK); }, 240_000);

const url = (suffix = '') => `file://${file}${suffix}`;

/** The notes each slide should show, from the deck's own scenes (what projects/news-digest-deck/deck.test.ts checks), read in a child so the test page's globals stay real. */
function authoredNotes(): string[][] {
  const script = `
    import { installBrowser, project } from './projects/testing/browser';
    import { slideNotes } from '@engine/notes';
    installBrowser();
    const { engine } = await project('${DECK}');
    const stops = engine.stops().map((s) => s.t);
    const authored = engine.notes().map(({ at, text }) => ({ at, text }));
    console.log(JSON.stringify(stops.map((_, k) => slideNotes({ authored, spoken: [] }, stops, 0, k))));`;
  const run = Bun.spawnSync(['bun', '-e', script], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  if (run.exitCode !== 0) throw new Error(`could not read the deck's notes:\n${run.stderr}`);
  return JSON.parse(run.stdout.toString());
}

/** How many distinct colours a canvas holds, sampled on a grid (a blank frame holds one or two). */
const coloursOf = (page: Page, selector: string) => page.evaluate((selector) => {
  const canvas = document.querySelector(selector) as HTMLCanvasElement;
  const small = document.createElement('canvas');
  small.width = 48; small.height = 27;
  const g = small.getContext('2d')!;
  g.drawImage(canvas, 0, 0, 48, 27);
  const px = g.getImageData(0, 0, 48, 27).data;
  const colours = new Set<number>();
  for (let i = 0; i < px.length; i += 4) colours.add((px[i]! >> 3) | ((px[i + 1]! >> 3) << 5) | ((px[i + 2]! >> 3) << 10));
  return colours.size;
}, selector);

const arrived = (page: Page) => page.waitForFunction(() => { const P = (window as any).__player; return P.deck.target === null && !P.playing && P.drawn === P.t; }, null, { timeout: 30_000 });

describe('the pilot deck as a single file', () => {
  test('fits in a Claude artifact (at most 16 MiB a page)', () => {
    expect(statSync(file).size).toBeLessThan(ARTIFACT_LIMIT);
  });

  test('opens in slides mode on its own, with no soundtrack asked for and no problems', async () => {
    const { page, problems } = await open(server.browser, url());
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    const info = await page.evaluate(() => {
      const P = (window as any).__player;
      return { mode: P.mode as string, narration: P.narration as boolean, tracks: Object.keys(P.tracks), slide: P.deck.slide as number, slides: P.deck.count as number, slidesClass: P.root.classList.contains('slides') };
    });
    expect(info).toMatchObject({ mode: 'slides', narration: false, tracks: [], slide: -1, slides: authoredNotes().length, slidesClass: true });
    await page.keyboard.press('ArrowRight');
    await arrived(page);
    expect(requests.filter((r) => /audio|captions|\.mp3|\.wav/.test(r))).toEqual([]);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);

  test('steps through every slide to the end: k / N follows, and each slide draws a picture', async () => {
    const { page, problems } = await open(server.browser, url());
    const total = authoredNotes().length;
    expect(await page.textContent('.count')).toBe(`– / ${total}`);
    for (let k = 1; k <= total; k++) {
      await page.keyboard.press('ArrowRight');
      await arrived(page);
      expect(await page.textContent('.count'), `slide ${k}`).toBe(`${k} / ${total}`);
      expect(await coloursOf(page, 'canvas'), `slide ${k} is blank`).toBeGreaterThan(8);
    }
    expect(await page.evaluate(() => (window as any).__player.deck.slide)).toBe(total - 1);
    expect(await page.isDisabled('.fwd')).toBe(true);
    expect(problems).toEqual([]);
    await page.close();
  }, 240_000);
});

describe('the pilot deck in the presenter view (#presenter)', () => {
  test('shows each slide\'s authored notes and a next-slide still that is not blank', async () => {
    const expected = authoredNotes();
    const { page, problems } = await open(server.browser, url('#presenter'));
    await presenterSettled(page);
    expect((await presenterState(page)).slide).toBe(-1);
    for (let k = 0; k < expected.length; k++) {
      await page.keyboard.press('ArrowRight');
      await presenterSettled(page);
      const s = await presenterState(page);
      expect(s.slide).toBe(k);
      expect(s.count).toBe(`${k + 1} / ${expected.length}`);
      expect(s.paragraphs, `slide ${k + 1}`).toEqual(expected[k]!);
      if (k < expected.length - 1) {
        expect(s.stillShown, `slide ${k + 1}`).toBe(true);
        expect(await coloursOf(page, '.p-still'), `the next slide after ${k + 1} is blank`).toBeGreaterThan(8);
      } else {
        expect(s.endShown).toBe(true);
      }
    }
    expect(problems).toEqual([]);
    await page.close();
  }, 240_000);

  test('fits a 390x844 phone with no horizontal overflow, and screenshots at 1440x900 and on the phone', async () => {
    const { page, problems } = await open(server.browser, url('#presenter-3'));
    mkdirSync(SHOTS, { recursive: true });
    for (const [name, size] of [['laptop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
      await page.setViewportSize(size);
      await presenterSettled(page);
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth, inner: window.innerWidth }));
      expect(Math.max(overflow.scroll, overflow.body), name).toBeLessThanOrEqual(overflow.inner);
      expect((await presenterState(page)).slide, name).toBe(2);
      await page.screenshot({ path: path.join(SHOTS, `pilot-presenter-${name}.png`) });
    }
    expect(problems).toEqual([]);
    await page.close();
  }, 90_000);
});

describe('the pilot deck as a Claude artifact serves it (sandboxed, no connections)', () => {
  test('steps through every slide, and the presenter view shows every slide\'s notes, with no problems', async () => {
    const expected = authoredNotes();
    const host = serveAsArtifact(file);
    const deck = await open(server.browser, host.url);
    for (let k = 1; k <= expected.length; k++) {
      await deck.page.keyboard.press('ArrowRight');
      await arrived(deck.page);
      expect(await coloursOf(deck.page, 'canvas'), `slide ${k} is blank`).toBeGreaterThan(8);
    }
    expect(deck.problems).toEqual([]);
    await deck.page.close();

    const presenter = await open(server.browser, `${host.url}#presenter`);
    for (let k = 0; k < expected.length; k++) {
      await presenter.page.keyboard.press('ArrowRight');
      await presenterSettled(presenter.page);
      expect((await presenterState(presenter.page)).paragraphs, `slide ${k + 1}`).toEqual(expected[k]!);
    }
    expect(presenter.problems).toEqual([]);
    await presenter.page.close();
    host.stop();
  }, 240_000);
});
