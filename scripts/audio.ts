#!/usr/bin/env bun
// The soundtrack: narration voiced with Kokoro plus synthesised sound effects, both placed by what
// the scenes declare (Scene.narration() and Scene.cues()), so every sound sits on its motion.
//   bun scripts/audio.ts [--edit <name>] [--voice af_heart] [--speed 1] [--out out/audio] [--force]
// Writes <out>/mix.wav (48 kHz stereo, -16 LUFS), the vo.wav and sfx.wav stems, and sheet.png
// (the stems against time, with every cue and line marked) for checking without listening. For the
// HTML player (scripts/build.ts) it also writes effects.wav (the effects alone at the mix's gain, not
// ducked: the soundtrack with the narration off) and captions.json (each line's on-screen text, timed
// to its speech).
// Refuses to mix when a narration line overruns its beat, unless --force.
import { KokoroTTS } from 'kokoro-js';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openApp } from './lib';
import {
  audioOptions, captionsFor, CEILING, clipFile, duckEnvelope, fitReport, limit, lufs, mixDown, RATE, readWav, renderEffects, resample, TARGET_LUFS,
  trimSpeech, voiceTrack, writeWav, type Clip, type Cue, type Line,
} from './audio-lib';

const ROOT = path.resolve(import.meta.dir, '..');
const { edit: EDIT, out: OUT, voice: VOICE, speed: SPEED, force: FORCE } = audioOptions(process.argv.slice(2), ROOT);

// ------------------------------------------------------------------ what the app declares

const { browser, page, stop } = await openApp({ edit: EDIT });
const declared: { cues: Cue[]; narration: Line[]; duration: number; timeline: { id: string; start: number; end: number }[] } =
  await page.evaluate(() => { const V = (window as any).__video; return { cues: V.cues, narration: V.narration, duration: V.duration, timeline: V.timeline }; });
await browser.close();
stop();
const { cues, narration, duration } = declared;
const N = Math.ceil(duration * RATE);
mkdirSync(path.join(OUT, 'vo'), { recursive: true });

// ------------------------------------------------------------------ narration

/** Kokoro's voice for each line (cached by line, voice, speed and text), trimmed to the speech. */
async function voice(lines: Line[]) {
  let tts: Awaited<ReturnType<typeof KokoroTTS.from_pretrained>> | null = null;
  const clips: Clip[] = [];
  for (const line of lines) {
    const file = clipFile(OUT, line, VOICE, SPEED);
    let raw: Float32Array, rate: number;
    if (existsSync(file)) ({ samples: raw, rate } = readWav(await Bun.file(file).arrayBuffer()));
    else {
      tts ??= await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });
      const audio = await tts.generate(line.text, { voice: VOICE as any, speed: SPEED });
      raw = audio.audio as Float32Array;
      rate = audio.sampling_rate;
      await Bun.write(file, writeWav([raw], rate));
    }
    const { samples, speech } = trimSpeech(raw, rate);
    clips.push({ line, samples: resample(samples, rate, RATE), speech });
  }
  return clips;
}

const clips = await voice(narration);
const fit = fitReport(clips, VOICE, SPEED);
console.log(fit.lines.join('\n'));
if (fit.overruns && !FORCE) {
  console.error(`\n${fit.overruns} line(s) overrun their beat: shorten the line or hold the beat longer (or --force).`);
  process.exit(1);
}

// ------------------------------------------------------------------ sound effects

const { L, R, counts } = renderEffects(cues, N);
console.log(`sfx: ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')}`);

// ------------------------------------------------------------------ mix

const vo = voiceTrack(clips, N);
const duck = duckEnvelope(clips, N);
const effectsL = L.slice(), effectsR = R.slice();
const [mixL, mixR] = mixDown(vo, L, R, duck);

// loudness: measure with ffmpeg's EBU R128 meter, apply the gain to the target, then a lookahead peak limiter
const probe = path.join(OUT, '.probe.wav');
await Bun.write(probe, writeWav([mixL, mixR], RATE));
const before = await lufs(probe);
rmSync(probe);
const gain = 10 ** ((TARGET_LUFS - before.integrated) / 20);
limit([mixL, mixR], gain, CEILING);
limit([effectsL, effectsR], gain, CEILING);

