// Boots the video app in headless Chrome for the offline tools (render.ts, audio.ts).
import { chromium } from 'playwright-core';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');

async function reachable(url: string) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}

/** The Vite server at `url` (default :5180), or a private one without live reload if that is down. */
async function ensureServer(url = 'http://localhost:5180'): Promise<{ url: string; stop: () => void }> {
  if (await reachable(url)) return { url, stop: () => {} };
  const port = 5400 + Math.floor(Math.random() * 400);
  const proc = Bun.spawn(['bunx', 'vite', '--port', String(port), '--strictPort'], { cwd: ROOT, stdout: 'ignore', stderr: 'ignore', env: { ...process.env, DEMO_REEL_NO_HMR: '1' } });
  const u = `http://localhost:${port}`;
  for (let i = 0; i < 150 && !(await reachable(u)); i++) await Bun.sleep(100);
  return { url: u, stop: () => proc.kill() };
}

export async function openApp({ edit, only, scale = 1, url, headed = false }: { edit?: string; only?: string; scale?: number; url?: string; headed?: boolean } = {}) {
  const server = await ensureServer(url);
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !headed,
    // Metal on a Mac; a Linux sandbox has no GPU and draws through SwiftShader, which keeps up
    args: [...(process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] : []), '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const logs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${server.url}/?export=1${edit ? `&edit=${edit}` : ''}${only ? `&only=${only}` : ''}${scale !== 1 ? `&scale=${scale}` : ''}`);
  await page.waitForFunction(() => (window as any).__video?.ready || (window as any).__video?.error, null, { timeout: 180_000 });
  const error = await page.evaluate(() => (window as any).__video.error);
  if (error) throw new Error(`app failed to boot:\n${error}\n${logs.join('\n')}`);
  const errors: string[] = await page.evaluate(() => (window as any).__video.errors);
  if (errors.length) console.error('SCENE ERRORS:\n' + errors.join('\n'));
  return { browser, page, logs, stop: server.stop };
}
