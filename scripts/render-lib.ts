// The parts of scripts/render.ts that decide things: what the command line means, which times to render,
// the ffmpeg command, and how the motion check judges frame-to-frame change. No browser here, so it is
// unit-tested (render.test.ts).
import path from 'node:path';
import { parseArgs } from './lib';

export const MODES = ['stills', 'sheet', 'jumps', 'video'] as const;
export type Mode = (typeof MODES)[number];

export type RenderOptions = {
  mode: Mode;
  edit?: string;
  only?: string;
  url?: string;
  headed: boolean;
  scale: number;
  width: number;
  height: number;
  samples: number;
  shutter: number;
  opt: (key: string, fallback?: string) => string | undefined;
  flag: (key: string) => boolean;
};

/** What `render.ts <mode> [flags]` means. The mode is the first argument, `stills` when there is none. */
export function renderOptions(argv: string[]): RenderOptions {
  const mode = argv[0] ?? 'stills';
  const { opt, flag } = parseArgs(argv);
  if (!(MODES as readonly string[]).includes(mode)) throw new Error(`unknown mode ${mode}`);
  const scale = Math.max(1, Math.round(+opt('scale', '1')!));
  return {
    mode: mode as Mode,
    edit: opt('edit'),
    only: opt('only'),
    url: opt('url'),
    headed: flag('headed'),
    scale,
    width: 1920 * scale,
    height: 1080 * scale,
    samples: +opt('samples', '1')!,
    shutter: +opt('shutter', '0.5')!,
    opt,
    flag,
  };
}

/** The `stills` times: `--t 1.5,8,12.25`, or 0. */
export const stillTimes = (t?: string) => (t ?? '0').split(',').map(Number);

/** A still's file name: its time to 10 ms, zero-padded so names sort in time order. */
export const stillName = (t: number) => `f_${t.toFixed(2).padStart(6, '0')}.png`;

/**
 * The times a contact sheet shows: `n` evenly from `from` to `to` inclusive; or exactly `--times`;
 * or, with `--cuts`, around every hard cut after the first scene (a beat either side and the frame either side).
 */
export function sheetTimes({ from, to, n, times, cuts }: { from: number; to: number; n: number; times?: string; cuts?: { start: number }[] }) {
  if (cuts) return cuts.slice(1).flatMap((e) => [e.start - 0.1, e.start - 1 / 60, e.start + 1 / 60, e.start + 0.1]);
  if (times) return times.split(',').map(Number);
  return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(1, n - 1));
}

/** How many frames `video` writes for a range. */
export const frameCount = (from: number, to: number, fps: number) => Math.round(to * fps) - Math.round(from * fps);

/**
 * ffmpeg's command for the raw RGBA frames on stdin: H.264 at the given crf, tagged BT.709 (frames are sRGB;
 * converted with the BT.709 matrix, or players decode HD as BT.709 what was encoded as BT.601 and every
 * colour shifts), with the soundtrack, cut to the same range, as AAC when there is one.
 */
export function videoArgs({ width, height, fps, from, to, audio, preset = 'slow', crf = '16', out }: { width: number; height: number; fps: number; from: number; to: number; audio?: string; preset?: string; crf?: string; out: string }) {
  const args = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', String(fps), '-i', 'pipe:0'];
  if (audio) args.push('-ss', String(from), '-t', String(to - from), '-i', path.resolve(audio), '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k');
  args.push(
    '-vf', 'scale=out_color_matrix=bt709,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709',
    '-c:v', 'libx264', '-preset', preset, '-crf', crf, '-pix_fmt', 'yuv420p', '-tune', 'animation',
    '-movflags', '+faststart', out);
  return args;
}

/**
 * The motion check's verdict on the mean change between consecutive frames (`diffs`, from `from` seconds at 60 fps):
 * a pop is a frame that changes far more than the median of the twelve around it.
 */
export function analyzeJumps(diffs: number[], from: number) {
  const flagged: string[] = [];
  diffs.forEach((d, i) => {
    const around = [...diffs.slice(Math.max(0, i - 6), i), ...diffs.slice(i + 1, i + 7)].sort((a, b) => a - b);
    const typical = around[Math.floor(around.length / 2)] ?? 0;
    if (d > 1.5 && d > 4 * typical + 0.5) flagged.push(`  ${(from + (i + 1) / 60).toFixed(3)}s  change ${d.toFixed(2)}  (neighbours ~${typical.toFixed(2)})`);
  });
  const sorted = [...diffs].sort((a, b) => a - b);
  return [
    `${diffs.length} frame steps  median ${sorted[sorted.length >> 1]!.toFixed(2)}  p99 ${sorted[Math.floor(sorted.length * 0.99)]!.toFixed(2)}  max ${sorted[sorted.length - 1]!.toFixed(2)}`,
    flagged.length ? `pops:\n${flagged.join('\n')}` : 'no pops',
  ];
}
