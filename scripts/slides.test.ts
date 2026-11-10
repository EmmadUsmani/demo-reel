import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { deckOf, html, printPdf, slideFile, slidesOptions, spokenLines, writePptx, type Deck } from './slides-deck';
import { ffmpegTest, tempDir } from './test-support';

const ROOT = path.resolve(import.meta.dir, '..');
let tmp: ReturnType<typeof tempDir>;
beforeEach(() => { tmp = tempDir(); });
afterEach(() => tmp.remove());

// One headless Chrome for the tests that run the deck's page and print it; they skip, named, without Chrome.
const chrome = await chromium.launch({ channel: 'chrome' }).catch(() => undefined);
afterAll(() => chrome?.close());
const chromeTest = chrome ? test : test.skip;
if (!chrome) console.warn('Chrome not found: the slides tests that open the deck in a browser are skipped');

const deck = (notes: string[][] = [['First line.', 'Second line.'], [], ['Third.']], title = 'Demo'): Deck =>
  deckOf(title, 'demo', notes.map((n, i) => ({ t: 2 + i * 3.14159, scene: i < 2 ? 'a' : 'b', notes: n })));

/** Real (tiny) JPEGs for the deck's slides, at the paths the deck names. */
function writeImages(d: Deck) {
  for (const slide of d.slides) {
    mkdirSync(path.dirname(path.join(tmp.dir, slide.file)), { recursive: true });
    const made = Bun.spawnSync(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=0x${(slide.n * 3000000).toString(16).padStart(6, '0').slice(0, 6)}:s=192x108`, '-frames:v', '1', path.join(tmp.dir, slide.file)]);
    if (made.exitCode !== 0) throw new Error(`ffmpeg: ${made.stderr}`);
  }
}

describe('slidesOptions', () => {
  test('names the edit, its output folder, and the build and threshold settings', () => {
    expect(slidesOptions(['--edit', 'vite'], '/repo')).toEqual({ edit: 'vite', out: '/repo/out/slides-vite', builds: false, threshold: 0.1 });
  });

  test('--out, --builds and --threshold are read', () => {
    expect(slidesOptions(['--edit', 'vite', '--out', '/tmp/deck', '--builds', '--threshold', '0.25'], '/repo')).toEqual({ edit: 'vite', out: '/tmp/deck', builds: true, threshold: 0.25 });
  });

  test('requires --edit', () => {
    expect(() => slidesOptions([], '/repo')).toThrow('--edit <name> is required');
    expect(() => slidesOptions(['--builds'], '/repo')).toThrow('--edit <name> is required');
  });

  test('slides.ts without --edit fails at once', () => {
    const result = Bun.spawnSync(['bun', 'scripts/slides.ts'], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('--edit <name> is required');
  });
});

describe('spokenLines', () => {
  const narration = [{ at: 1, text: 'Twenty twenty six', caption: '2026' }, { at: 4, text: 'Plain.' }];

  test("uses the captions audio.ts wrote when there are some, timed as they are", () => {
    expect(spokenLines([{ at: 1.25, text: '2026' }, { at: 4.5, text: 'Plain.' }], narration)).toEqual([{ at: 1.25, text: '2026' }, { at: 4.5, text: 'Plain.' }]);
  });

  test('otherwise the narration the app declares: the caption where a line has one, else what is said', () => {
    expect(spokenLines(undefined, narration)).toEqual([{ at: 1, text: '2026' }, { at: 4, text: 'Plain.' }]);
  });

  test('drops the captions\' other fields', () => {
    expect(spokenLines([{ at: 1, text: 'x', id: 'a', scene: 's', end: 2 } as any], [])).toEqual([{ at: 1, text: 'x' }]);
  });
});

describe('slideFile and deckOf', () => {
  test('slide images are numbered from 01, two digits wide', () => {
    expect([0, 8, 9, 98, 99].map(slideFile)).toEqual(['slides/01.jpg', 'slides/09.jpg', 'slides/10.jpg', 'slides/99.jpg', 'slides/100.jpg']);
  });

  test('slides.json has the title, the edit, and per slide its number, image, time, scene and notes', () => {
    expect(deckOf('My video', 'my-edit', [{ t: 3.14159265, scene: 'intro', notes: ['hi'] }, { t: 7, scene: 'main', notes: [] }])).toEqual({
      title: 'My video',
      edit: 'my-edit',
      slides: [
        { n: 1, file: 'slides/01.jpg', t: 3.142, scene: 'intro', notes: ['hi'] },
        { n: 2, file: 'slides/02.jpg', t: 7, scene: 'main', notes: [] },
      ],
    });
  });

  test('keeps the key order the file has always had, and survives JSON', () => {
    const slides = deck().slides;
    expect(Object.keys(slides[0]!)).toEqual(['n', 'file', 't', 'scene', 'notes']);
    expect(JSON.parse(JSON.stringify(deck()))).toEqual(deck());
  });
});

describe('html', () => {
  /** The slides array the page embeds in its script. */
  const embedded = (page: string) => JSON.parse(/const slides = ([\s\S]*?);\n  const \$ =/.exec(page)![1]!);

  test('is a complete page titled with the deck', () => {
    const page = html(deck());
    expect(page).toStartWith('<!doctype html>\n<html lang="en">');
    expect(page).toContain('<title>Demo</title>');
    expect(page).toContain('<span class="title">Demo</span>');
    expect(page.trimEnd()).toEndWith('</html>');
  });

  test('has a print copy: every slide an image, in order, with its number as alt text', () => {
    const page = html(deck());
    const printed = [...page.matchAll(/<img src="([^"]+)" alt="Slide (\d+)">/g)].map((m) => [m[1], m[2]]);
    expect(printed).toEqual([['slides/01.jpg', '1'], ['slides/02.jpg', '2'], ['slides/03.jpg', '3']]);
  });

  test("embeds each slide's image and notes for the page's own script, and nothing else", () => {
    expect(embedded(html(deck()))).toEqual([{ file: 'slides/01.jpg', notes: ['First line.', 'Second line.'] }, { file: 'slides/02.jpg', notes: [] }, { file: 'slides/03.jpg', notes: ['Third.'] }]);
  });

  test('escapes the title in the page', () => {
    const page = html(deck(undefined, 'A & B <i>"quoted"</i>'));
    expect(page).toContain('<title>A &#38; B &#60;i&#62;&#34;quoted&#34;&#60;/i&#62;</title>');
    expect(page).not.toContain('<i>');
  });

  test('notes with quotes, angle brackets and script tags stay data, not markup', () => {
    const nasty = ['She said "hi" & left', '</script><img src=x onerror=alert(1)>', '<!-- not a comment', '  line separator'];
    const page = html(deck([nasty]));
    expect(embedded(page)[0].notes).toEqual(nasty);
    expect(page.split('</script>')).toHaveLength(2); // the page's own closing tag, and no other
    expect(page).not.toContain('<img src=x');
  });

  chromeTest('shows the first slide, steps with the arrow keys, and clamps at both ends', async () => {
    const d = deck();
    writeImages(d);
    await Bun.write(path.join(tmp.dir, 'index.html'), html(d));
    const page = await chrome!.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(`file://${path.join(tmp.dir, 'index.html')}`);
      const state = () => page.evaluate(() => ({ count: document.querySelector('.count')!.textContent, src: document.querySelector<HTMLImageElement>('.stage img')!.getAttribute('src'), hash: location.hash }));
      expect(await state()).toEqual({ count: '1 / 3', src: 'slides/01.jpg', hash: '#1' });
      await page.keyboard.press('ArrowLeft');
      expect((await state()).count).toBe('1 / 3');
      await page.keyboard.press('ArrowRight');
      expect(await state()).toEqual({ count: '2 / 3', src: 'slides/02.jpg', hash: '#2' });
      await page.keyboard.press('End');
      expect((await state()).count).toBe('3 / 3');
      await page.keyboard.press('Space');
      expect((await state()).count).toBe('3 / 3');
      await page.keyboard.press('Home');
      expect((await state()).count).toBe('1 / 3');
      await page.click('.next');
      expect((await state()).count).toBe('2 / 3');
      await page.click('.prev');
      expect((await state()).count).toBe('1 / 3');
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  chromeTest('opens on the slide in the address (#3), and clamps a hash outside the deck', async () => {
    const d = deck();
    writeImages(d);
    await Bun.write(path.join(tmp.dir, 'index.html'), html(d));
    const page = await chrome!.newPage();
    try {
      const count = () => page.evaluate(() => document.querySelector('.count')!.textContent);
      await page.goto(`file://${path.join(tmp.dir, 'index.html')}#3`);
      expect(await count()).toBe('3 / 3');
      await page.goto(`file://${path.join(tmp.dir, 'index.html')}#99`);
      expect(await count()).toBe('3 / 3');
    } finally {
      await page.close();
    }
  });

  chromeTest('s shows the speaker notes, a paragraph a line, and says so when a slide has none', async () => {
    const d = deck();
    writeImages(d);
    await Bun.write(path.join(tmp.dir, 'index.html'), html(d));
    const page = await chrome!.newPage();
    try {
      await page.goto(`file://${path.join(tmp.dir, 'index.html')}`);
      const notes = () => page.evaluate(() => ({ hidden: document.querySelector<HTMLElement>('.notes')!.hidden, paragraphs: [...document.querySelectorAll('.notes p')].map((p) => p.textContent), pressed: document.querySelector('.toggle')!.getAttribute('aria-pressed') }));
      expect((await notes()).hidden).toBe(true);
      await page.keyboard.press('s');
      expect(await notes()).toEqual({ hidden: false, paragraphs: ['First line.', 'Second line.'], pressed: 'true' });
      await page.keyboard.press('ArrowRight');
      expect((await notes()).paragraphs).toEqual(['No narration on this slide.']);
      await page.keyboard.press('s');
      expect((await notes()).hidden).toBe(true);
    } finally {
      await page.close();
    }
  });

  chromeTest('a note that closes a script tag still shows up as text', async () => {
    const d = deck([['before </script><b>bold</b> after']]);
    writeImages(d);
    await Bun.write(path.join(tmp.dir, 'index.html'), html(d));
    const page = await chrome!.newPage();
    try {
      await page.goto(`file://${path.join(tmp.dir, 'index.html')}`);
      await page.keyboard.press('s');
      expect(await page.evaluate(() => document.querySelector('.notes')!.textContent)).toBe('before </script><b>bold</b> after');
    } finally {
      await page.close();
    }
  });
});

describe('printPdf', () => {
  const pdfinfo = !!Bun.which('pdfinfo');
  const pdfTest = chrome && pdfinfo && Bun.which('ffmpeg') ? test : test.skip;
  if (chrome && !pdfinfo) console.warn('pdfinfo not found: the PDF test is skipped');

  pdfTest('prints one 1920x1080 px page per slide', async () => {
    const d = deck();
    writeImages(d);
    await Bun.write(path.join(tmp.dir, 'index.html'), html(d));
    const page = await chrome!.newPage();
    try {
      await printPdf(page, tmp.dir);
    } finally {
      await page.close();
    }
    const info = Bun.spawnSync(['pdfinfo', path.join(tmp.dir, 'deck.pdf')]).stdout.toString();
    expect(info).toMatch(/Pages:\s+3\b/);
    expect(info).toMatch(/Page size:\s+1440 x 810 pts/); // 1920 x 1080 CSS px
  });
});

describe('writePptx', () => {
  const unzip = !!Bun.which('unzip');
  const pptxTest = unzip && Bun.which('ffmpeg') ? test : test.skip;
  if (!unzip) console.warn('unzip not found: the PowerPoint test is skipped');
  const inside = (file: string, entry?: string) => Bun.spawnSync(entry ? ['unzip', '-p', file, entry] : ['unzip', '-Z1', file]).stdout.toString();

  /** The text of a notes slide, apart from its slide number. */
  const notesText = (file: string, n: number) => [...inside(file, `ppt/notesSlides/notesSlide${n}.xml`).matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]!.replaceAll('\r\n', '\n')).filter((t) => t !== String(n)).join('');

  pptxTest('has a 16:9 slide per image, with each slide\'s own notes (empty where it has none)', async () => {
    const d = deck([['First.', 'Second.'], [], ['Third & last.']], 'Deck <title>');
    writeImages(d);
    await writePptx(d, tmp.dir);
    const file = path.join(tmp.dir, 'deck.pptx');
    const entries = inside(file).split('\n');
    expect(entries.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e))).toHaveLength(3);
    expect(entries.filter((e) => /^ppt\/media\/.+/.test(e))).toHaveLength(3);
    expect(inside(file, 'ppt/presentation.xml')).toContain('<p:sldSz cx="12192000" cy="6858000"'); // 13.333 x 7.5 in
    expect(inside(file, 'docProps/core.xml')).toContain('Deck &lt;title&gt;');
    expect(notesText(file, 1)).toBe('First.\n\nSecond.');
    expect(notesText(file, 2)).toBe('');
    expect(notesText(file, 3)).toBe('Third &amp; last.');
  }, 30_000);

  // pptxgenjs writes a multi-line note as ONE <a:t> holding newlines; PowerPoint treats those as spaces, so the
  // lines of a slide's notes probably run together. Unverified without PowerPoint or Keynote at hand.
  test.todo('speaker notes keep one paragraph per narration line in PowerPoint');
});
