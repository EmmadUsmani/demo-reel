// The browser tests' harness: build an edit's player (scripts/build.ts), serve the folder, and open it
// in headless Chrome. These need what a render needs: the edit's footage captured and its soundtrack
// mixed (bun scripts/audio.ts --edit <name>), both gitignored, so they run locally, not in CI.
import { chromium, type Browser, type Page } from 'playwright-core';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { freePort, startVite } from '../scripts/lib';

export const ROOT = path.resolve(import.meta.dir, '..');
export const EDIT = process.env.E2E_EDIT ?? 'news-digest';
export const OUT = path.join(ROOT, 'out', `e2e-web-${EDIT}`);

/** One build, server and browser for every suite in the run (e2e/all.e2e.ts stops them at the end). */
let served: Promise<{ url: string; browser: Browser; stop: () => Promise<void> }> | undefined;
export function serve() { return (served ??= start()); }
let developed: Promise<{ url: string; stop: () => void }> | undefined;
/** A Vite dev server of the app (the preview page and ?export=1 are only there, not in a built player), on a port of its own. */
export function serveDev() { return (developed ??= startDev()); }
export async function stopServing() {
  await (await served)?.stop();
  (await developed)?.stop();
}

async function startDev(): Promise<{ url: string; stop: () => void }> {
  const port = freePort();
  const stop = startVite(['--port', String(port), '--strictPort'], { DEMO_REEL_NO_HMR: '1' });
  const url = `http://localhost:${port}/`;
  for (let i = 0; i < 200; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    await Bun.sleep(100);
  }
  return { url, stop };
}

async function start(): Promise<{ url: string; browser: Browser; stop: () => Promise<void> }> {
  for (const need of [`projects/${EDIT}/footage/manifest.json`, `out/audio-${EDIT}/mix.wav`, `out/audio-${EDIT}/effects.wav`, `out/audio-${EDIT}/captions.json`]) {
    if (!existsSync(path.join(ROOT, need))) throw new Error(`${need} is missing: capture the footage and run bun scripts/audio.ts --edit ${EDIT} first`);
  }
  const build = Bun.spawnSync(['bun', 'scripts/build.ts', '--edit', EDIT, '--out', OUT], { cwd: ROOT, stderr: 'pipe' });
  if (build.exitCode !== 0) throw new Error(`build failed:\n${build.stderr}`);
  const port = freePort();
  const stopServer = startVite(['preview', '--outDir', OUT, '--port', String(port), '--strictPort']);
  const url = `http://localhost:${port}/`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    await Bun.sleep(100);
  }
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  return { url, browser, stop: async () => { await browser.close(); stopServer(); } };
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

/** Poll in the page until `check` holds (no fixed sleeps): the player's handle is passed in. */
export const until = (page: Page, check: (P: any) => boolean, timeout = 10_000) =>
  page.waitForFunction(`(${check.toString()})(window.__player)`, null, { timeout });

/** The player's own methods, driven through its handle. */
export const seek = (page: Page, t: number) => page.evaluate((t) => (window as any).__player.seek(t), t);

/** Wait until the player has drawn the frame for time `t`. */
export const drawn = (page: Page, t: number) => page.waitForFunction((t) => (window as any).__player.drawn === t && (window as any).__player.t === t, t, { timeout: 10_000 });

/** The written captions (captions.json, from audio.ts) the player shows. */
export const readCaptions = async (): Promise<{ at: number; end: number; text: string }[]> => Bun.file(path.join(ROOT, `out/audio-${EDIT}/captions.json`)).json();

/** The single-file player (scripts/build.ts --single), built once per run beside the folder build. */
export const SINGLE_OUT = path.join(ROOT, 'out', `e2e-single-${EDIT}.html`);
let singled: string | undefined;
export function buildSingle() {
  if (singled) return singled;
  const build = Bun.spawnSync(['bun', 'scripts/build.ts', '--edit', EDIT, '--single', '--out', SINGLE_OUT], { cwd: ROOT, stderr: 'pipe' });
  if (build.exitCode !== 0) throw new Error(`single build failed:\n${build.stderr}`);
  return (singled = SINGLE_OUT);
}

/** The presenter's view (?view=presenter), read through its test handle. */
export const presenterState = (page: Page) => page.evaluate(() => {
  const P = (window as any).__player;
  const q = (selector: string) => document.querySelector(selector) as HTMLElement;
  return {
    slide: P.deck.slide as number, target: P.deck.target as number | null, stops: P.deck.stops as number[], t: P.t as number, playing: P.playing as boolean,
    count: q('.p-count').textContent!, notes: q('.p-notes').textContent!, paragraphs: [...document.querySelectorAll('.p-notes p')].map((p) => p.textContent!),
    elapsed: q('.p-elapsed').textContent!, pause: q('.p-pause').textContent!, stopwatch: P.stopwatch.state as string,
    stillShown: !q('.p-still').hidden, endShown: !q('.p-end').hidden, prevDisabled: (q('.p-prev') as HTMLButtonElement).disabled, nextDisabled: (q('.p-fwd') as HTMLButtonElement).disabled,
  };
});

/** Wait until the presenter has arrived on a slide (no step playing) and drawn it and the still of the one after. */
export const presenterSettled = (page: Page) => page.waitForFunction(() => {
  const P = (window as any).__player;
  return P.deck.target === null && !P.playing && P.drawn === P.t && P.stillOf === P.deck.upNext();
}, null, { timeout: 30_000 });

/** A single-file player of any edit (scripts/build.ts --single), built once per edit per run. */
const singles = new Map<string, string>();
export function buildSingleOf(edit: string) {
  if (!singles.has(edit)) {
    const out = path.join(ROOT, 'out', `e2e-single-${edit}.html`);
    const build = Bun.spawnSync(['bun', 'scripts/build.ts', '--edit', edit, '--single', '--out', out], { cwd: ROOT, stderr: 'pipe' });
    if (build.exitCode !== 0) throw new Error(`single build of ${edit} failed:\n${build.stderr}`);
    singles.set(edit, out);
  }
  return singles.get(edit)!;
}

/**
 * A Claude artifact's rules at their strictest: a sandboxed frame (an opaque origin), scripts and styles inline,
 * images, media and fonts only from data and blob, and no connections at all.
 */
export const ARTIFACT_CSP = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'";

/** Serve one HTML file under ARTIFACT_CSP, as a response header the way a host sends it (a meta tag can't sandbox). */
export function serveAsArtifact(file: string): { url: string; stop: () => void } {
  const server = Bun.serve({ port: 0, fetch: () => new Response(Bun.file(file), { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': ARTIFACT_CSP } }) });
  return { url: `http://localhost:${server.port}/`, stop: () => server.stop(true) };
}
