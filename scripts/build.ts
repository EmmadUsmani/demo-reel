#!/usr/bin/env bun
// The HTML player for one edit: a static folder that plays the video in a browser, drawn live by the
// engine, with its soundtrack. Host it anywhere that serves files (it works from any path).
//   bun scripts/build.ts --edit <name> [--out out/web-<name>] [--bitrate 128k]
// Run scripts/audio.ts for the edit first; without its output the player builds silent. Writes:
//   index.html, assets/        the player and the edit's code (no other project's)
//   footage/<name>/            the plates the manifest names (manifest.json and its files)
//   audio/<name>/              mix.mp3, effects.mp3 (constant bitrate, so seeks land exactly) and
//                              captions.json, from out/audio-<name>/
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(import.meta.dir, '..');
const EDIT = opt('edit');
if (!EDIT) throw new Error('--edit <name> is required');
const OUT = path.resolve(opt('out', path.join(ROOT, `out/web-${EDIT}`))!);
const BITRATE = opt('bitrate', '128k')!;
const PROJECT = path.join(ROOT, 'projects', EDIT);
const AUDIO = path.join(ROOT, 'out', `audio-${EDIT}`);
if (!existsSync(path.join(PROJECT, 'timeline.ts'))) throw new Error(`no project '${EDIT}'`);

async function run(cmd: string[], env: Record<string, string> = {}) {
  const proc = Bun.spawn(cmd, { cwd: ROOT, env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`${cmd.join(' ')} failed (${code}):\n${out}\n${err}`);
}

// ------------------------------------------------------------------ the code
await run(['bunx', 'vite', 'build', '--outDir', OUT, '--emptyOutDir'], { DEMO_REEL_EDIT: EDIT, NODE_ENV: 'production' });
renameSync(path.join(OUT, 'player.html'), path.join(OUT, 'index.html'));

// ------------------------------------------------------------------ the footage the manifest uses
const footageIn = path.join(PROJECT, 'footage');
const footageOut = path.join(OUT, 'footage', EDIT);
if (existsSync(path.join(footageIn, 'manifest.json'))) {
  const manifest = await Bun.file(path.join(footageIn, 'manifest.json')).json();
  const files = new Set<string>(['manifest.json']);
  for (const shot of Object.values<any>(manifest.shots ?? {})) files.add(shot.file);
  for (const extra of Object.values<any>(manifest.extras ?? {})) if (typeof extra?.file === 'string') files.add(extra.file);
  for (const clip of Object.values<any>(manifest.clips ?? {})) for (const frame of clip.frames) files.add(`${clip.dir}/${frame.file}`);
  for (const file of files) {
    const from = path.join(footageIn, file);
    if (!existsSync(from)) throw new Error(`footage file missing: ${from} (capture the footage first: bun projects/${EDIT}/capture.ts)`);
    mkdirSync(path.dirname(path.join(footageOut, file)), { recursive: true });
    cpSync(from, path.join(footageOut, file));
  }
}

// ------------------------------------------------------------------ the soundtrack
const audioOut = path.join(OUT, 'audio', EDIT);
if (existsSync(path.join(AUDIO, 'mix.wav'))) {
  mkdirSync(audioOut, { recursive: true });
  for (const track of ['mix', 'effects']) {
    if (!existsSync(path.join(AUDIO, `${track}.wav`))) { console.warn(`no ${track}.wav: re-run scripts/audio.ts --edit ${EDIT} for it`); continue; }
    await run(['ffmpeg', '-y', '-v', 'error', '-i', path.join(AUDIO, `${track}.wav`), '-c:a', 'libmp3lame', '-b:a', BITRATE, path.join(audioOut, `${track}.mp3`)]);
  }
  if (existsSync(path.join(AUDIO, 'captions.json'))) cpSync(path.join(AUDIO, 'captions.json'), path.join(audioOut, 'captions.json'));
} else console.warn(`no soundtrack in ${AUDIO}: the player is silent (run bun scripts/audio.ts --edit ${EDIT} first)`);

// ------------------------------------------------------------------ report
function size(dir: string): number {
  return readdirSync(dir).reduce((sum, name) => {
    const file = path.join(dir, name);
    return sum + (statSync(file).isDirectory() ? size(file) : statSync(file).size);
  }, 0);
}
const mb = (dir: string) => (existsSync(dir) ? `${(size(dir) / 1e6).toFixed(1)} MB` : '—');
console.log(`player for ${EDIT}: ${OUT}  (${mb(OUT)}: code ${mb(path.join(OUT, 'assets'))}, footage ${mb(footageOut)}, audio ${mb(audioOut)})`);
console.log(`serve the folder over HTTP to watch it, e.g.  bunx vite preview --outDir ${path.relative(ROOT, OUT)} --port 5190`);
