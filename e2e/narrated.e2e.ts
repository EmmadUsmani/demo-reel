// A narrated deck (Edit.mode 'slides': qiyami-deck) as one file, the way a Claude artifact serves it: it opens in
// slides mode with its soundtrack, each step plays the recording and its narration to the next slide and stops
// there with the voice done, and the narration and the sound can be turned off. Needs qiyami's footage and
// bun scripts/audio.ts --edit qiyami-deck. bun run test:e2e.
import { beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { ARTIFACT_LIMIT } from '../scripts/single-lib';
import { buildSingleOf, open, ROOT, serve, serveAsArtifact, state } from './harness';

const DECK = 'qiyami-deck';
const SHOTS = path.join(ROOT, 'out', 'shots');

let server: Awaited<ReturnType<typeof serve>>;
let file: string;
let captions: { at: number; end: number; text: string }[];
beforeAll(async () => {
  server = await serve();
  file = buildSingleOf(DECK);
  captions = await Bun.file(path.join(ROOT, `out/audio-${DECK}/captions.json`)).json();
}, 240_000);

/** Wait until `check` holds of the player (a function, not a string: an artifact's rules forbid eval). */
const until = (page: Page, check: () => boolean) => page.waitForFunction(check, undefined, { timeout: 30_000 }) as unknown as Promise<void>;
const arrived = (page: Page) => page.waitForFunction(() => { const P = (window as any).__player; return P.deck.target === null && !P.playing && P.drawn === P.t; }, null, { timeout: 30_000 });
const deck = (page: Page) => page.evaluate(() => { const P = (window as any).__player; return { slide: P.deck.slide as number, count: P.deck.count as number, stops: P.deck.stops as number[], mode: P.mode as string, muted: P.muted as boolean }; });

/** How many distinct colours the player's canvas holds, sampled on a grid (a blank frame holds one or two). */
const colours = (page: Page) => page.evaluate(() => {
  const small = document.createElement('canvas');
  small.width = 48; small.height = 27;
  const g = small.getContext('2d')!;
  g.drawImage(document.querySelector('canvas')!, 0, 0, 48, 27);
  const px = g.getImageData(0, 0, 48, 27).data;
  const seen = new Set<number>();
  for (let i = 0; i < px.length; i += 4) seen.add((px[i]! >> 3) | ((px[i + 1]! >> 3) << 5) | ((px[i + 2]! >> 3) << 10));
  return seen.size;
});

describe('a narrated deck as a single file (qiyami-deck)', () => {
  test('fits in a Claude artifact (at most 16 MiB a page)', () => {
    expect(statSync(file).size).toBeLessThan(ARTIFACT_LIMIT);
  });

  test('under an artifact\'s rules: opens in slides with the narration on, and every step plays the voice in sync and lets it finish before the slide', async () => {
    const host = serveAsArtifact(file);
    const { page, problems } = await open(server.browser, host.url);
    const start = { ...(await state(page)), ...(await deck(page)) };
    expect(start).toMatchObject({ mode: 'slides', narration: true, heard: 'mix', slide: -1, count: 6, muted: false });
    mkdirSync(SHOTS, { recursive: true });

    for (let k = 0; k < start.count; k++) {
      await page.keyboard.press('ArrowRight');
      await until(page, () => { const P = (window as any).__player; return P.playing && P.t > (P.deck.slide < 0 ? P.from : P.deck.stops[P.deck.slide]) + 0.3; });
      const playing = await state(page);
      expect(playing.heard, `step ${k + 1}`).toBe('mix');
      expect(playing.audioPaused, `step ${k + 1}: the soundtrack plays`).toBe(false);
      expect(Math.abs(playing.audioTime! - playing.t), `step ${k + 1}: the soundtrack is in sync`).toBeLessThan(0.25);
      await arrived(page);
      const held = { ...(await state(page)), ...(await deck(page)) };
      expect(held.slide, `step ${k + 1}`).toBe(k);
      expect(held.audioPaused, `slide ${k + 1}: a held slide is silent`).toBe(true);
      // every line said on the way here has ended before the slide stops
      const before = held.stops[k - 1] ?? 0;
      for (const c of captions.filter((c) => c.at >= before && c.at < held.stops[k]!)) expect(c.end, `slide ${k + 1}: "${c.text}"`).toBeLessThan(held.stops[k]!);
      expect(await colours(page), `slide ${k + 1} is blank`).toBeGreaterThan(8);
      await page.screenshot({ path: path.join(SHOTS, `qiyami-slides-${k + 1}.png`) });
    }
    expect(await page.isDisabled('.fwd')).toBe(true);
    expect(problems).toEqual([]);
    await page.close();
    host.stop();
  }, 240_000);

  test('the narration turns off (n: the effects alone) and the sound mutes (m), mid-step, and both turn back on', async () => {
    const host = serveAsArtifact(file);
    const { page, problems } = await open(server.browser, host.url);
    await page.keyboard.press('ArrowRight');
    await arrived(page);
    await page.keyboard.press('ArrowRight'); // the countdown: its line plays on the way
    await until(page, () => { const P = (window as any).__player; return P.playing && P.t > P.deck.stops[0] + 0.5; });
    await page.keyboard.press('n');
    await until(page, () => !(window as any).__player.narration);
    expect(await state(page)).toMatchObject({ heard: 'effects', audioPaused: false, mixPaused: true });
    await page.keyboard.press('n');
    await until(page, () => (window as any).__player.narration);
    expect(await state(page)).toMatchObject({ heard: 'mix', audioPaused: false });
    await page.keyboard.press('m');
    await until(page, () => (window as any).__player.muted);
    expect(await page.evaluate(() => (window as any).__player.track().muted)).toBe(true);
    await page.keyboard.press('m');
    await until(page, () => !(window as any).__player.muted);
    expect(await page.evaluate(() => (window as any).__player.track().muted)).toBe(false);
    await arrived(page);
    expect((await deck(page)).slide).toBe(1);
    expect(problems).toEqual([]);
    await page.close();
    host.stop();
  }, 90_000);

  test('opens from file:// in slides mode with its soundtrack, with no problems', async () => {
    const { page, problems } = await open(server.browser, `file://${file}`);
    expect({ ...(await state(page)), ...(await deck(page)) }).toMatchObject({ mode: 'slides', narration: true, heard: 'mix' });
    await page.keyboard.press('ArrowRight');
    await arrived(page);
    expect((await deck(page)).slide).toBe(0);
    expect(problems).toEqual([]);
    await page.close();
  }, 60_000);
});
