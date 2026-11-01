// Drives a real, running web app in headless Chrome and records footage: device-pixel-ratio 2
// screenshots, plus the boxes of the elements a scene aims its camera, cursor and callouts at.
// Boxes are CSS px in document coordinates, so they line up with a full-page shot as well as
// with a viewport shot taken at a known scroll offset.
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { installVirtualClock } from './clock';
import type { Clip } from './record';

/**
 * Where the app under capture lives. A capture script usually names its own default (a public site,
 * or your local dev server) and lets BASE_URL override it, so the same script films staging or prod.
 */
export const baseUrl = (fallback: string) => (process.env.BASE_URL ?? fallback).replace(/\/$/, '');

// A laptop-sized viewport at 2x: the video shows the app at about 1:1, so every
// camera push up to 2x stays sharp.
export const VIEWPORT = { width: 1440, height: 900 };
export const DPR = 2;

export const FOOTAGE = path.resolve(import.meta.dir, '../footage');

export type Box = { x: number; y: number; w: number; h: number };
export type Shot = { file: string; w: number; h: number; scrollY: number; boxes: Record<string, Box> };

export type LaunchOptions = {
  /**
   * Runs on the fresh context before any page opens: seed localStorage so one-time hints and cookie
   * banners read as already dismissed, add cookies for a signed-in session, and so on.
   */
  prepare?: (context: BrowserContext) => Promise<void>;
  /** Extra CSS selectors to hide in every shot (a site's own cookie banner, a promo bar). */
  hide?: string[];
  colorScheme?: 'light' | 'dark';
};

let extraNoise: string[] = [];

export async function launch({ prepare, hide = [], colorScheme = 'light' }: LaunchOptions = {}): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const browser = await chromium.launch({ channel: 'chrome', headless: !process.argv.includes('--headed') });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR, colorScheme });
  extraNoise = hide;
  if (prepare) await prepare(context);
  await context.addInitScript(installVirtualClock);
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(`[pageerror] ${error.message}`));
  return { browser, context, page };
}

// Signing in is the app's business, so it is the capture script's: fill the real form, or use your
// own app's dev-only login route. A session saved once with `context.storageState({ path })` can be
// reused through launch({ prepare }) instead. Never film real credentials; use a demo account.

// Widgets that are never part of the product shot: chat bubbles, cookie banners, dev overlays.
const NOISE = [
  'iframe[title*="chat" i]', '.intercom-lightweight-app', '#intercom-container', '#hubspot-messages-iframe-container',
  '#crisp-chatbox', '.drift-frame-controller', '#onetrust-consent-sdk', '#CybotCookiebotDialog',
  'vite-error-overlay', '#webpack-dev-server-client-overlay', 'nextjs-portal',
];
const noiseCss = () => `${[...NOISE, ...extraNoise].join(', ')} { display: none !important; }\n* { caret-color: transparent !important; }`;

/** Every request done, fonts ready, the images in view decoded, and fade-ins finished. */
export async function settle(page: Page, extraMs = 900) {
  await page.addStyleTag({ content: noiseCss() }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.evaluate(decodeImagesInView).catch(() => {});
  await page.waitForTimeout(extraMs);
}

// Lazy images below the fold never load until scrolled to, so only the ones in view are waited
// for, and never longer than a few seconds: a broken image must not hang the capture.
async function decodeImagesInView() {
  await document.fonts.ready;
  const inView = Array.from(document.images).filter((image) => {
    const rect = image.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight;
  });
  const decoded = Promise.all(inView.map((image) =>
    image.complete ? image.decode().catch(() => {}) : new Promise((done) => { image.addEventListener('load', done, { once: true }); image.addEventListener('error', done, { once: true }); })));
  await Promise.race([decoded, new Promise((done) => setTimeout(done, 5000))]);
}

/** Load every lazy image on the page by walking the viewport down it, then return to the top. */
export async function loadWholePage(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += VIEWPORT.height / 2) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.evaluate(decodeImagesInView).catch(() => {});
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page, 400);
}

export async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + scrollX, y: rect.top + scrollY, w: rect.width, h: rect.height };
  });
  return { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) };
}

const round = (value: number) => Math.round(value * 10) / 10;

/** One capture session: screenshots land in footage/<name>/, the manifest beside them. */
export class Footage {
  readonly dir: string;
  readonly shots: Record<string, Shot> = {};
  /** Anything else a scene needs to replay the page faithfully (a lifted marquee, say). */
  readonly extras: Record<string, unknown> = {};
  /** Frame-by-frame recordings of the app's motion (record.ts). */
  readonly clips: Record<string, Clip> = {};

