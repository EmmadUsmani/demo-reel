// Boots the video app in headless Chrome for the offline tools (render.ts, audio.ts).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
export const VITE = path.join(ROOT, 'node_modules/.bin/vite');

/**
 * Start a Vite server (args after `vite`); the function returned stops it. It runs in a process group
 * of its own, and stopping ends the whole group: `bunx` and node version-manager shims run the real
 * server as a child of the process we start, which outlived a plain kill (every render used to leave
 * a server running).
 */
export function startVite(args: string[], env: Record<string, string> = {}) {
  const proc = spawn(VITE, args, { cwd: ROOT, stdio: 'ignore', detached: true, env: { ...process.env, ...env } });
  return () => { try { process.kill(-proc.pid!, 'SIGTERM'); } catch { /* already gone */ } };
}

/** `--key value` and `--flag` lookups over an argument list (what the scripts' command lines are made of). */
export function parseArgs(argv: string[]) {
  const opt = (key: string, fallback?: string) => { const i = argv.indexOf(`--${key}`); return i >= 0 ? argv[i + 1] : fallback; };
  const flag = (key: string) => argv.includes(`--${key}`);
  return { opt, flag };
}

/** A port nothing is listening on: the system picks it, so two servers started at once can't collide. */
export function freePort() {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port!;
  probe.stop(true);
  return port;
}

export async function reachable(url: string) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}

/** The Vite server at `url` (default :5180), or a private one without live reload if that is down. */
export async function ensureServer(url = 'http://localhost:5180'): Promise<{ url: string; stop: () => void }> {
  if (await reachable(url)) return { url, stop: () => {} };
  const port = freePort();
  const stop = startVite(['--port', String(port), '--strictPort'], { DEMO_REEL_NO_HMR: '1' });
  const u = `http://localhost:${port}`;
  for (let i = 0; i < 150 && !(await reachable(u)); i++) await Bun.sleep(100);
  return { url: u, stop };
}

/** The address the offline tools open: the app in export mode, for one edit (and scene, and render scale). */
export function appUrl(base: string, { edit, only, scale = 1 }: { edit?: string; only?: string; scale?: number } = {}) {
  return `${base}/?export=1${edit ? `&edit=${edit}` : ''}${only ? `&only=${only}` : ''}${scale !== 1 ? `&scale=${scale}` : ''}`;
}

/** Chrome's flags: Metal on a Mac; a Linux sandbox has no GPU and draws through SwiftShader, which keeps up. */
export function chromeArgs(platform: string = process.platform) {
  return [...(platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] : []), '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
}

export async function openApp({ edit, only, scale = 1, url, headed = false }: { edit?: string; only?: string; scale?: number; url?: string; headed?: boolean } = {}) {
  if (edit && !existsSync(path.join(ROOT, 'projects', edit, 'timeline.ts'))) throw new Error(`no project '${edit}' (projects/${edit}/timeline.ts)`);
  const server = await ensureServer(url);
  const browser = await chromium.launch({ channel: 'chrome', headless: !headed, args: chromeArgs() });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const logs: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    await page.goto(appUrl(server.url, { edit, only, scale }));
    await page.waitForFunction(() => (window as any).__video?.ready || (window as any).__video?.error, null, { timeout: 180_000 });
    const error = await page.evaluate(() => (window as any).__video.error);
    if (error) throw new Error(`app failed to boot:\n${error}\n${logs.join('\n')}`);
    const errors: string[] = await page.evaluate(() => (window as any).__video.errors);
    if (errors.length) console.error('SCENE ERRORS:\n' + errors.join('\n'));
    return { browser, page, logs, stop: server.stop };
  } catch (failure) {
    // a failed boot must not leave Chrome and a Vite server running behind the error
    await browser.close().catch(() => {});
    server.stop();
    throw failure;
  }
}
