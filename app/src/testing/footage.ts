// Fake footage for tests: bitmaps that are only a size, clips and shots built in memory, and a fake
// `fetch` + `createImageBitmap` so loadFootage / ClipPlayer.prepare / loadCard run without a server.
import type { Box, Footage, Shot } from '../engine/assets';
import type { Clip, ClipFrame } from '../engine/clip';

export type FakeBitmap = ImageBitmap & { name: string; closed: boolean };

export const bitmap = (name = 'bitmap', width = 2880, height = 1800): FakeBitmap =>
  ({ name, width, height, closed: false, close() { (this as FakeBitmap).closed = true; } }) as unknown as FakeBitmap;

export const shot = (over: Partial<Omit<Shot, 'image'>> & { image?: ImageBitmap } = {}): Shot =>
  ({ file: 'shot.png', w: 1440, h: 900, scrollY: 0, boxes: {}, image: bitmap('shot', 2880, 1800), ...over });

/** A clip of `count` frames: the pointer moves right 10 px a frame, pressed on frames 10..19. */
export function clip(count = 60, over: Partial<Clip> = {}): Clip {
  const frames: ClipFrame[] = Array.from({ length: count }, (_, i) => ({ file: `${String(i).padStart(4, '0')}.jpg`, x: i * 10, y: 100, down: i >= 10 && i < 20 }));
  return { dir: 'clips/demo', fps: 60, scrollY: 0, frames, marks: {}, ...over };
}

export function footage(over: Partial<Footage> = {}): Footage {
  return { name: 'demo', clips: {}, dpr: 2, viewport: { width: 1440, height: 900 }, shots: {}, extras: {}, images: {}, ...over };
}

export const box = (x = 0, y = 0, w = 100, h = 50): Box => ({ x, y, w, h });

type Route = { status?: number; json?: unknown; blob?: string };

/**
 * Replace fetch and createImageBitmap for the duration of a test. `routes` maps a URL to what it
 * answers; any other URL is a 404. Returns the URLs fetched, in order, and a function that puts the
 * real ones back.
 */
export function installFakeNetwork(routes: Record<string, Route | unknown>) {
  const real = { fetch: globalThis.fetch, createImageBitmap: (globalThis as any).createImageBitmap };
  const fetched: string[] = [];
  const routeOf = (value: unknown): Route => (value && typeof value === 'object' && ('json' in value || 'blob' in value || 'status' in value) ? (value as Route) : { json: value });
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    fetched.push(url);
    if (!(url in routes)) return { ok: false, status: 404 } as Response;
    const route = routeOf(routes[url]);
    const status = route.status ?? 200;
    return { ok: status < 400, status, json: async () => route.json, blob: async () => ({ name: route.blob ?? url }), arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
  }) as typeof fetch;
  (globalThis as any).createImageBitmap = async (blob: { name: string }) => bitmap(blob.name);
  return { fetched, restore() { globalThis.fetch = real.fetch; (globalThis as any).createImageBitmap = real.createImageBitmap; } };
}

/** A fake OffscreenCanvas whose 2d context is a recording fake, for the Engine's layers. */
export function installFakeOffscreenCanvas(makeContext: () => unknown) {
  const real = (globalThis as any).OffscreenCanvas;
  const made: { width: number; height: number; ctx: unknown }[] = [];
  (globalThis as any).OffscreenCanvas = class {
    ctx = makeContext();
    constructor(public width: number, public height: number) { made.push(this); }
    getContext() { return this.ctx; }
  };
  return { made, restore() { (globalThis as any).OffscreenCanvas = real; } };
}
