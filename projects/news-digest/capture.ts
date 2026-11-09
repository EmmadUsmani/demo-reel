#!/usr/bin/env bun
// News Digest: footage for a slide-led reel about the app and the agent factory that builds it.
//   ND_REPO=~/projects/news-digest bun projects/news-digest/capture.ts
// Two sources, both real:
//  1. The build agent's own verification screenshots. The app and its tools are private (behind the
//     exe.dev login), so its UI, admin pages and Grafana come from the Playwright screenshots the agent
//     took of production and committed to docs/screenshots/ (Nov 3–7). They are 1x PNGs; this script
//     upscales them 2x (Lanczos) to the engine's DPR-2 plates and crops them, nothing else. There is no DOM
//     to measure, so their only box is the first screen; scenes move the camera over them and put no rings
//     or labels on them.
//  2. The public GitHub repo, filmed live: the commit list and STEERING.md (its ranked list and an ack).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { Footage, launch, settle } from '../../capture/lib';

const REPO = (process.env.ND_REPO ?? '~/projects/news-digest').replace(/^~/, os.homedir());
const SHOTS = path.join(REPO, 'docs/screenshots');
const GITHUB = 'https://github.com/EmmadUsmani/news-digest';
const footage = new Footage('news-digest');

const ffmpeg = (...args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const size = (file: string) => {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim();
  const [w, h] = out.split(',').map(Number);
  return { w: w!, h: h! };
};

// ------------------------------------------------------------------ 1. the agent's screenshots

/** id → [file under docs/screenshots, CSS px of it to keep from the top] */
const AGENT_SHOTS: Record<string, [string, number]> = {
  reader: ['ui/spec-reader-desktop-light.png', 2200],
  'admin-overview': ['ui/admin-overview-desktop-light.png', 900],
  'admin-spend': ['ui/admin-spend-desktop-light.png', 1500],
  'grafana-agent': ['grafana-nd-agent-desktop.png', 1500],
  'grafana-product': ['grafana-nd-product-desktop.png', 1300],
  'grafana-jobs': ['grafana-nd-jobs-desktop.png', 900],
  logs: ['logs-desktop.png', 900],
};

for (const [id, [rel, keep]] of Object.entries(AGENT_SHOTS)) {
  const source = path.join(SHOTS, rel);
  if (!existsSync(source)) throw new Error(`missing agent screenshot ${source} (set ND_REPO to the news-digest clone)`);
  const { w, h } = size(source);
  if (w !== 1440) throw new Error(`${rel} is ${w} px wide; expected a 1440 px desktop screenshot`);
  const kept = Math.min(h, keep);
  const file = `${id}.png`;
  ffmpeg('-i', source, '-vf', `crop=1440:${kept}:0:0,scale=2880:${kept * 2}:flags=lanczos`, path.join(footage.dir, file));
  // the one box: the first screen (the viewport the agent's browser showed), for polaroid cards
  footage.shots[id] = { file, w: 1440, h: kept, scrollY: 0, boxes: { screen: { x: 0, y: 0, w: 1440, h: Math.min(900, kept) } } };
  console.log(`  ${id}: ${rel} (${kept} css px)`);
}

// The evidence wall: one atlas of the agent's desktop screenshots (first screen of each), in the
// order git added them, so the wall shows the breadth of what it checked.
const WALL_COLS = 12, WALL_ROWS = 8, CELL_W = 360, CELL_H = 225;
const desktop = execFileSync('git', ['-C', REPO, 'log', '--reverse', '--diff-filter=A', '--name-only', '--format=', '--', 'docs/screenshots'])
  .toString().split('\n').filter((f) => /desktop(-light|-dark)?\.png$/.test(f) && existsSync(path.join(REPO, f)))
  .filter((f) => size(path.join(REPO, f)).w === 1440);
const picks = Array.from({ length: WALL_COLS * WALL_ROWS }, (_, i) => desktop[Math.floor((i * desktop.length) / (WALL_COLS * WALL_ROWS))]!);
const inputs = picks.flatMap((f) => ['-i', path.join(REPO, f)]);
const cells = picks.map((_, i) => `[${i}]crop=1440:min(ih\\,900):0:0,scale=${CELL_W}:${CELL_H}:force_original_aspect_ratio=increase,crop=${CELL_W}:${CELL_H},setsar=1[c${i}]`).join(';');
const layout = picks.map((_, i) => `${(i % WALL_COLS) * CELL_W}_${Math.floor(i / WALL_COLS) * CELL_H}`).join('|');
ffmpeg(...inputs, '-filter_complex', `${cells};${picks.map((_, i) => `[c${i}]`).join('')}xstack=inputs=${picks.length}:layout=${layout}`, path.join(footage.dir, 'wall.png'));
const total = Number(execFileSync('bash', ['-c', `find "${SHOTS}" -name '*.png' | wc -l`]).toString().trim());
footage.extras.wall = { file: 'wall.png', cols: WALL_COLS, rows: WALL_ROWS, cellW: CELL_W, cellH: CELL_H, total, desktop: desktop.length };
console.log(`  wall: ${picks.length} of ${desktop.length} desktop screenshots (${total} PNGs in docs/screenshots)`);

// ------------------------------------------------------------------ 2. the public GitHub repo

const { browser, page } = await launch({ hide: ['.js-notification-shelf', 'header .Header-old', '[data-testid="cookie-consent-banner"]'] });
try {
  await page.goto(`${GITHUB}/commits/main`);
  const rows = page.locator('[data-testid="commit-row-item"]');
  await rows.first().waitFor({ timeout: 30_000 });
  await settle(page, 1500);
  const count = await rows.count();
  if (count < 10) throw new Error(`only ${count} commits listed`);
  await footage.shot(page, 'gh-commits', {
    list: page.locator('[data-testid="commit-group-title"]').first().locator('xpath=ancestor::div[2]'),
    first: rows.first(),
    group: page.locator('[data-testid="commit-group-title"]').first(),
  }, { fullPage: true, maxHeight: 2600 });

  await page.goto(`${GITHUB}/blob/main/STEERING.md`);
  const article = page.locator('article.markdown-body');
  await article.waitFor({ timeout: 30_000 });
  await settle(page, 1500);
  const order = article.getByRole('heading', { name: 'Current order' });
  const list = order.locator('xpath=following-sibling::*[local-name()="ol"][1] | ../following-sibling::*[local-name()="ol"][1]').first();
  await scrollTo(page, order, 150);
  await footage.shot(page, 'gh-order', { heading: order, list, intro: order.locator('xpath=(following::p)[1]') });

  const ack = article.locator('p', { hasText: /^ack: 2026-11-0\d item \d+.*iteration \d+/ }).first();
  if (!(await ack.count())) throw new Error('no ack line with an iteration number found in STEERING.md');
  await scrollTo(page, ack, 380);
  const acks = ack.locator('xpath=self::p | following-sibling::p[starts-with(normalize-space(.), "ack:")]');
  await footage.shot(page, 'gh-ack', { ack, second: acks.nth(1), heading: ack.locator('xpath=preceding::*[self::h2 or self::h3][1]') });
  footage.save();
} finally {
  await browser.close();
}

async function scrollTo(page: Page, locator: ReturnType<Page['locator']>, top: number) {
  const y = await locator.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((to) => window.scrollTo(0, to), Math.max(0, y - top));
  await page.waitForTimeout(600);
}