  constructor(readonly name: string) {
    this.dir = path.join(FOOTAGE, name);
    mkdirSync(this.dir, { recursive: true });
  }

  /**
   * A DPR-2 PNG of the viewport (at its current scroll), or of the whole page from the top with
   * `fullPage`; `maxHeight` stops a full-page shot that far down (CSS px), for a long page whose
   * scene only scrolls part of it.
   */
  async shot(page: Page, id: string, boxes: Record<string, Locator>, { fullPage = false, maxHeight = Infinity } = {}) {
    const file = `${id}.png`;
    const measured: Record<string, Box> = {};
    for (const [key, locator] of Object.entries(boxes)) measured[key] = await boxOf(locator.first());
    const scrolledTo: number = await page.evaluate(() => window.scrollY);
    const h = fullPage ? Math.min(maxHeight, await page.evaluate(() => document.documentElement.scrollHeight)) : VIEWPORT.height;
    const clip = fullPage && Number.isFinite(maxHeight) ? { x: 0, y: 0, width: VIEWPORT.width, height: h } : undefined;
    await page.screenshot({ path: path.join(this.dir, file), fullPage, clip, animations: 'disabled', caret: 'hide' });
    this.shots[id] = { file, w: VIEWPORT.width, h, scrollY: fullPage ? 0 : scrolledTo, boxes: measured };
    console.log(`  ${id}: ${file} ${VIEWPORT.width}x${h} (${Object.keys(measured).length} boxes)`);
  }

  /** Writes the manifest, keeping shots and clips an earlier run recorded that this one did not. */
  save() {
    const file = path.join(this.dir, 'manifest.json');
    const previous = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    const manifest = {
      viewport: VIEWPORT, dpr: DPR, capturedAt: new Date().toISOString(),
      shots: { ...previous.shots, ...this.shots },
      clips: { ...previous.clips, ...this.clips },
      extras: { ...previous.extras, ...this.extras },
    };
    writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`wrote ${file}`);
  }
}

/** Whether a click at the element's centre would land on it (visible, and not covered by anything). */
export async function hittable(locator: Locator) {
  if (!(await locator.count())) return false;
  return locator.first().evaluate((element) => {
    const r = element.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return Boolean(top) && (top === element || element.contains(top));
  }).catch(() => false);
}

/**
 * Lift a CSS marquee (a rail of logos or quotes that slides forever) out of the page so the renderer
 * can replay it on the video's clock: a still would freeze it mid-slide. Shoot your plates with the
 * track hidden first (`hideMarquee`), then call this last: it empties the page around the track and
 * shoots it as the app renders it, unanimated at its starting offset. Store the result as an extra
 * (`footage.extras.marquee = await liftMarquee(...)`) and draw it with `view.marquee(page, rail, t)`.
 *   track: a selector for the element that slides; it must hold two or more identical copies
 *   loopSeconds: how long one copy takes to slide by (read it from the page's CSS)
 */
export async function liftMarquee(page: Page, footage: Footage, track: string, loopSeconds: number, file = 'marquee.png') {
  await page.evaluate(() => window.scrollTo(0, 0));
  const measured = await page.evaluate((selector) => {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (!element) throw new Error(`no marquee track at ${selector}`);
    const copy = element.firstElementChild as HTMLElement;
    document.body.replaceChildren(element);
    document.documentElement.style.background = document.body.style.background = 'transparent';
    Object.assign(element.style, { animation: 'none', transform: 'none', visibility: 'visible', position: 'absolute', left: '0', top: '0' });
    element.id = 'lifted-marquee-track';
    const box = element.getBoundingClientRect();
    return { copyWidth: copy.getBoundingClientRect().width, trackWidth: box.width, height: box.height };
  }, track);
  await page.waitForTimeout(300);
  await page.locator('#lifted-marquee-track').screenshot({ path: path.join(footage.dir, file), omitBackground: true, animations: 'disabled' });
  console.log(`  marquee: ${measured.trackWidth}x${measured.height}, one copy ${measured.copyWidth}px per ${loopSeconds}s`);
  return { file, loopSeconds, ...measured };
}

/** Hide a marquee's track for the plates (the rail keeps its size), before liftMarquee(). */
export async function hideMarquee(page: Page, track: string) {
  await page.addStyleTag({ content: `${track} { visibility: hidden !important; }` });
}
