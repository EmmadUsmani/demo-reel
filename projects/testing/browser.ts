// Runs a project's edit without a browser. Three things stand in for the page the engine expects:
//  - `import.meta.glob` (a Vite feature the timelines and edit.ts use) is expanded by a Bun plugin;
//  - `location`, `OffscreenCanvas`, `fetch` and `createImageBitmap` are stubbed (footage plates are
//    gitignored, so a plate is a bitmap of the size its manifest says; the manifest is the real one);
//  - a Recorder (canvas.ts) takes the place of every 2D context.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Edit } from '@engine/edit';
import { applyTheme, FONT_FILES } from '@engine/palette';
import { Recorder } from './canvas';

export const ROOT = path.resolve(import.meta.dir, '../..');
export const PROJECTS = path.join(ROOT, 'projects');

/** Project names that have an edit, sorted. */
export const projectNames = () => readdirSync(PROJECTS).filter((name) => existsSync(path.join(PROJECTS, name, 'timeline.ts'))).sort();

export const manifestOf = (name: string) => JSON.parse(readFileSync(path.join(PROJECTS, name, 'footage/manifest.json'), 'utf8'));

// ------------------------------------------------------------------ import.meta.glob

const GLOB = /import\.meta\.glob(?:<[^>]*>)?\(\s*(['"])([^'"]+)\1\s*\)/g;

/** What Vite would write for `import.meta.glob(pattern)` in `file`: pattern -> () => import(module). Wildcards in the file name only. */
export function expandGlob(file: string, pattern: string) {
  const dir = path.dirname(path.resolve(path.dirname(file), pattern));
  if (!existsSync(dir)) return '{}'; // the pattern is in a comment, not a call
  const matches = [...new Bun.Glob(path.basename(pattern)).scanSync({ cwd: dir })].sort();
  const prefix = path.dirname(pattern);
  return `{ ${matches.map((match) => `${JSON.stringify(`${prefix}/${match}`)}: () => import(${JSON.stringify(path.join(dir, match))})`).join(', ')} }`;
}

Bun.plugin({
  name: 'import-meta-glob',
  setup(build) {
    build.onLoad({ filter: /(\/app\/src\/engine\/edit|\/projects\/[^/]+\/timeline)\.ts$/ }, ({ path: file }) => ({
      contents: readFileSync(file, 'utf8').replace(GLOB, (_all, _quote, pattern) => expandGlob(file, pattern)),
      loader: 'ts',
    }));
  },
});

// ------------------------------------------------------------------ the page

/** Every context the engine makes records into this one: reset() it between frames. */
export const recorder = new Recorder();

const bitmap = (width: number, height: number) => ({ width, height, close() {} });

/** The size a footage file would decode to; undefined when its project's manifest does not list it. */
function sizeOf(name: string, file: string) {
  const manifest = manifestOf(name);
  const shot = Object.values<any>(manifest.shots ?? {}).find((s) => s.file === file);
  if (shot) return { width: shot.w * manifest.dpr, height: shot.h * manifest.dpr };
  const extra = Object.values<any>(manifest.extras ?? {}).find((e) => e?.file === file);
  if (extra?.cols) return { width: extra.cols * extra.cellW, height: extra.rows * extra.cellH };
  const inClip = Object.values<any>(manifest.clips ?? {}).some((clip) => clip.frames.some((frame: any) => `${clip.dir}/${frame.file}` === file));
  if (inClip) return { width: manifest.viewport.width * manifest.dpr, height: manifest.viewport.height * manifest.dpr };
}

/** Every footage file asked for, as the page would request it: the test of "this plate exists" is that none is a 404. */
export const requested: string[] = [];

async function fakeFetch(url: string | URL | Request) {
  const [, name, file] = /^footage\/([^/]+)\/(.+)$/.exec(String(url)) ?? [];
  if (!name || !file) return { ok: false, status: 404 };
  requested.push(String(url));
  if (file === 'manifest.json') return { ok: true, status: 200, json: async () => manifestOf(name) };
  const size = sizeOf(name, file);
  if (!size) return { ok: false, status: 404 };
  return { ok: true, status: 200, blob: async () => size };
}

const STUBS: Record<string, unknown> = {
  location: { search: '' },
  fetch: fakeFetch,
  createImageBitmap: async (blob: { width: number; height: number }) => bitmap(blob.width, blob.height),
  OffscreenCanvas: class { constructor(public width: number, public height: number) {} getContext() { return recorder.context(); } },
};

/** Put the page's globals in place (call from beforeAll) and take them away again (returned, for afterAll). */
export function installBrowser() {
  const before = Object.fromEntries(Object.keys(STUBS).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(STUBS)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  return () => {
    for (const [key, descriptor] of Object.entries(before)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
  };
}

// ------------------------------------------------------------------ edits and engines

/** Apply an edit's theme (the page does this before the scenes load); returns the undo. */
export function useTheme(edit: Edit) {
  const fonts = FONT_FILES.length;
  applyTheme(edit.theme);
  return () => { applyTheme(); FONT_FILES.length = fonts; };
}

/** One project's edit, loaded as the page would load it. */
export async function loadEdit(name: string): Promise<Edit> {
  return (await import(path.join(PROJECTS, name, 'timeline.ts'))).default;
}

/** An engine for `edit`, initialised (every scene loaded and laid out) and drawing into the recorder. */
export async function bootEngine(edit: Edit) {
  const { Engine } = await import('@engine/engine');
  const restore = useTheme(edit);
  try {
    const engine = new Engine(recorder.canvas(1920, 1080), edit.timeline);
    await engine.init();
    return engine;
  } finally { restore(); }
}

const booted = new Map<string, Promise<{ edit: Edit; engine: Awaited<ReturnType<typeof bootEngine>>; files: string[] }>>();

/** A project's edit and its booted engine (and the footage urls booting asked for), once per test run (call after installBrowser). */
export function project(name: string) {
  if (!booted.has(name)) {
    booted.set(name, (async () => {
      const edit = await loadEdit(name);
      const before = requested.length;
      const engine = await bootEngine(edit);
      return { edit, engine, files: requested.slice(before) };
    })());
  }
  return booted.get(name)!;
}
