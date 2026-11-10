import { afterEach, describe, expect, test } from 'bun:test';
import { footageUrl, loadFootage } from './assets';
import { installFakeNetwork } from '../testing/footage';

describe('footageUrl', () => {
  test('is relative to the page, so it works from any served path', () => {
    expect(footageUrl('vite')).toBe('footage/vite');
    expect(footageUrl('vite', 'manifest.json')).toBe('footage/vite/manifest.json');
    expect(footageUrl('vite', 'clips/open/0001.jpg')).toBe('footage/vite/clips/open/0001.jpg');
    expect(footageUrl('vite').startsWith('/')).toBe(false);
  });

  test('an empty file name is the folder itself', () => {
    expect(footageUrl('vite', '')).toBe('footage/vite');
  });
});

describe('loadFootage', () => {
  let network: ReturnType<typeof installFakeNetwork>;
  afterEach(() => network?.restore());

  const manifest = {
    dpr: 2,
    viewport: { width: 1440, height: 900 },
    shots: { hero: { file: 'hero.png', w: 1440, h: 900, scrollY: 0, boxes: { cta: { x: 1, y: 2, w: 3, h: 4 } } } },
    extras: { marquee: { file: 'marquee.png', loopSeconds: 20 }, note: { text: 'no file' } },
    clips: { open: { dir: 'clips/open', fps: 60, scrollY: 0, frames: [], marks: {} } },
  };

  test('reads the manifest and decodes every shot and extra image', async () => {
    network = installFakeNetwork({
      'footage/loaded/manifest.json': manifest,
      'footage/loaded/hero.png': { blob: 'hero' },
      'footage/loaded/marquee.png': { blob: 'marquee' },
    });
    const footage = await loadFootage('loaded');
    expect(footage.name).toBe('loaded');
    expect(footage.dpr).toBe(2);
    expect(footage.viewport).toEqual({ width: 1440, height: 900 });
    expect(footage.shots.hero!.boxes.cta).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    expect((footage.shots.hero!.image as any).name).toBe('hero');
    expect(Object.keys(footage.images)).toEqual(['marquee.png']); // only extras that name a file
    expect(Object.keys(footage.clips)).toEqual(['open']);
  });

  test('loads a project once: a second call is the same footage and fetches nothing', async () => {
    network = installFakeNetwork({ 'footage/once/manifest.json': { ...manifest, shots: {}, extras: {} } });
    const first = loadFootage('once');
    const second = loadFootage('once');
    expect(second).toBe(first);
    await first;
    expect(network.fetched).toEqual(['footage/once/manifest.json']);
  });

  test('a missing manifest says which capture script to run', async () => {
    network = installFakeNetwork({});
    await expect(loadFootage('missing')).rejects.toThrow('footage/missing/manifest.json: HTTP 404 (run bun capture/missing.ts)');
  });

  test('a missing plate names the file and says to capture first', async () => {
    network = installFakeNetwork({ 'footage/noplate/manifest.json': manifest });
    await expect(loadFootage('noplate')).rejects.toThrow(/footage\/noplate\/hero\.png: HTTP 404 \(capture the footage first/);
  });

  test('a manifest without extras or clips still loads', async () => {
    network = installFakeNetwork({ 'footage/bare/manifest.json': { dpr: 1, viewport: { width: 10, height: 10 }, shots: {} } });
    const footage = await loadFootage('bare');
    expect(footage.clips).toEqual({});
    expect(footage.extras).toEqual({});
    expect(footage.images).toEqual({});
  });
});
