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
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openApp } from './lib';

const argv = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(import.meta.dir, '..');
const EDIT = opt('edit');
const OUT = path.resolve(opt('out', path.join(ROOT, EDIT ? `out/audio-${EDIT}` : 'out/audio'))!);
const VOICE = opt('voice', 'af_heart')!;
const SPEED = +opt('speed', '1')!;
const RATE = 48000;
const TARGET_LUFS = -16;

type Cue = { kind: string; t: number; dur?: number; pan?: number; gain?: number; pitch?: number; scene: string };
type Line = { id: string; at: number; until: number; text: string; caption?: string; scene: string };

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

/** Kokoro output, trimmed to the speech (a short lead-in kept so consonants aren't clipped). */
async function voice(lines: Line[]) {
  let tts: Awaited<ReturnType<typeof KokoroTTS.from_pretrained>> | null = null;
  const clips: { line: Line; samples: Float32Array; speech: number }[] = [];
  for (const line of lines) {
    const key = createHash('sha1').update(`${VOICE}|${SPEED}|${line.text}`).digest('hex').slice(0, 12);
    const file = path.join(OUT, 'vo', `${line.id}-${key}.wav`);
    let raw: Float32Array, rate: number;
    if (existsSync(file)) ({ samples: raw, rate } = readWav(await Bun.file(file).arrayBuffer()));
    else {
      tts ??= await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });
      const audio = await tts.generate(line.text, { voice: VOICE as any, speed: SPEED });
      raw = audio.audio as Float32Array;
      rate = audio.sampling_rate;
      await Bun.write(file, writeWav([raw], rate));
    }
    let first = 0, last = raw.length - 1;
    while (first < raw.length && Math.abs(raw[first]!) < 0.01) first++;
    while (last > 0 && Math.abs(raw[last]!) < 0.01) last--;
    const trimmed = raw.subarray(Math.max(0, first - Math.round(0.04 * rate)), Math.min(raw.length, last + Math.round(0.15 * rate)));
    clips.push({ line, samples: resample(trimmed, rate, RATE), speech: (last - first) / rate });
  }
  return clips;
}

const clips = await voice(narration);
console.log(`narration (${VOICE}, speed ${SPEED}):`);
let overruns = 0;
for (const { line, speech } of clips) {
  const ends = line.at + speech;
  const spare = line.until - ends;
  if (spare < 0) overruns++;
  console.log(`  ${line.at.toFixed(2).padStart(6)}s  ${speech.toFixed(2)}s  ${spare >= 0 ? `fits, ${spare.toFixed(2)}s spare` : `OVERRUNS by ${(-spare).toFixed(2)}s`}  ${line.scene}/${line.id}: ${line.text}`);
}
if (overruns && !argv.includes('--force')) {
  console.error(`\n${overruns} line(s) overrun their beat: shorten the line or hold the beat longer (or --force).`);
  process.exit(1);
}

// ------------------------------------------------------------------ sound effects

let seed = 0x5eed;
const noise = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1; };

