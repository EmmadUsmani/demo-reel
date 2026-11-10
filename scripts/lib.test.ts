import { describe, expect, spyOn, test } from 'bun:test';
import { appUrl, chromeArgs, ensureServer, freePort, openApp, parseArgs, reachable, startVite, VITE } from './lib';
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

/** Is a process whose command line contains `needle` still running? */
const running = (needle: string) => Bun.spawnSync(['pgrep', '-f', '--', needle]).exitCode === 0;
async function until(done: () => boolean | Promise<boolean>, ms = 15_000) {
  for (const end = Date.now() + ms; Date.now() < end; await Bun.sleep(100)) if (await done()) return true;
  return false;
}

/** Chrome processes started by this test process (playwright launches Chrome as our direct child). */
const chromeChildren = () => Bun.spawnSync(['ps', '-axo', 'pid=,ppid=,command=']).stdout.toString().split('\n')
  .filter((l) => l.trim().split(/\s+/)[1] === String(process.pid) && /chrome/i.test(l));
const probe = await chromium.launch({ channel: 'chrome' }).catch(() => undefined);
await probe?.close();
const chromeTest = probe ? test : test.skip;
if (!probe) console.warn('Chrome not found: the openApp tests are skipped');

/** A stand-in for the Vite server: every request gets this page, and the addresses asked for are recorded. */
function fakeApp(script: string) {
  const asked: string[] = [];
  const server = Bun.serve({ port: 0, fetch(req) { asked.push(new URL(req.url).pathname + new URL(req.url).search); return new Response(`<!doctype html><script>${script}</script>`, { headers: { 'content-type': 'text/html' } }); } });
  return { url: `http://localhost:${server.port}`, asked, stop: () => server.stop(true) };
}

describe('parseArgs', () => {
  const { opt, flag } = parseArgs(['video', '--edit', 'todomvc', '--force', '--fps', '30']);

  test('opt reads the value after --key, or the fallback', () => {
    expect(opt('edit')).toBe('todomvc');
    expect(opt('fps', '60')).toBe('30');
    expect(opt('crf', '16')).toBe('16');
    expect(opt('crf')).toBeUndefined();
  });

  test('flag is true only for a switch that is present', () => {
    expect(flag('force')).toBe(true);
    expect(flag('builds')).toBe(false);
  });

  test('a key with no value after it reads as undefined, not the fallback', () => {
    expect(parseArgs(['--edit']).opt('edit', 'x')).toBeUndefined();
  });
});

describe('appUrl', () => {
  test('is the export-mode app, with only the options given', () => {
    expect(appUrl('http://localhost:5180')).toBe('http://localhost:5180/?export=1');
    expect(appUrl('http://localhost:5180', { edit: 'vite', only: 'intro,outro', scale: 2 })).toBe('http://localhost:5180/?export=1&edit=vite&only=intro,outro&scale=2');
  });

  test('leaves the scale out at 1', () => {
    expect(appUrl('http://x', { edit: 'a', scale: 1 })).toBe('http://x/?export=1&edit=a');
  });
});

describe('chromeArgs', () => {
  test('asks for Metal only on a Mac', () => {
    expect(chromeArgs('darwin')).toContain('--use-angle=metal');
    expect(chromeArgs('linux')).not.toContain('--use-angle=metal');
  });

  test('always keeps the page running at full speed in the background', () => {
    for (const platform of ['darwin', 'linux']) expect(chromeArgs(platform)).toEqual(expect.arrayContaining(['--disable-background-timer-throttling', '--disable-renderer-backgrounding']));
  });
});

describe('freePort', () => {
  test('is a port that can be listened on straight away', () => {
    const port = freePort();
    expect(port).toBeGreaterThan(1023);
    const server = Bun.serve({ port, fetch: () => new Response('ok') });
    expect(server.port).toBe(port);
    server.stop(true);
  });

  test('gives different ports to servers that are up at the same time', () => {
    const first = Bun.serve({ port: freePort(), fetch: () => new Response('a') });
    const second = Bun.serve({ port: freePort(), fetch: () => new Response('b') });
    expect(first.port).not.toBe(second.port);
    first.stop(true);
    second.stop(true);
  });
});

