// The browser tests' harness: build an edit's player (scripts/build.ts), serve the folder, and open it
// in headless Chrome. These need what a render needs: the edit's footage captured and its soundtrack
// mixed (bun scripts/audio.ts --edit <name>), both gitignored, so they run locally, not in CI.
import { chromium, type Browser, type Page } from 'playwright-core';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dir, '..');
export const EDIT = process.env.E2E_EDIT ?? 'news-digest';
export const OUT = path.join(ROOT, 'out', `e2e-web-${EDIT}`);

export async function serve(): Promise<{ url: string; browser: Browser; close: () => Promise<void> }> {
  for (const need of [`projects/${EDIT}/footage/manifest.json`, `out/audio-${EDIT}/mix.wav`, `out/audio-${EDIT}/effects.wav`, `out/audio-${EDIT}/captions.json`]) {
    if (!existsSync(path.join(ROOT, need))) throw new Error(`${need} is missing: capture the footage and run bun scripts/audio.ts --edit ${EDIT} first`);
  }
  const build = Bun.spawnSync(['bun', 'scripts/build.ts', '--edit', EDIT, '--out', OUT], { cwd: ROOT, stderr: 'pipe' });
  if (build.exitCode !== 0) throw new Error(`build failed:\n${build.stderr}`);
  const port = 5600 + Math.floor(Math.random() * 300);
  const server = Bun.spawn(['bunx', 'vite', 'preview', '--outDir', OUT, '--port', String(port), '--strictPort'], { cwd: ROOT, stdout: 'ignore', stderr: 'ignore' });
  const url = `http://localhost:${port}/`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    await Bun.sleep(100);
  }
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  return { url, browser, close: async () => { await browser.close(); server.kill(); } };
}

/** A page on the player, with every error, failed request and console error collected in `problems`. */
export async function open(browser: Browser, url: string): Promise<{ page: Page; problems: string[] }> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  // a media element cancels its own range requests when it seeks: that is not a failure
  page.on('requestfailed', (r) => { if (r.failure()?.errorText !== 'net::ERR_ABORTED') problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`); });
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__player, null, { timeout: 60_000 });
  return { page, problems };
}

/** The player's state, read through its test handle. */
export const state = (page: Page) => page.evaluate(() => {
  const P = (window as any).__player;
  const heard = P.track();
  return {
    t: P.t as number, from: P.from as number, to: P.to as number, playing: P.playing as boolean, narration: P.narration as boolean,
    heard: !heard ? null : heard === P.tracks.mix ? 'mix' : heard === P.tracks.effects ? 'effects' : '?',
    audioTime: heard?.currentTime as number | undefined, audioPaused: heard?.paused as boolean | undefined,
    mixPaused: P.tracks.mix?.paused as boolean | undefined,
    caption: (document.querySelector('.caption') as HTMLElement).hidden ? null : document.querySelector('.caption')!.textContent,
    bigHidden: (document.querySelector('.big') as HTMLElement).hidden,
    scenes: P.engine.timeline.map((e: any) => ({ id: e.id, start: e.start, end: e.end })) as { id: string; start: number; end: number }[],
  };
});

/** How many new frames the player draws in `ms`, per second. */
export const fps = (page: Page, ms = 1000) => page.evaluate(async (ms) => {
  const P = (window as any).__player;
  let n = 0, last = P.drawn;
  const start = performance.now();
  while (performance.now() - start < ms) {
    await new Promise((r) => requestAnimationFrame(r));
    if (P.drawn !== last) { n++; last = P.drawn; }
  }
  return (n * 1000) / ms;
}, ms);