await Bun.write(path.join(OUT, 'mix.wav'), writeWav([mixL, mixR], RATE));
await Bun.write(path.join(OUT, 'vo.wav'), writeWav([vo], RATE));
await Bun.write(path.join(OUT, 'sfx.wav'), writeWav([L, R], RATE));
await Bun.write(path.join(OUT, 'effects.wav'), writeWav([effectsL, effectsR], RATE));
await Bun.write(path.join(OUT, 'captions.json'), JSON.stringify(captionsFor(clips), null, 1));
const after = await lufs(path.join(OUT, 'mix.wav'));
console.log(`mix: ${duration.toFixed(2)}s, ${after.integrated.toFixed(1)} LUFS integrated, true peak ${after.truePeak.toFixed(1)} dBFS  (gain ${(20 * Math.log10(gain)).toFixed(1)} dB)`);
await sheet();
console.log(`wrote ${path.join(OUT, 'mix.wav')} and ${path.join(OUT, 'sheet.png')}`);

// ------------------------------------------------------------------ the check sheet

/** Both stems as level envelopes against time, with the scene windows, every cue and every line marked. */
async function sheet() {
  const bins = 2400, per = Math.floor(N / bins);
  const envelope = (channels: Float32Array[]) => Array.from({ length: bins }, (_, b) => {
    let peak = 0;
    for (const c of channels) for (let i = b * per; i < (b + 1) * per; i++) peak = Math.max(peak, Math.abs(c[i] ?? 0));
    return peak;
  });
  const browser = await chromium.launch({ channel: 'chrome' });
  const sheetPage = await browser.newPage({ viewport: { width: 2400, height: 760 } });
  const png: string = await sheetPage.evaluate(({ vo, sfx, cues, lines, timeline, duration }) => {
    const c = document.createElement('canvas');
    c.width = 2400; c.height = 760;
    const g = c.getContext('2d')!;
    g.fillStyle = '#16131f'; g.fillRect(0, 0, c.width, c.height);
    const x = (t: number) => (t / duration) * c.width;
    g.font = '13px monospace';
    timeline.forEach((e: any, i: number) => { g.fillStyle = i % 2 ? '#211c2e' : '#1b1726'; g.fillRect(x(e.start), 0, x(e.end) - x(e.start), c.height); g.fillStyle = '#9f85ff'; g.fillText(e.id, x(e.start) + 4, 16); });
    for (let s = 0; s <= duration; s++) { g.fillStyle = '#3a3350'; g.fillRect(x(s), 24, 1, c.height - 24); g.fillStyle = '#6b6385'; g.fillText(`${s}`, x(s) + 2, 36); }
    const lane = (data: number[], top: number, height: number, color: string, name: string) => {
      const max = Math.max(...data, 1e-6);
      g.fillStyle = color;
      data.forEach((v, i) => { const h = (v / max) * height; g.fillRect(i, top + height - h, 1, h); });
      g.fillStyle = '#cbc1ff'; g.fillText(name, 6, top + 14);
    };
    lane(vo, 60, 220, '#7f53fd', 'narration');
    lane(sfx, 320, 220, '#e4a1b8', 'sound effects');
    lines.forEach((l: any) => {
      g.fillStyle = 'rgba(159,133,255,0.18)'; g.fillRect(x(l.at), 290, x(l.until) - x(l.at), 18);
      g.fillStyle = '#cbc1ff'; g.fillText(l.id, x(l.at) + 3, 303);
    });
    const colors: Record<string, string> = { click: '#ffffff', wheel: '#6b6385', pop: '#ffbd2e', tick: '#28c941', chime: '#4fc3f7', swish: '#e4a1b8', land: '#ff6159' };
    cues.forEach((q: any, i: number) => {
      const color = colors[q.kind] ?? '#9f85ff';
      g.fillStyle = color;
      if (q.dur) { g.globalAlpha = 0.35; g.fillRect(x(q.t), 560 + (i % 3) * 8, x(q.t + q.dur) - x(q.t), 6); g.globalAlpha = 1; }
      g.fillRect(x(q.t), 556, 2, q.kind === 'wheel' ? 6 : 30);
      if (q.kind !== 'wheel') { g.save(); g.translate(x(q.t) + 3, 600); g.rotate(Math.PI / 2.4); g.fillText(q.kind, 0, 0); g.restore(); }
    });
    return c.toDataURL('image/png').split(',')[1]!;
  }, { vo: envelope([vo]), sfx: envelope([L, R]), cues, lines: narration, timeline: declared.timeline, duration });
  await Bun.write(path.join(OUT, 'sheet.png'), Buffer.from(png, 'base64'));
  await browser.close();
}
