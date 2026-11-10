#!/usr/bin/env bun
// The HTML player for one edit: a static folder that plays the video in a browser, drawn live by the
// engine, with its soundtrack. Host it anywhere that serves files (it works from any path).
//   bun scripts/build.ts --edit <name> [--out out/web-<name>] [--bitrate 128k]
// Run scripts/audio.ts for the edit first; without its output the player builds silent. Writes:
//   index.html, assets/        the player and the edit's code (no other project's)
//   footage/<name>/            the plates the manifest names (manifest.json and its files)
//   audio/<name>/              mix.mp3, effects.mp3 (constant bitrate, so seeks land exactly) and
//                              captions.json, from out/audio-<name>/
import { renameSync } from 'node:fs';
import path from 'node:path';
import { buildOptions, copyFootage, encodeSoundtrack, megabytes, run } from './build-lib';
import { VITE } from './lib';

const ROOT = path.resolve(import.meta.dir, '..');
const { edit: EDIT, out: OUT, bitrate: BITRATE, project: PROJECT, audio: AUDIO } = buildOptions(process.argv.slice(2), ROOT);

// ------------------------------------------------------------------ the code
await run([VITE, 'build', '--outDir', OUT, '--emptyOutDir'], ROOT, { DEMO_REEL_EDIT: EDIT, NODE_ENV: 'production' });
renameSync(path.join(OUT, 'player.html'), path.join(OUT, 'index.html'));

// ------------------------------------------------------------------ the footage the manifest uses
const footageOut = path.join(OUT, 'footage', EDIT);
await copyFootage(EDIT, path.join(PROJECT, 'footage'), footageOut);

// ------------------------------------------------------------------ the soundtrack
const audioOut = path.join(OUT, 'audio', EDIT);
await encodeSoundtrack(EDIT, AUDIO, audioOut, BITRATE, ROOT);

// ------------------------------------------------------------------ report
console.log(`player for ${EDIT}: ${OUT}  (${megabytes(OUT)}: code ${megabytes(path.join(OUT, 'assets'))}, footage ${megabytes(footageOut)}, audio ${megabytes(audioOut)})`);
console.log(`serve the folder over HTTP to watch it, e.g.  bunx vite preview --outDir ${OUT} --port 5190`);