describe('reachable', () => {
  test('is true for a server that answers 200, false for an error status or nothing listening', async () => {
    const server = Bun.serve({ port: 0, fetch: (req) => new Response('x', { status: new URL(req.url).pathname === '/bad' ? 500 : 200 }) });
    expect(await reachable(`http://localhost:${server.port}/`)).toBe(true);
    expect(await reachable(`http://localhost:${server.port}/bad`)).toBe(false);
    server.stop(true);
    expect(await reachable(`http://localhost:${freePort()}/`)).toBe(false);
  });
});

describe('ensureServer', () => {
  test('uses a server that is already up, and its stop does nothing', async () => {
    const up = Bun.serve({ port: 0, fetch: () => new Response('up') });
    const url = `http://localhost:${up.port}`;
    const server = await ensureServer(url);
    expect(server.url).toBe(url);
    server.stop();
    expect(await reachable(url)).toBe(true);
    up.stop(true);
  });

  test('starts a private Vite when the address is down, on another port, and stop() ends it for good', async () => {
    const down = `http://localhost:${freePort()}`;
    const server = await ensureServer(down);
    try {
      expect(server.url).not.toBe(down);
      expect(await reachable(server.url)).toBe(true);
    } finally {
      server.stop();
    }
    const port = new URL(server.url).port;
    expect(await until(async () => !(await reachable(server.url)))).toBe(true);
    expect(await until(() => !running(`--port ${port}`))).toBe(true);
  }, 30_000);
});

describe('startVite', () => {
  test('finds the vite binary in the repo', () => {
    expect(existsSync(VITE)).toBe(true);
  });

  test('passes its arguments and env through, and stop() leaves no process behind', async () => {
    const port = freePort();
    const stop = startVite(['--port', String(port), '--strictPort'], { DEMO_REEL_NO_HMR: '1' });
    try {
      expect(await until(() => reachable(`http://localhost:${port}`))).toBe(true);
      expect(running(`--port ${port}`)).toBe(true);
    } finally {
      stop();
    }
    expect(await until(() => !running(`--port ${port}`))).toBe(true);
    expect(await reachable(`http://localhost:${port}`)).toBe(false);
  }, 30_000);

  test('stop() twice is harmless', () => {
    const stop = startVite(['--port', String(freePort()), '--strictPort']);
    stop();
    expect(() => stop()).not.toThrow();
  });
});

describe('openApp', () => {
  chromeTest('opens the export-mode app for the edit and hands back the page once it says it is ready', async () => {
    const app = fakeApp('window.__video = { ready: true, errors: [], duration: 12 }');
    const { browser, page, stop } = await openApp({ edit: 'todomvc', scale: 2, url: app.url });
    try {
      expect(await page.evaluate(() => (window as any).__video.duration)).toBe(12);
      expect(app.asked).toContain('/?export=1&edit=todomvc&scale=2');
    } finally {
      await browser.close();
      stop();
      app.stop();
    }
  });

  chromeTest('prints the scenes\' own errors, and carries on', async () => {
    const app = fakeApp("window.__video = { ready: true, errors: ['title: it broke'] }");
    const print = spyOn(console, 'error').mockImplementation(() => {});
    const { browser, stop } = await openApp({ url: app.url });
    try {
      expect(print).toHaveBeenCalledWith('SCENE ERRORS:\ntitle: it broke');
    } finally {
      print.mockRestore();
      await browser.close();
      stop();
      app.stop();
    }
  });

  chromeTest('a failed boot rejects with the app\'s error and the page\'s log, and leaves no Chrome running', async () => {
    const app = fakeApp("console.error('missing plate'); window.__video = { error: 'Error: boom' }");
    try {
      await expect(openApp({ url: app.url })).rejects.toThrow(/^app failed to boot:\nError: boom\n\[error\] missing plate/);
      expect(await until(() => chromeChildren().length === 0, 5000)).toBe(true);
    } finally {
      app.stop();
    }
  });
});