/** RBJ biquad, coefficients settable per sample so filters can sweep. */
class Biquad {
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  set(type: 'bandpass' | 'lowpass' | 'highpass', freq: number, q: number) {
    const w = (2 * Math.PI * Math.min(freq, RATE * 0.45)) / RATE, c = Math.cos(w), alpha = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === 'bandpass') { b0 = alpha; b1 = 0; b2 = -alpha; }
    else if (type === 'lowpass') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * c) / a0; this.a2 = (1 - alpha) / a0;
    return this;
  }
  run(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

const L = new Float32Array(N), R = new Float32Array(N);
/** Add a mono sound at time t with an equal-power pan, or a pan that moves (pan as a function of 0..1). */
function place(t: number, sound: Float32Array, pan: number | ((x: number) => number) = 0) {
  const start = Math.round(t * RATE);
  for (let i = 0; i < sound.length; i++) {
    const n = start + i;
    if (n < 0 || n >= N) continue;
    const p = typeof pan === 'number' ? pan : pan(i / sound.length);
    const angle = ((Math.max(-1, Math.min(1, p)) + 1) * Math.PI) / 4;
    L[n]! += sound[i]! * Math.cos(angle);
    R[n]! += sound[i]! * Math.sin(angle);
  }
}
const buffer = (seconds: number) => new Float32Array(Math.round(seconds * RATE));
const decay = (t: number, tau: number) => Math.exp(-t / tau);

// What each cue kind sounds like. Levels are set against the narration: present, never on top of it.
const SFX: Record<string, (cue: Cue) => void> = {
  // a mouse click: a sharp press and a softer release 75 ms later
  click: (cue) => {
    const s = buffer(0.12), hp = new Biquad().set('highpass', 3000, 0.7);
    const hit = (offset: number, level: number, pitch: number) => {
      for (let i = 0; i < 0.03 * RATE; i++) {
        const t = i / RATE, n = Math.round(offset * RATE) + i;
        if (n >= s.length) break;
        s[n]! += level * (0.6 * hp.run(noise()) * decay(t, 0.0018) + 0.5 * Math.sin(2 * Math.PI * 3200 * pitch * t) * decay(t, 0.004) + 0.3 * Math.sin(2 * Math.PI * 1150 * pitch * t) * decay(t, 0.006));
      }
    };
    hit(0, 1, 1);
    hit(0.075, 0.5, 1.08);
    place(cue.t, scale(s, 0.22 * (cue.gain ?? 1)), cue.pan ?? 0.1);
  },
  // a scroll-wheel notch
  wheel: (cue) => {
    const s = buffer(0.02), hp = new Biquad().set('highpass', 4000, 0.7), p = cue.pitch ?? 1;
    for (let i = 0; i < s.length; i++) { const t = i / RATE; s[i] = 0.5 * Math.sin(2 * Math.PI * 2400 * p * t) * decay(t, 0.0012) + 0.5 * hp.run(noise()) * decay(t, 0.0008); }
    place(cue.t, scale(s, 0.05 * (cue.gain ?? 1)), 0.15);
  },
  // a keystroke: a light tap with a little body under it
  key: (cue) => {
    const s = buffer(0.05), bp = new Biquad().set('bandpass', 3200 * (cue.pitch ?? 1), 1.4);
    for (let i = 0; i < s.length; i++) { const t = i / RATE; s[i] = 0.7 * bp.run(noise()) * decay(t, 0.004) + 0.4 * Math.sin(2 * Math.PI * 190 * (cue.pitch ?? 1) * t) * decay(t, 0.012); }
    place(cue.t, scale(s, 0.07 * (cue.gain ?? 1)), 0.05);
  },
  // an item dropped into place: a muted thunk with a soft top
  drop: (cue) => {
    const s = buffer(0.18), lp = new Biquad().set('lowpass', 1400, 0.7);
    let phase = 0;
    for (let i = 0; i < s.length; i++) {
      const t = i / RATE;
      phase += (2 * Math.PI * (120 + 90 * Math.exp(-t / 0.02)) * (cue.pitch ?? 1)) / RATE;
      s[i] = 0.8 * Math.sin(phase) * Math.min(1, t / 0.002) * decay(t, 0.05) + 0.35 * lp.run(noise()) * decay(t, 0.01);
    }
    place(cue.t, scale(s, 0.16 * (cue.gain ?? 1)), cue.pan ?? -0.15);
  },
  // a label arriving: a soft, round blip that falls in pitch
  pop: (cue) => {
    const s = buffer(0.14), p = cue.pitch ?? 1;
    let phase = 0;
    for (let i = 0; i < s.length; i++) {
      const t = i / RATE, f = (620 + 520 * Math.exp(-t / 0.018)) * p;
      phase += (2 * Math.PI * f) / RATE;
      s[i] = Math.sin(phase) * Math.min(1, t / 0.003) * decay(t, 0.045) + 0.25 * Math.sin(phase * 2) * decay(t, 0.02);
    }
    place(cue.t, scale(s, 0.11 * (cue.gain ?? 1)), cue.pan ?? 0);
  },
  // a chip: a small woodblock tick
  tick: (cue) => {
    const s = buffer(0.06), p = cue.pitch ?? 1;
    for (let i = 0; i < s.length; i++) { const t = i / RATE; s[i] = Math.sin(2 * Math.PI * 1750 * p * t) * decay(t, 0.016) + 0.4 * Math.sin(2 * Math.PI * 4500 * p * t) * decay(t, 0.006); }
    place(cue.t, scale(s, 0.09 * (cue.gain ?? 1)), cue.pan ?? 0);
  },
  // the title: two soft bell notes, C6 then G6
  chime: (cue) => {
    const s = buffer(1.6);
    const bell = (offset: number, f0: number, level: number) => {
      const partials: [number, number, number][] = [[1, 1, 1.1], [2.0, 0.32, 0.65], [3.01, 0.16, 0.4], [4.17, 0.07, 0.25]];
      for (let i = Math.round(offset * RATE); i < s.length; i++) {
        const t = i / RATE - offset;
        let v = 0;
        for (const [ratio, amp, tau] of partials) v += amp * Math.sin(2 * Math.PI * f0 * ratio * t) * decay(t, tau);
        s[i]! += level * v * Math.min(1, t / 0.004);
      }
    };
    bell(0, 1046.5, 1);
    bell(0.11, 1568, 0.6);
    place(cue.t, scale(s, 0.06 * (cue.gain ?? 1)), 0);
  },
  // a card flying in: a short airy swish from outside the frame toward where it lands
  swish: (cue) => {
    const len = 0.34, s = buffer(len), bp = new Biquad();
    for (let i = 0; i < s.length; i++) {
      const x = i / s.length;
      if (i % 32 === 0) bp.set('bandpass', 1800 + 2200 * x, 0.9);
      s[i] = bp.run(noise()) * Math.sin(Math.PI * Math.min(1, x * 1.6)) ** 2 * (1 - x * 0.5);
    }
    const pan = cue.pan ?? 0;
    place(cue.t, scale(s, 0.09 * (cue.gain ?? 1)), (x) => pan * (1.6 - 0.6 * x));
  },
  // a window settling into place: a soft low thump
  land: (cue) => {
    const s = buffer(0.25), lp = new Biquad().set('lowpass', 900, 0.7);
    let phase = 0;
    for (let i = 0; i < s.length; i++) {
      const t = i / RATE;
      phase += (2 * Math.PI * (55 + 45 * Math.exp(-t / 0.04))) / RATE;
      s[i] = Math.sin(phase) * Math.min(1, t / 0.004) * decay(t, 0.07) + 0.15 * lp.run(noise()) * decay(t, 0.015);
    }
    place(cue.t, scale(s, 0.15 * (cue.gain ?? 1)), 0);
  },
  'whoosh-in': (cue) => whoosh(cue, 380, 2300),
  'whoosh-out': (cue) => whoosh(cue, 2300, 380),
  'whoosh-across': (cue) => whoosh(cue, 700, 700, true),
};

/** Air moving with the camera: band-passed noise whose centre sweeps over the move, swelling with its speed. */
function whoosh(cue: Cue, from: number, to: number, across = false) {
  const len = Math.max(0.3, cue.dur ?? 0.8), s = buffer(len + 0.15), bp = new Biquad(), lp = new Biquad().set('lowpass', 500, 0.7);
  for (let i = 0; i < s.length; i++) {
    const x = Math.min(1, i / (len * RATE));
    if (i % 32 === 0) bp.set('bandpass', across ? from * (1 + 1.1 * Math.sin(Math.PI * x)) : from * (to / from) ** x, 1.1);
    const swell = Math.sin(Math.PI * x) ** 1.6;
    s[i] = (bp.run(noise()) + 0.5 * lp.run(noise())) * swell;
  }
  place(cue.t, scale(s, 0.075 * (cue.gain ?? 1)), across ? (x) => -0.35 + 0.7 * x : 0);
}

function scale(s: Float32Array, k: number) { for (let i = 0; i < s.length; i++) s[i]! *= k; return s; }

const counts: Record<string, number> = {};
for (const cue of cues) {
  const make = SFX[cue.kind];
  if (!make) throw new Error(`no sound for cue kind '${cue.kind}' (${cue.scene} @ ${cue.t.toFixed(2)}s)`);
  make(cue);
  counts[cue.kind] = (counts[cue.kind] ?? 0) + 1;
}
console.log(`sfx: ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')}`);

// ------------------------------------------------------------------ mix

const vo = new Float32Array(N);
for (const { line, samples } of clips) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const start = Math.round(line.at * RATE) - Math.round(0.04 * RATE);
  for (let i = 0; i < samples.length; i++) if (start + i >= 0 && start + i < N) vo[start + i]! += (samples[i]! / peak) * 0.6;
}

