// scripts/slides.ts end to end: the stills, the static HTML deck, the PDF and the PowerPoint.
import { beforeAll, describe, expect, test } from 'bun:test';
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { EDIT, ROOT } from './harness';

const OUT = path.join(ROOT, 'out', `e2e-slides-${EDIT}`);
type Deck = { title: string; slides: { n: number; file: string; t: number; scene: string; notes: string[] }[] };
let deck: Deck;

beforeAll(() => {
  const run = Bun.spawnSync(['bun', 'scripts/slides.ts', '--edit', EDIT, '--out', OUT], { cwd: ROOT, stderr: 'pipe', stdout: 'pipe' });
  if (run.exitCode !== 0) throw new Error(`slides.ts failed:\n${run.stderr}`);
}, 240_000);

const sh = (cmd: string[]) => new TextDecoder().decode(Bun.spawnSync(cmd, { cwd: OUT }).stdout);

describe('static slides', () => {
  test('a still for every slide, in order, with every narration line in exactly one slide', async () => {
    deck = await Bun.file(path.join(OUT, 'slides.json')).json();
    expect(deck.slides.length).toBeGreaterThan(20);
    for (const slide of deck.slides) expect(existsSync(path.join(OUT, slide.file))).toBe(true);
    const times = deck.slides.map((s) => s.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    const captions: { text: string }[] = await Bun.file(path.join(ROOT, `out/audio-${EDIT}/captions.json`)).json();
    expect(deck.slides.flatMap((s) => s.notes)).toEqual(captions.map((c) => c.text));
  });

  test('the stills are full 1920×1080 frames', () => {
    const probe = sh(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', deck.slides[0]!.file]);
    expect(probe.trim()).toBe('1920,1080');
  });

  test('the PDF has a 16:9 page per slide', () => {
    const info = sh(['pdfinfo', 'deck.pdf']);
    expect(info).toMatch(new RegExp(`Pages:\\s+${deck.slides.length}\\n`));
    const [, w, h] = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(info)!;
    expect(+w! / +h!).toBeCloseTo(16 / 9, 3);
  });

  test('the PowerPoint has a slide per slide, each with its notes', () => {
    const files = sh(['unzip', '-Z1', 'deck.pptx']).split('\n');
    expect(files.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length).toBe(deck.slides.length);
    const withNotes = deck.slides.filter((s) => s.notes.length);
    const sample = withNotes[Math.floor(withNotes.length / 2)]!;
    const xml = sh(['unzip', '-p', 'deck.pptx', `ppt/notesSlides/notesSlide${sample.n}.xml`]);
    expect(xml).toContain(sample.notes[0]!.replace(/&/g, '&amp;').replace(/</g, '&lt;').slice(0, 40));
  });

  test('the HTML deck pages through the slides and shows the notes', async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('requestfailed', (r) => problems.push(`failed: ${r.url()}`));
    await page.goto(`file://${path.join(OUT, 'index.html')}`);
    expect(await page.textContent('.count')).toBe(`1 / ${deck.slides.length}`);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await page.textContent('.count')).toBe(`3 / ${deck.slides.length}`);
    expect(await page.getAttribute('.stage img', 'src')).toBe(deck.slides[2]!.file);
    expect(await page.evaluate(() => (document.querySelector('.stage img') as HTMLImageElement).naturalWidth)).toBe(1920);
    await page.keyboard.press('s');
    expect(await page.textContent('.notes')).toContain(deck.slides[2]!.notes[0] ?? 'No narration');
    await page.keyboard.press('End');
    expect(await page.textContent('.count')).toBe(`${deck.slides.length} / ${deck.slides.length}`);
    await page.goto(`file://${path.join(OUT, 'index.html')}#5`);
    expect(await page.textContent('.count')).toBe(`5 / ${deck.slides.length}`);
    expect(problems).toEqual([]);
    await browser.close();
  }, 60_000);
});
