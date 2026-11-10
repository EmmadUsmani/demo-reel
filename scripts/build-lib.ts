// The parts of scripts/build.ts that decide things, kept apart from the Vite build so they can be tested.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from './lib';

export type BuildOptions = { edit: string; out: string; bitrate: string; project: string; audio: string };

/** What `build.ts --edit <name> [--out dir] [--bitrate 128k]` means, under the repo at `root`. */
export function buildOptions(argv: string[], root: string): BuildOptions {
  const { opt } = parseArgs(argv);
  const edit = opt('edit');
  if (!edit) throw new Error('--edit <name> is required');
  const project = path.join(root, 'projects', edit);
  if (!existsSync(path.join(project, 'timeline.ts'))) throw new Error(`no project '${edit}'`);
  return {
    edit,
    out: path.resolve(opt('out', path.join(root, `out/web-${edit}`))!),
    bitrate: opt('bitrate', '128k')!,
    project,
    audio: path.join(root, 'out', `audio-${edit}`),
  };
}

type Manifest = {
  shots?: Record<string, { file: string }>;
  extras?: Record<string, { file?: unknown } | null>;
  clips?: Record<string, { dir: string; frames: { file: string }[] }>;
};

/** Every file (relative to the footage folder) a manifest names: the manifest, its shots, extras that are files, and every clip frame. */
export function footageFiles(manifest: Manifest): string[] {
  const files = new Set<string>(['manifest.json']);
  for (const shot of Object.values(manifest.shots ?? {})) files.add(shot.file);
  for (const extra of Object.values(manifest.extras ?? {})) if (typeof extra?.file === 'string') files.add(extra.file);
  for (const clip of Object.values(manifest.clips ?? {})) for (const frame of clip.frames) files.add(`${clip.dir}/${frame.file}`);
  return [...files];
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
