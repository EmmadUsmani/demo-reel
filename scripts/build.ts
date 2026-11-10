#!/usr/bin/env bun
// The HTML player for one edit: a static folder that plays the video in a browser, drawn live by the
// engine, with its soundtrack. Host it anywhere that serves files (it works from any path).
//   bun scripts/build.ts --edit <name> [--out out/web-<name>] [--bitrate 128k]
//   bun scripts/build.ts --edit <name> --single [--out out/web-<name>.html]
// Run scripts/audio.ts for the edit first; without its output the player builds silent. Writes:
//   index.html, assets/        the player and the edit's code (no other project's)
//   footage/<project>/         the plates each manifest names, for the edit and every other project whose
//                              code the bundle holds (a timeline that reuses another's scenes needs its footage)
//   audio/<name>/              mix.mp3, effects.mp3 (constant bitrate, so seeks land exactly) and
//                              captions.json, from out/audio-<name>/
// --single writes ONE .html instead: the code and CSS inline, and the footage and soundtrack embedded
// with a small fetch shim ahead of the code (scripts/single-shim.ts), so the file plays from file://, any
// static host or a Claude artifact. It warns past 16 MiB (the most an artifact's page can be) and for an edit with clips.
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { withFootage } from './bundled-projects';
import { buildOptions, clipCount, copyFootage, encodeSoundtrack, listFiles, megabytes, run } from './build-lib';
import { embedFiles, singlePage, sizeWarnings } from './single-lib';
import { VITE } from './lib';

const ROOT = path.resolve(import.meta.dir, '..');
const { edit: EDIT, out: OUT, bitrate: BITRATE, audio: AUDIO, single: SINGLE } = buildOptions(process.argv.slice(2), ROOT);
const PROJECTS = path.join(ROOT, 'projects');
const work = mkdtempSync(path.join(tmpdir(), 'demo-reel-build-'));

try {
  // ---------------------------------------------------------------- the code, and which projects it holds
  const built = SINGLE ? path.join(work, 'player') : OUT;
  const projectsFile = path.join(work, 'projects.txt');
  await run([VITE, 'build', '--outDir', built, '--emptyOutDir'], ROOT, {
    DEMO_REEL_EDIT: EDIT, NODE_ENV: 'production', DEMO_REEL_PROJECTS_FILE: projectsFile, ...(SINGLE ? { DEMO_REEL_SINGLE: '1' } : {}),
  });
  renameSync(path.join(built, 'player.html'), path.join(built, 'index.html'));
  const footageProjects = withFootage(readFileSync(projectsFile, 'utf8').split('\n').filter(Boolean), PROJECTS);

  // ---------------------------------------------------------------- the footage and the soundtrack
  const stage = SINGLE ? path.join(work, 'stage') : OUT;
  for (const name of footageProjects) await copyFootage(name, path.join(PROJECTS, name, 'footage'), path.join(stage, 'footage', name));
  const audioOut = path.join(stage, 'audio', EDIT);
  await encodeSoundtrack(EDIT, AUDIO, audioOut, BITRATE, ROOT);

  if (!SINGLE) {
    console.log(`player for ${EDIT}: ${OUT}  (${megabytes(OUT)}: code ${megabytes(path.join(OUT, 'assets'))}, footage ${megabytes(path.join(OUT, 'footage'))}, audio ${megabytes(audioOut)})`);
    console.log(`footage of: ${footageProjects.join(', ') || 'none'}`);
    console.log(`serve the folder over HTTP to watch it, e.g.  bunx vite preview --outDir ${OUT} --port 5190`);
  } else {
    // ------------------------------------------------------------ one file
    const files = embedFiles(listFiles(stage).map((as) => ({ as, bytes: readFileSync(path.join(stage, as)) })));
    const page = singlePage(readFileSync(path.join(built, 'index.html'), 'utf8'), (url) => readFileSync(path.join(built, url), 'utf8'), files);
    mkdirSync(path.dirname(OUT), { recursive: true });
    writeFileSync(OUT, page);
    const clips = (await Promise.all(footageProjects.map((name) => clipCount(path.join(PROJECTS, name, 'footage'))))).reduce((a, b) => a + b, 0);
    console.log(`single-file player for ${EDIT}: ${OUT}  (${(statSync(OUT).size / 1e6).toFixed(1)} MB, ${Object.keys(files).length} embedded files; footage of: ${footageProjects.join(', ') || 'none'})`);
    for (const warning of sizeWarnings(statSync(OUT).size, clips)) console.warn(`warning: ${warning}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
