#!/usr/bin/env bun
// Offline renderer. Drives the app in headless Chrome (?export=1) and either
//   stills:  bun scripts/render.ts stills --t 1.5,8,12.25 [--only id1,id2] [--out dir]
//   sheet:   bun scripts/render.ts sheet --from 0 --to 25 [--n 16] [--cols 4] [--only ids] [--out file.png]   (or --times a,b,c | --cuts)
//   video:   bun scripts/render.ts video [--from 0] [--to <end>] [--fps 60] [--crf 16] [--samples 1] [--shutter 0.5] [--audio out/audio-<edit>/mix.wav] [--out out/<edit>.mp4]
//            --samples N averages N sub-frames per frame over shutter × (1 / fps): motion blur on camera moves
//   --scale 2 (all modes): a true 3840x2160 render; the layout is the same, only sharper.
//   --edit <name> (all modes): which edit (app/src/timeline.ts EDITS); default the first one registered.
// Uses the Vite server at --url (default http://localhost:5180); starts a private one without live
// reload if it is unreachable.
import type { Page } from 'playwright-core';
import { openApp } from './lib';
import { analyzeJumps, frameCount, renderOptions, sheetTimes, stillName, stillTimes, videoArgs } from './render-lib';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const { mode, scale: SCALE, width: OW, height: OH, samples: SAMPLES, shutter: SHUTTER, opt, flag } = renderOptions(process.argv.slice(2));

async function png(page: Page, file: string) {
  await Bun.write(file, Buffer.from(await page.evaluate(() => (window as any).__video.png()), 'base64'));
}

async function stills(page: Page, times: number[], outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  for (const t of times) {
    await page.evaluate(([t, s, sh]) => (window as any).__video.still(t, s, sh), [t, SAMPLES, SHUTTER] as const);
    const file = path.join(outDir, stillName(t));
    await png(page, file);
    files.push(file);
  }
  return files;
}

async function sheet(page: Page, times: number[], cols: number, out: string) {
  const dataUrl: string = await page.evaluate(async ({ times, cols }) => {
    const V = (window as any).__video;
    const cw = 480, ch = 270, pad = 4, lab = 18;
    const rows = Math.ceil(times.length / cols);
    const sheet = document.createElement('canvas');
    sheet.width = cols * (cw + pad) + pad;
    sheet.height = rows * (ch + lab + pad) + pad;
    const c = sheet.getContext('2d')!;
    c.fillStyle = '#222';
    c.fillRect(0, 0, sheet.width, sheet.height);
    const src = document.getElementById('c') as HTMLCanvasElement;
    for (const [i, t] of times.entries()) {
      await V.still(t);
      const x = pad + (i % cols) * (cw + pad), y = pad + Math.floor(i / cols) * (ch + lab + pad);
      c.drawImage(src, x, y + lab, cw, ch);
      c.fillStyle = '#ddd';
      c.font = '13px monospace';
      c.fillText(`${t.toFixed(2)}s`, x + 2, y + 13);
    }
    return sheet.toDataURL('image/png');
  }, { times, cols });
  mkdirSync(path.dirname(out), { recursive: true });
  await Bun.write(out, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
}

async function video(page: Page, from: number, to: number, fps: number, out: string) {
  mkdirSync(path.dirname(out), { recursive: true });
  const audio = opt('audio');
  const args = videoArgs({ width: OW, height: OH, fps, from, to, audio, preset: opt('preset'), crf: opt('crf'), out });
  const ff = Bun.spawn(args, { stdin: 'pipe', stdout: 'inherit', stderr: 'inherit' });
  let frames = 0;
  const total = frameCount(from, to, fps);
  const t0 = performance.now();
  const server = Bun.serve({
    port: 0,
    fetch(req, srv) { return srv.upgrade(req) ? undefined : new Response('ws only', { status: 400 }); },
    websocket: {
      maxPayloadLength: OW * OH * 4 + 1024,
      async message(ws, msg) {
        ff.stdin.write(msg as Uint8Array);
        await ff.stdin.flush();
        frames++;
        ws.send(String(frames));
        if (frames % 60 === 0 || frames === total) {
          const elapsed = (performance.now() - t0) / 1000;
          process.stdout.write(`\r${frames}/${total} frames  ${(frames / elapsed).toFixed(1)} fps  eta ${((total - frames) / (frames / elapsed)).toFixed(0)}s   `);
        }
      },
    },
  });
  await page.evaluate((o) => (window as any).__video.stream(o), { from, to, fps, ws: `ws://localhost:${server.port}`, samples: SAMPLES, shutter: SHUTTER, inflight: 4 });
  while (frames < total) await Bun.sleep(20);
  ff.stdin.end();
  await ff.exited;
  server.stop();
  console.log(`\nwrote ${out} (${frames} frames in ${((performance.now() - t0) / 1000).toFixed(1)}s)`);
}

const { browser, page, logs, stop } = await openApp({ edit: opt('edit'), only: opt('only'), scale: SCALE, url: opt('url'), headed: flag('headed') });
try {
  if (mode === 'stills') {
    const times = stillTimes(opt('t'));
    console.log((await stills(page, times, opt('out', path.join(ROOT, 'out/stills'))!)).join('\n'));
  } else if (mode === 'sheet') {
    const from = +opt('from', '0')!, to = +opt('to', '10')!, n = +opt('n', '12')!;
    const timeline: { start: number }[] | undefined = flag('cuts') ? await page.evaluate(() => (window as any).__video.timeline) : undefined;
    const times = sheetTimes({ from, to, n, times: opt('times'), cuts: timeline });
    const out = opt('out', path.join(ROOT, `out/sheets/sheet_${from}-${to}.png`))!;
    await sheet(page, times, +opt('cols', '4')!, out);
    console.log(out);
  } else if (mode === 'jumps') {
    // Motion QA for what stills can't show: the mean change between consecutive 60 fps frames
    // (on a 240x135 thumbnail). A pop is a frame that changes far more than its neighbours do.
    const from = +opt('from', '0')!, to = +opt('to', '10')!;
    const diffs: number[] = await page.evaluate(async ({ from, to }) => {
      const V = (window as any).__video;
      const thumb = new OffscreenCanvas(240, 135).getContext('2d', { willReadFrequently: true })!;
      const src = document.getElementById('c') as HTMLCanvasElement;
      let previous: Uint8ClampedArray | null = null;
      const out: number[] = [];
      for (let n = Math.round(from * 60); n < Math.round(to * 60); n++) {
        await V.still(n / 60);
        thumb.drawImage(src, 0, 0, 240, 135);
        const pixels = thumb.getImageData(0, 0, 240, 135).data;
        if (previous) {
          let sum = 0;
          for (let i = 0; i < pixels.length; i += 4) sum += Math.abs(pixels[i]! - previous[i]!) + Math.abs(pixels[i + 1]! - previous[i + 1]!) + Math.abs(pixels[i + 2]! - previous[i + 2]!);
          out.push(sum / (240 * 135 * 3));
        }
        previous = pixels;
      }
      return out;
    }, { from, to });
    console.log(analyzeJumps(diffs, from).join('\n'));
  } else if (mode === 'video') {
    const duration: number = await page.evaluate(() => (window as any).__video.duration);
    await video(page, +opt('from', '0')!, +opt('to', String(duration))!, +opt('fps', '60')!, path.resolve(opt('out', path.join(ROOT, `out/${opt('edit') ?? 'video'}.mp4`))!));
  }
  if (logs.length) console.error('BROWSER LOG:\n' + logs.slice(0, 40).join('\n'));
} finally {
  await browser.close();
  stop();
}
