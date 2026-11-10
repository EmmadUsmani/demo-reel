// The parts of scripts/slides.ts that decide things: the flags, which lines become notes, slides.json, the HTML
// deck, the PowerPoint. Kept apart from the browser work so they can be tested (slides.test.ts).
import pptxgen from 'pptxgenjs';
import type { Page } from 'playwright-core';
import path from 'node:path';
import { parseArgs } from './lib';
import type { Slide, Spoken } from './slides-plan';

export type SlidesOptions = { edit: string; out: string; builds: boolean; threshold: number };

/** What `slides.ts --edit <name> [--out dir] [--builds] [--threshold 0.1]` means, under the repo at `root`. */
export function slidesOptions(argv: string[], root: string): SlidesOptions {
  const { opt, flag } = parseArgs(argv);
  const edit = opt('edit');
  if (!edit) throw new Error('--edit <name> is required');
  return { edit, out: path.resolve(opt('out', path.join(root, `out/slides-${edit}`))!), builds: flag('builds'), threshold: +opt('threshold', '0.1')! };
}

/**
 * What is said, with the time it starts: the captions scripts/audio.ts wrote when it has run (each line as
 * written for the screen, timed to its speech), otherwise the narration the app declares (caption, else text).
 */
export function spokenLines(captions: { at: number; text: string }[] | undefined, narration: { at: number; text: string; caption?: string }[]): Spoken[] {
  return captions ? captions.map((c) => ({ at: c.at, text: c.text })) : narration.map((l) => ({ at: l.at, text: l.caption ?? l.text }));
}

/** A slide's image, relative to the deck folder: slides/01.jpg for the first. */
export const slideFile = (i: number) => `slides/${String(i + 1).padStart(2, '0')}.jpg`;

export type DeckSlide = { n: number; file: string; t: number; scene: string; notes: string[] };
export type Deck = { title: string; edit: string; slides: DeckSlide[] };

/** slides.json: the deck's title and edit, and per slide its number, image, time (to the ms), scene and notes. */
export function deckOf(title: string, edit: string, slides: Slide[]): Deck {
  return { title, edit, slides: slides.map((s, i) => ({ n: i + 1, file: slideFile(i), t: +s.t.toFixed(3), scene: s.scene, notes: s.notes })) };
}

/** The deck as a PDF, one slide a page, printed from its own index.html. */
export async function printPdf(page: Page, out: string) {
  await page.goto(`file://${path.join(out, 'index.html')}`);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: path.join(out, 'deck.pdf'), preferCSSPageSize: true, printBackground: true });
}

/** deck.pptx: PowerPoint, 16:9, the image full-bleed on each slide and its notes (paragraphs apart) as the speaker notes. */
export async function writePptx(deck: Deck, out: string) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 × 7.5 in, 16:9
  pptx.title = deck.title;
  for (const slide of deck.slides) {
    const s = pptx.addSlide();
    s.addImage({ path: path.join(out, slide.file), x: 0, y: 0, w: 13.333, h: 7.5 });
    if (slide.notes.length) s.addNotes(slide.notes.join('\n\n'));
  }
  await pptx.writeFile({ fileName: path.join(out, 'deck.pptx') });
}

/** The deck as one page: a slide at a time on screen, all of them (one a page) in print. */
export function html(deck: Pick<Deck, 'title'> & { slides: Pick<DeckSlide, 'n' | 'file' | 'notes'>[] }) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(deck.title)}</title>
<style>
  html, body { margin: 0; height: 100%; background: #0c0c14; color: #e4e4f2; font: 15px/1.5 system-ui, sans-serif; }
  .deck { position: fixed; inset: 0; display: flex; flex-direction: column; }
  .stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; container-type: size; }
  .stage img { width: min(100cqw, 177.78cqh); aspect-ratio: 16 / 9; display: block; cursor: pointer; }
  .bar { display: flex; align-items: center; gap: 14px; padding: 8px 16px; background: #101020; }
  .bar button { font: inherit; color: inherit; background: none; border: 1px solid #3a3a64; border-radius: 6px; padding: 3px 10px; cursor: pointer; }
  .bar button[aria-pressed='true'] { background: #e4e4f2; color: #14142b; }
  .bar .count { font-variant-numeric: tabular-nums; min-width: 70px; text-align: center; }
  .bar .title { color: #8b8fc0; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .notes { max-height: 26vh; overflow: auto; padding: 12px 20px; background: #14142b; border-top: 1px solid #26264a; font-size: 17px; }
  .notes p { margin: 0 0 6px; max-width: 90ch; }
  .notes[hidden], .print { display: none; }
  @page { size: 1920px 1080px; margin: 0; }
  @media print {
    html, body { background: #fff; height: auto; }
    .deck { display: none; }
    .print { display: block; }
    .print img { display: block; width: 1920px; height: 1080px; break-after: page; }
  }
</style>
</head>
<body>
<div class="deck">
  <div class="stage"><img alt=""></div>
  <div class="bar">
    <button class="prev" aria-label="Previous slide">‹</button><span class="count"></span><button class="next" aria-label="Next slide">›</button>
    <span class="title">${esc(deck.title)}</span>
    <button class="toggle" aria-pressed="false" title="Speaker notes (s)">Notes</button>
  </div>
  <div class="notes" hidden></div>
</div>
<div class="print">${deck.slides.map((s) => `<img src="${s.file}" alt="Slide ${s.n}">`).join('')}</div>
<script>
  const slides = ${JSON.stringify(deck.slides.map((s) => ({ file: s.file, notes: s.notes })))};
  const $ = (s) => document.querySelector(s);
  const fromHash = () => Math.min(slides.length, Math.max(1, parseInt(location.hash.slice(1)) || 1)) - 1;
  let k = fromHash();
  const show = () => {
    $('.stage img').src = slides[k].file;
    $('.stage img').alt = 'Slide ' + (k + 1);
    $('.count').textContent = (k + 1) + ' / ' + slides.length;
    $('.notes').replaceChildren(...(slides[k].notes.length ? slides[k].notes : ['No narration on this slide.']).map((t) => Object.assign(document.createElement('p'), { textContent: t })));
    history.replaceState(null, '', '#' + (k + 1));
    if (slides[k + 1]) new Image().src = slides[k + 1].file;
  };
  const go = (n) => { k = Math.min(slides.length - 1, Math.max(0, n)); show(); };
  const notes = () => { const on = $('.notes').hidden; $('.notes').hidden = !on; $('.toggle').setAttribute('aria-pressed', on); };
  $('.prev').onclick = () => go(k - 1);
  $('.next').onclick = $('.stage img').onclick = () => go(k + 1);
  $('.toggle').onclick = notes;
  addEventListener('hashchange', () => { if (fromHash() !== k) go(fromHash()); });
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ([' ', 'ArrowRight', 'PageDown', 'Enter'].includes(e.key)) go(k + 1);
    else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) go(k - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(slides.length - 1);
    else if (e.key === 's') notes();
    else return;
    e.preventDefault();
  });
  show();
</script>
</body>
</html>
`;
}