// duck the effects under the voice: about -5 dB, eased in over 60 ms and out over 300 ms
const duck = new Float32Array(N);
let env = 0;
const attack = 1 - Math.exp(-1 / (0.06 * RATE)), release = 1 - Math.exp(-1 / (0.3 * RATE));
const speaking = new Uint8Array(N);
for (const { line, speech } of clips) for (let n = Math.round(line.at * RATE); n < Math.min(N, Math.round((line.at + speech) * RATE)); n++) speaking[n] = 1;
for (let n = 0; n < N; n++) { env += (speaking[n]! - env) * (speaking[n]! ? attack : release); duck[n] = 1 - 0.45 * env; }

const effectsL = L.slice(), effectsR = R.slice();
const mixL = new Float32Array(N), mixR = new Float32Array(N);
for (let n = 0; n < N; n++) { mixL[n] = vo[n]! + L[n]! * duck[n]!; mixR[n] = vo[n]! + R[n]! * duck[n]!; }

// loudness: measure with ffmpeg's EBU R128 meter, apply the gain to the target, then a lookahead peak limiter
async function lufs(file: string) {
  const proc = Bun.spawn(['ffmpeg', '-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { stderr: 'pipe', stdout: 'ignore' });
  const log = await new Response(proc.stderr).text();
  const summary = log.slice(log.lastIndexOf('Summary:'));
  return { integrated: parseFloat(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1] ?? 'NaN'), truePeak: parseFloat(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1] ?? 'NaN') };
}
const probe = path.join(OUT, '.probe.wav');
await Bun.write(probe, writeWav([mixL, mixR], RATE));
const before = await lufs(probe);
rmSync(probe);
const gain = 10 ** ((TARGET_LUFS - before.integrated) / 20);
limit([mixL, mixR], gain, 10 ** (-1.5 / 20));
limit([effectsL, effectsR], gain, 10 ** (-1.5 / 20));

