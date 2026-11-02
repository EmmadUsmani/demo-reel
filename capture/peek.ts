#!/usr/bin/env bun
// A contact sheet of a recorded clip, for checking it without rendering the video.
//   bun capture/peek.ts <project> <clip> [frames=16] [cols=4]   → out/peek/<project>-<clip>.png
// (reads projects/<project>/footage/)
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
const [name, id, count = '16', cols = '4'] = process.argv.slice(2);
if (!name || !id) throw new Error('usage: bun capture/peek.ts <project> <clip> [frames=16] [cols=4]');
const dir = path.resolve(import.meta.dir, '../projects', name, 'footage');
const clip = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')).clips[id];
if (!clip) throw new Error(`no clip ${id} in ${name}`);
const n = Math.min(+count, clip.frames.length);
const picks = Array.from({ length: n }, (_, i) => Math.round((i * (clip.frames.length - 1)) / Math.max(1, n - 1)));
const list = path.resolve(import.meta.dir, '../out/peek/.list.txt');
mkdirSync(path.dirname(list), { recursive: true });
await Bun.write(list, picks.map((i) => `file '${path.join(dir, clip.dir, clip.frames[i].file)}'`).join('\n'));
const out = path.resolve(import.meta.dir, `../out/peek/${name}-${id}.png`);
const ff = Bun.spawn(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=480:-1,tile=${cols}x${Math.ceil(n / +cols)}:padding=4:color=0x222222`, '-frames:v', '1', out]);
await ff.exited;
console.log(`${out}  (frames ${picks.join(', ')} of ${clip.frames.length}; marks: ${Object.entries(clip.marks).map(([k, v]: any) => `${k}@${v.frame}`).join(' ')})`);
