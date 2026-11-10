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
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openApp } from './lib';
import { deckOf, html, printPdf, slideFile, slidesOptions, spokenLines, writePptx } from './slides-deck';
import { plan, type Shot } from './slides-plan';

const ROOT = path.resolve(import.meta.dir, '..');
const { edit: EDIT, out: OUT, builds: BUILDS, threshold: THRESHOLD } = slidesOptions(process.argv.slice(2), ROOT);
const THUMB = { w: 480, h: 270 }; // fine enough that a line of text registers

const { browser, page, stop } = await openApp({ edit: EDIT });
try {
  const video: { title: string; stops: { t: number; scene: string }[]; narration: { at: number; text: string; caption?: string }[] } =
    await page.evaluate(() => { const V = (window as any).__video; return { title: V.title, stops: V.stops, narration: V.narration }; });
  if (!video.stops.length) throw new Error(`${EDIT} has no stops`);
  const captions = path.join(ROOT, `out/audio-${EDIT}/captions.json`);
  const spoken = spokenLines(existsSync(captions) ? await Bun.file(captions).json() : undefined, video.narration);

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
  const slides = plan(shots, spoken, { builds: BUILDS, threshold: THRESHOLD });

  // ---------------------------------------------------------------- the stills
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(path.join(OUT, 'slides'), { recursive: true });
  for (const [i, slide] of slides.entries()) {
    const jpeg: string = await page.evaluate(async (t) => {
      await (window as any).__video.still(t);
      return (document.getElementById('c') as HTMLCanvasElement).toDataURL('image/jpeg', 0.92).split(',')[1]!;
    }, slide.t);
    await Bun.write(path.join(OUT, slideFile(i)), Buffer.from(jpeg, 'base64'));
  }
  const deck = deckOf(video.title, EDIT, slides);
  await Bun.write(path.join(OUT, 'slides.json'), JSON.stringify(deck, null, 1));

  // ---------------------------------------------------------------- HTML, then PDF from it
  await Bun.write(path.join(OUT, 'index.html'), html(deck));
  await printPdf(page, OUT);

  // ---------------------------------------------------------------- PowerPoint (and so Keynote, Google Slides)
  await writePptx(deck, OUT);

  console.log(`${deck.slides.length} slides from ${video.stops.length} stops (${EDIT}) → ${OUT}: index.html, deck.pdf, deck.pptx, slides/`);
} finally {
  await browser.close();
  stop();
}
