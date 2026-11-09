#!/usr/bin/env bun
// Voices every line in script.ts with Kokoro and writes how long each one speaks to vo-lengths.json,
// so the scenes can hold each beat for its line (a long, slide-heavy edit has ~90 lines; fitting them
// by hand would be guesswork). It uses scripts/audio.ts's cache naming and trim rule, so audio.ts
// reuses these takes instead of voicing them again.
//   bun projects/news-digest/measure.ts [--voice af_heart] [--speed 1]
import { KokoroTTS } from 'kokoro-js';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SCRIPT } from './script';

const argv = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1]! : d; };
const VOICE = opt('voice', 'af_heart');
const SPEED = +opt('speed', '1.1'); // this edit's narration pace (treatment.md)
const ROOT = path.resolve(import.meta.dir, '../..');
const VO = path.join(ROOT, 'out/audio-news-digest/vo');
const OUT = path.join(import.meta.dir, 'vo-lengths.json');
mkdirSync(VO, { recursive: true });

// the same mono float WAV layout scripts/audio.ts writes and reads
function writeWav(samples: Float32Array, rate: number) {
  const data = new DataView(new ArrayBuffer(44 + samples.length * 4));
  const text = (offset: number, v: string) => { for (let i = 0; i < v.length; i++) data.setUint8(offset + i, v.charCodeAt(i)); };
  text(0, 'RIFF'); data.setUint32(4, 36 + samples.length * 4, true); text(8, 'WAVE');
  text(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 3, true); data.setUint16(22, 1, true);
  data.setUint32(24, rate, true); data.setUint32(28, rate * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 32, true);
  text(36, 'data'); data.setUint32(40, samples.length * 4, true);
  samples.forEach((v, i) => data.setFloat32(44 + i * 4, v, true));
  return data.buffer;
}

function readWav(buffer: ArrayBuffer) {
  const data = new DataView(buffer);
  return { rate: data.getUint32(24, true), samples: new Float32Array(buffer.slice(44)) };
}

let tts: Awaited<ReturnType<typeof KokoroTTS.from_pretrained>> | null = null;
const lengths: Record<string, number> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
for (const [id, text] of Object.entries(SCRIPT)) {
  const key = createHash('sha1').update(`${VOICE}|${SPEED}|${text}`).digest('hex').slice(0, 12);
  const file = path.join(VO, `${id}-${key}.wav`);
  if (!existsSync(file)) {
    tts ??= await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });
    const audio = await tts.generate(text, { voice: VOICE as any, speed: SPEED });
    await Bun.write(file, writeWav(audio.audio as Float32Array, audio.sampling_rate));
  }
  const { samples, rate } = readWav(await Bun.file(file).arrayBuffer());
  let first = 0, last = samples.length - 1;
  while (first < samples.length && Math.abs(samples[first]!) < 0.01) first++;
  while (last > 0 && Math.abs(samples[last]!) < 0.01) last--;
  lengths[id] = Math.round(((last - first) / rate) * 1000) / 1000;
  console.log(`${lengths[id]!.toFixed(2).padStart(6)}s  ${id}: ${text}`);
}
for (const id of Object.keys(lengths)) if (!(id in SCRIPT)) delete lengths[id];
writeFileSync(OUT, JSON.stringify(lengths, null, 2) + '\n');
const total = Object.values(lengths).reduce((a, b) => a + b, 0);
console.log(`wrote ${OUT}: ${Object.keys(lengths).length} lines, ${total.toFixed(1)} s of speech`);
