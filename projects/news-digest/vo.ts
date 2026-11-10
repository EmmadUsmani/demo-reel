// The voice-over cache's file layout and trim rule, shared by measure.ts and written to match
// scripts/audio.ts (which reads the takes measure.ts voices, and the other way round).
import { createHash } from 'node:crypto';

/** The cache key audio.ts and measure.ts name a take by: voice, speed and text. */
export const takeKey = (voice: string, speed: number, text: string) => createHash('sha1').update(`${voice}|${speed}|${text}`).digest('hex').slice(0, 12);

/** A mono 32-bit float WAV. */
export function writeWav(samples: Float32Array, rate: number) {
  const data = new DataView(new ArrayBuffer(44 + samples.length * 4));
  const text = (offset: number, v: string) => { for (let i = 0; i < v.length; i++) data.setUint8(offset + i, v.charCodeAt(i)); };
  text(0, 'RIFF'); data.setUint32(4, 36 + samples.length * 4, true); text(8, 'WAVE');
  text(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 3, true); data.setUint16(22, 1, true);
  data.setUint32(24, rate, true); data.setUint32(28, rate * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 32, true);
  text(36, 'data'); data.setUint32(40, samples.length * 4, true);
  samples.forEach((v, i) => data.setFloat32(44 + i * 4, v, true));
  return data.buffer;
}

export function readWav(buffer: ArrayBuffer) {
  const data = new DataView(buffer);
  return { rate: data.getUint32(24, true), samples: new Float32Array(buffer.slice(44)) };
}

/** Seconds of speech in a take: from the first to the last sample at or above 0.01, to the millisecond. */
export function speechSeconds(samples: Float32Array, rate: number) {
  let first = 0, last = samples.length - 1;
  while (first < samples.length && Math.abs(samples[first]!) < 0.01) first++;
  while (last > 0 && Math.abs(samples[last]!) < 0.01) last--;
  return Math.round(((last - first) / rate) * 1000) / 1000;
}
