#!/usr/bin/env bun
// Static slides from an edit: a still at every stop (Scene.stops()), the narration as speaker notes.
//   bun scripts/slides.ts --edit <name> [--out out/slides-<name>] [--builds] [--threshold 0.1]
// Writes, in <out>/:
//   slides/NN.jpg, slides.json   the stills (1920×1080) and, per slide, its time, scene and notes
//   index.html                   a deck that needs nothing but the images: ←/→, s for notes; prints one slide a page
//   deck.pdf                     the slides, one a page (printed from index.html)
//   deck.pptx                    PowerPoint with the notes; Keynote and Google Slides open it too
// By default a stop that only adds a little to the next one in its scene (a build step) folds into it
// (slides-plan.ts); --builds keeps every stop. The notes are the captions scripts/audio.ts wrote, when
// it has run: each line in its written form.
import pptxgen from 'pptxgenjs';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openApp } from './lib';
import { plan, type Shot, type Spoken } from './slides-plan';

const argv = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(import.meta.dir, '..');
const EDIT = opt('edit');
if (!EDIT) throw new Error('--edit <name> is required');
const OUT = path.resolve(opt('out', path.join(ROOT, `out/slides-${EDIT}`))!);
const THUMB = { w: 480, h: 270 }; // fine enough that a line of text registers

const { browser, page, stop } = await openApp({ edit: EDIT });
try {
  const video: { title: string; stops: { t: number; scene: string }[]; narration: { at: number; text: string; caption?: string }[] } =
    await page.evaluate(() => { const V = (window as any).__video; return { title: V.title, stops: V.stops, narration: V.narration }; });
  if (!video.stops.length) throw new Error(`${EDIT} has no stops`);
  const captions = path.join(ROOT, `out/audio-${EDIT}/captions.json`);
  const spoken: Spoken[] = existsSync(captions)
    ? (await Bun.file(captions).json()).map((c: { at: number; text: string }) => ({ at: c.at, text: c.text }))
    : video.narration.map((l) => ({ at: l.at, text: l.caption ?? l.text }));

  // ---------------------------------------------------------------- which stops are slides
  const shots: Shot[] = [];
  for (const s of video.stops) {
    const grey: number[] = await page.evaluate(async ({ t, w, h }) => {
      await (window as any).__video.still(t);
      const small = new OffscreenCanvas(w, h);
      const g = small.getContext('2d')!;
      g.drawImage(document.getElementById('c') as HTMLCanvasElement, 0, 0, w, h);
      const px = g.getImageData(0, 0, w, h).data;
      return Array.from({ length: w * h }, (_, i) => Math.round(0.2126 * px[i * 4]! + 0.7152 * px[i * 4 + 1]! + 0.0722 * px[i * 4 + 2]!));
    }, { t: s.t, ...THUMB });
    shots.push({ ...s, thumb: Uint8Array.from(grey) });
  }
  const slides = plan(shots, spoken, { builds: argv.includes('--builds'), threshold: +opt('threshold', '0.1')! });

  // ---------------------------------------------------------------- the stills
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(path.join(OUT, 'slides'), { recursive: true });
  const name = (i: number) => `slides/${String(i + 1).padStart(2, '0')}.jpg`;
  for (const [i, slide] of slides.entries()) {
    const jpeg: string = await page.evaluate(async (t) => {
      await (window as any).__video.still(t);
      return (document.getElementById('c') as HTMLCanvasElement).toDataURL('image/jpeg', 0.92).split(',')[1]!;
    }, slide.t);
    await Bun.write(path.join(OUT, name(i)), Buffer.from(jpeg, 'base64'));
  }
  const deck = { title: video.title, edit: EDIT, slides: slides.map((s, i) => ({ n: i + 1, file: name(i), t: +s.t.toFixed(3), scene: s.scene, notes: s.notes })) };
  await Bun.write(path.join(OUT, 'slides.json'), JSON.stringify(deck, null, 1));

  // ---------------------------------------------------------------- HTML, then PDF from it
  await Bun.write(path.join(OUT, 'index.html'), html(deck));
  await page.goto(`file://${path.join(OUT, 'index.html')}`);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: path.join(OUT, 'deck.pdf'), preferCSSPageSize: true, printBackground: true });

  // ---------------------------------------------------------------- PowerPoint (and so Keynote, Google Slides)
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 × 7.5 in, 16:9
  pptx.title = deck.title;
  for (const slide of deck.slides) {
    const s = pptx.addSlide();
    s.addImage({ path: path.join(OUT, slide.file), x: 0, y: 0, w: 13.333, h: 7.5 });
    if (slide.notes.length) s.addNotes(slide.notes.join('\n\n'));
  }
  await pptx.writeFile({ fileName: path.join(OUT, 'deck.pptx') });

  console.log(`${deck.slides.length} slides from ${video.stops.length} stops (${EDIT}) → ${OUT}: index.html, deck.pdf, deck.pptx, slides/`);
} finally {
  await browser.close();
  stop();
}

/** The deck as one page: a slide at a time on screen, all of them (one a page) in print. */
function html(deck: { title: string; slides: { n: number; file: string; notes: string[] }[] }) {
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
