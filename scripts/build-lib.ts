// The parts of scripts/build.ts that decide things, kept apart from the Vite build so they can be tested.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { parseArgs } from './lib';

export type BuildOptions = { edit: string; out: string; bitrate: string; project: string; audio: string; single: boolean };

/** What `build.ts --edit <name> [--single] [--out dir|file.html] [--bitrate 128k]` means, under the repo at `root`. */
export function buildOptions(argv: string[], root: string): BuildOptions {
  const { opt, flag } = parseArgs(argv);
  const single = flag('single');
  const edit = opt('edit');
  if (!edit) throw new Error('--edit <name> is required');
  const project = path.join(root, 'projects', edit);
  if (!existsSync(path.join(project, 'timeline.ts'))) throw new Error(`no project '${edit}'`);
  return {
    edit,
    out: outPath(opt('out'), edit, single, root),
    bitrate: opt('bitrate', '128k')!,
    project,
    audio: path.join(root, 'out', `audio-${edit}`),
    single,
  };
}

/** Where the build goes: a folder, or with --single one .html file (the extension is added if --out leaves it off). */
export function outPath(out: string | undefined, edit: string, single: boolean, root: string): string {
  const file = path.resolve(out ?? path.join(root, `out/web-${edit}`));
  return single && !file.endsWith('.html') ? `${file}.html` : file;
}

type Manifest = {
  shots?: Record<string, { file: string }>;
  extras?: Record<string, { file?: unknown } | null>;
  clips?: Record<string, { dir: string; frames: { file: string }[] }>;
};

/**
 * How far (0..255, any channel of any pixel) a recorded frame may be from the frame before it and still be that
 * frame: a live page's backdrop drifts by a few levels from frame to frame (qiyami's, under 12), while anything
 * that changes on the page (a digit, a sheet, a typed letter) moves pixels by well over a hundred.
 */
export const SAME_FRAME = 16;

/**
 * A staged footage folder made small enough to embed in one page (build.ts --single): in each clip, a frame within
 * SAME_FRAME of the last one kept is that frame (the manifest names the kept file again), and the kept frames are
 * re-encoded as WebP at `quality`. Shots and extras are left as they are. Rewrites the folder's manifest.json in
 * place; returns how many frames the clips record and how many files now hold them.
 */
export async function compactClips(footage: string, quality = 82): Promise<{ frames: number; files: number }> {
  const manifestFile = path.join(footage, 'manifest.json');
  if (!existsSync(manifestFile)) return { frames: 0, files: 0 };
  const manifest: Manifest = await Bun.file(manifestFile).json();
  let frames = 0, files = 0;
  for (const clip of Object.values(manifest.clips ?? {})) {
    const originals = new Set(clip.frames.map((f) => f.file));
    let kept: { pixels: Buffer; file: string } | null = null;
    for (const frame of clip.frames) {
      frames++;
      const from = path.join(footage, clip.dir, frame.file);
      const pixels = await sharp(from).removeAlpha().raw().toBuffer();
      if (!kept || !sameFrame(pixels, kept.pixels)) {
        const file = `${frame.file.replace(/\.[^.]+$/, '')}.webp`;
        await sharp(from).webp({ quality }).toFile(path.join(footage, clip.dir, file));
        kept = { pixels, file };
        files++;
      }
      frame.file = kept.file;
    }
    for (const file of originals) if (!file.endsWith('.webp')) rmSync(path.join(footage, clip.dir, file));
  }
  await Bun.write(manifestFile, JSON.stringify(manifest));
  return { frames, files };
}

/** Two frames' raw pixels, of one size, are the same frame: no channel differs by more than SAME_FRAME. */
export function sameFrame(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > SAME_FRAME) return false;
  return true;
}

/** Every file (relative to the footage folder) a manifest names: the manifest, its shots, extras that are files, and every clip frame. */
export function footageFiles(manifest: Manifest): string[] {
  const files = new Set<string>(['manifest.json']);
  for (const shot of Object.values(manifest.shots ?? {})) files.add(shot.file);
  for (const extra of Object.values(manifest.extras ?? {})) if (typeof extra?.file === 'string') files.add(extra.file);
  for (const clip of Object.values(manifest.clips ?? {})) for (const frame of clip.frames) files.add(`${clip.dir}/${frame.file}`);
  return [...files];
}

/** Every file under `dir` as its path relative to `dir` (with `/`), sorted. */
export function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}

/** Copy what the footage manifest names (and nothing else in the folder) into the player. A project with no manifest has no footage. */
export async function copyFootage(edit: string, footageIn: string, footageOut: string) {
  const manifestFile = path.join(footageIn, 'manifest.json');
  if (!existsSync(manifestFile)) return [];
  const files = footageFiles(await Bun.file(manifestFile).json());
  for (const file of files) {
    const from = path.join(footageIn, file);
    if (!existsSync(from)) throw new Error(`footage file missing: ${from} (capture the footage first: bun projects/${edit}/capture.ts)`);
    mkdirSync(path.dirname(path.join(footageOut, file)), { recursive: true });
    cpSync(from, path.join(footageOut, file));
  }
  return files;
}

/** ffmpeg's arguments for a WAV to a constant-bitrate MP3 (constant, so a seek lands exactly). */
export const mp3Args = (wav: string, mp3: string, bitrate: string) => ['ffmpeg', '-y', '-v', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', bitrate, mp3];

export async function run(cmd: string[], cwd: string, env: Record<string, string> = {}) {
  const proc = Bun.spawn(cmd, { cwd, env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`${cmd.join(' ')} failed (${code}):\n${out}\n${err}`);
}

/**
 * The player's soundtrack, from what scripts/audio.ts wrote in `audioIn`: mix.mp3 and effects.mp3, and captions.json
 * as it is. No mix.wav means no soundtrack (the player is silent); no effects.wav is a warning, not a failure.
 * Returns the files written, relative to `audioOut`.
 */
export async function encodeSoundtrack(edit: string, audioIn: string, audioOut: string, bitrate: string, root: string) {
  const written: string[] = [];
  if (!existsSync(path.join(audioIn, 'mix.wav'))) {
    console.warn(`no soundtrack in ${audioIn}: the player is silent (run bun scripts/audio.ts --edit ${edit} first)`);
    return written;
  }
  mkdirSync(audioOut, { recursive: true });
  for (const track of ['mix', 'effects']) {
    if (!existsSync(path.join(audioIn, `${track}.wav`))) { console.warn(`no ${track}.wav: re-run scripts/audio.ts --edit ${edit} for it`); continue; }
    await run(mp3Args(path.join(audioIn, `${track}.wav`), path.join(audioOut, `${track}.mp3`), bitrate), root);
    written.push(`${track}.mp3`);
  }
  if (existsSync(path.join(audioIn, 'captions.json'))) {
    cpSync(path.join(audioIn, 'captions.json'), path.join(audioOut, 'captions.json'));
    written.push('captions.json');
  }
  return written;
}

/** The size in bytes of everything under `dir`. */
export function dirSize(dir: string): number {
  return readdirSync(dir).reduce((sum, name) => {
    const file = path.join(dir, name);
    return sum + (statSync(file).isDirectory() ? dirSize(file) : statSync(file).size);
  }, 0);
}
export const megabytes = (dir: string) => (existsSync(dir) ? `${(dirSize(dir) / 1e6).toFixed(1)} MB` : '—');