await Bun.write(path.join(OUT, 'mix.wav'), writeWav([mixL, mixR], RATE));
await Bun.write(path.join(OUT, 'vo.wav'), writeWav([vo], RATE));
await Bun.write(path.join(OUT, 'sfx.wav'), writeWav([L, R], RATE));
await Bun.write(path.join(OUT, 'effects.wav'), writeWav([effectsL, effectsR], RATE));
const captions = clips.map(({ line, speech }) => ({ id: line.id, scene: line.scene, at: line.at, end: line.at + speech, text: line.caption ?? line.text }));
await Bun.write(path.join(OUT, 'captions.json'), JSON.stringify(captions, null, 1));
const after = await lufs(path.join(OUT, 'mix.wav'));
console.log(`mix: ${duration.toFixed(2)}s, ${after.integrated.toFixed(1)} LUFS integrated, true peak ${after.truePeak.toFixed(1)} dBFS  (gain ${(20 * Math.log10(gain)).toFixed(1)} dB)`);
await sheet();
console.log(`wrote ${path.join(OUT, 'mix.wav')} and ${path.join(OUT, 'sheet.png')}`);

/** Gain, then a 5 ms lookahead limiter that holds the peak under `ceiling` (fast attack, 120 ms release). */
function limit(channels: Float32Array[], gain: number, ceiling: number) {
  const look = Math.round(0.005 * RATE), rel = 1 - Math.exp(-1 / (0.12 * RATE));
  const peak = new Float32Array(N);
  for (let n = 0; n < N; n++) for (const c of channels) peak[n] = Math.max(peak[n]!, Math.abs(c[n]! * gain));
  let reduction = 1;
  for (let n = 0; n < N; n++) {
    let ahead = 0;
    for (let k = n; k < Math.min(N, n + look); k += 8) ahead = Math.max(ahead, peak[k]!);
    const needed = ahead > ceiling ? ceiling / ahead : 1;
    reduction = needed < reduction ? needed : reduction + (1 - reduction) * rel;
    for (const c of channels) c[n] = c[n]! * gain * reduction;
  }
}

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

// ------------------------------------------------------------------ wav i/o

function writeWav(channels: Float32Array[], rate: number) {
  const frames = channels[0]!.length, count = channels.length;
  const data = new DataView(new ArrayBuffer(44 + frames * count * 4));
  const text = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) data.setUint8(offset + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); data.setUint32(4, 36 + frames * count * 4, true); text(8, 'WAVE');
  text(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 3, true); data.setUint16(22, count, true);
  data.setUint32(24, rate, true); data.setUint32(28, rate * count * 4, true); data.setUint16(32, count * 4, true); data.setUint16(34, 32, true);
  text(36, 'data'); data.setUint32(40, frames * count * 4, true);
  for (let i = 0; i < frames; i++) for (let c = 0; c < count; c++) data.setFloat32(44 + (i * count + c) * 4, channels[c]![i]!, true);
  return data.buffer;
}

/** Reads the mono float WAVs this script writes. */
function readWav(buffer: ArrayBuffer) {
  const data = new DataView(buffer);
  const rate = data.getUint32(24, true);
  return { rate, samples: new Float32Array(buffer.slice(44)) };
}

/** Catmull-Rom resampling (24 kHz speech up to 48 kHz). */
function resample(input: Float32Array, from: number, to: number) {
  const out = new Float32Array(Math.round((input.length * to) / from));
  const at = (i: number) => input[Math.max(0, Math.min(input.length - 1, i))]!;
  for (let n = 0; n < out.length; n++) {
    const x = (n * from) / to, i = Math.floor(x), f = x - i;
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    out[n] = p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
  }
  return out;
}
