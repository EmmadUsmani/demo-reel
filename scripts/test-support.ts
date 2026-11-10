// Helpers shared by the script tests (not a test itself).
import { test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** A fresh temporary directory, removed by the returned function. */
export function tempDir(prefix = 'demo-reel-test-') {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

export const hasFfmpeg = !!Bun.which('ffmpeg') && !!Bun.which('ffprobe');
if (!hasFfmpeg) console.warn('ffmpeg/ffprobe not found: the tests that run the real binaries are skipped');
/** `test` when ffmpeg and ffprobe are installed, `test.skip` (named in the output) when they are not. */
export const ffmpegTest = hasFfmpeg ? test : test.skip;

/** A generated sine-wave WAV (48 kHz stereo, 16-bit) of `seconds`, written to `file`. */
export function sineWav(file: string, seconds: number, freq = 440) {
  const made = Bun.spawnSync(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${freq}:sample_rate=48000:duration=${seconds}`, '-ac', '2', file]);
  if (made.exitCode !== 0) throw new Error(`ffmpeg could not make ${file}: ${made.stderr}`);
  return file;
}

/** ffprobe's view of an audio file: codec, rate, channels, bit rate and duration. */
export function probeAudio(file: string) {
  const out = Bun.spawnSync(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels,bit_rate,duration', '-of', 'json', file]);
  if (out.exitCode !== 0) throw new Error(`ffprobe failed on ${file}: ${out.stderr}`);
  const s = JSON.parse(out.stdout.toString()).streams[0];
  return { codec: s.codec_name as string, rate: +s.sample_rate, channels: s.channels as number, bitRate: +s.bit_rate, duration: +s.duration };
}
