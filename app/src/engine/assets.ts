import { FONT_FILES } from './palette';

// Fonts and captured footage. Everything is decoded up front (createImageBitmap), so a frame never
// waits on a decode and the export renders exactly what the preview shows.

export type Box = { x: number; y: number; w: number; h: number };

export type Shot = {
  file: string;
  /** CSS px of the app */
  w: number;
  h: number;
  /** Page offset the shot was taken at (0 for a full-page shot). */
  scrollY: number;
  /** Element boxes in document CSS px. */
  boxes: Record<string, Box>;
  image: ImageBitmap;
};

export type Footage = {
  name: string;
  /** Frame-by-frame recordings (engine/clip.ts plays them). */
  clips: Record<string, import('./clip').Clip>;
  dpr: number;
  viewport: { width: number; height: number };
  shots: Record<string, Shot>;
  extras: Record<string, any>;
  /** Images named by an extra's `file`, e.g. a lifted marquee track. */
  images: Record<string, ImageBitmap>;
};

/**
 * Load the theme's font files (palette.ts FONT_FILES) before the first frame is drawn. Fetched as data,
 * not by url(): a page whose security policy allows fonts only from data (a hosted player) still gets them.
 */
export async function loadFonts() {
  await Promise.all(
    FONT_FILES.map(async ([family, url, weight, style = 'normal']) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      const face = new FontFace(family, await response.arrayBuffer(), { weight: String(weight), style });
      document.fonts.add(await face.load());
    }),
  );
}

async function bitmap(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status} (capture the footage first: bun capture/<name>.ts)`);
  return createImageBitmap(await response.blob());
}

/**
 * Where a project's footage is served: relative to the page, so the same code works from the dev
 * server (vite.config.ts maps footage/<name>/ to projects/<name>/footage/) and from a built player
 * folder at any path (scripts/build.ts copies it there).
 */
export const footageUrl = (name: string, file = '') => `footage/${name}${file ? `/${file}` : ''}`;

const cache = new Map<string, Promise<Footage>>();

export function loadFootage(name: string): Promise<Footage> {
  if (!cache.has(name)) cache.set(name, fetchFootage(name));
  return cache.get(name)!;
}

async function fetchFootage(name: string): Promise<Footage> {
  const base = footageUrl(name);
  const response = await fetch(`${base}/manifest.json`);
  if (!response.ok) throw new Error(`${base}/manifest.json: HTTP ${response.status} (run bun capture/${name}.ts)`);
  const manifest = await response.json();
  const shots: Record<string, Shot> = {};
  await Promise.all(
    Object.entries<Omit<Shot, 'image'>>(manifest.shots).map(async ([id, shot]) => {
      shots[id] = { ...shot, image: await bitmap(`${base}/${shot.file}`) };
    }),
  );
  const images: Record<string, ImageBitmap> = {};
  await Promise.all(
    Object.values<any>(manifest.extras ?? {})
      .filter((extra) => typeof extra?.file === 'string')
      .map(async (extra) => { images[extra.file] = await bitmap(`${base}/${extra.file}`); }),
  );
  return { name, dpr: manifest.dpr, viewport: manifest.viewport, shots, clips: manifest.clips ?? {}, extras: manifest.extras ?? {}, images };
}
