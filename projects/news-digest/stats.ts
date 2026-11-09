#!/usr/bin/env bun
// The real numbers behind the velocity and pacing charts, written to stats.json (committed, so the
// edit renders without network access). Read-only: git history from the news-digest clone, and the
// supervisor's own logs on the VM over ssh (the iteration log and the per-iteration usage log).
//   ND_REPO=~/projects/news-digest ND_VM=news-digest.exe.xyz bun projects/news-digest/stats.ts
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = (process.env.ND_REPO ?? '~/projects/news-digest').replace(/^~/, os.homedir());
const VM = process.env.ND_VM ?? 'news-digest.exe.xyz';
const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, { maxBuffer: 64 << 20 }).toString();
const ssh = (command: string) => sh('ssh', ['-o', 'BatchMode=yes', VM, command]);

sh('git', ['-C', REPO, 'fetch', '-q', 'origin']);
const START = Date.parse('2026-11-01T17:00:00Z'); // the first iteration's day (Nov 1, 09:00 PT); hours count from here
const hourOf = (ms: number) => Math.floor((ms - START) / 3_600_000);

// commits and inserted lines per hour (merges excluded from line counts, which git counts twice)
const log = sh('git', ['-C', REPO, 'log', 'origin/main', '--format=@%ct %P', '--shortstat']);
const commits: number[] = [], lines: number[] = [];
let hour = -1;
for (const row of log.split('\n')) {
  if (row.startsWith('@')) {
    const [time, ...parents] = row.slice(1).split(' ');
    hour = hourOf(+time! * 1000);
    if (hour < 0) continue;
    commits[hour] = (commits[hour] ?? 0) + 1;
    if (parents.filter(Boolean).length > 1) hour = -1;
  } else if (hour >= 0 && /changed/.test(row)) {
    lines[hour] = (lines[hour] ?? 0) + Number(/(\d+) insertion/.exec(row)?.[1] ?? 0) + Number(/(\d+) deletion/.exec(row)?.[1] ?? 0);
  }
}

// iterations finished per hour, and the weekly quota after each one
const finished = ssh('grep -E "Iteration [0-9]+ finished" ~/agent-control/logs/supervisor.log | cut -c1-20');
const iterations: number[] = [];
for (const row of finished.trim().split('\n')) {
  const h = hourOf(Date.parse(row));
  if (h >= 0) iterations[h] = (iterations[h] ?? 0) + 1;
}
const usage = ssh('cut -f1,2,3,4,5,8 ~/agent-control/logs/usage.tsv');
const quota: [number, number][] = [];
let tokensIn = 0, tokensCached = 0, tokensOut = 0, measured = 0;
for (const row of usage.trim().split('\n')) {
  const [time, , input, cached, output, weekly] = row.split('\t');
  if (+input! > 0) { tokensIn += +input!; tokensCached += +cached!; tokensOut += +output!; measured++; }
  if (weekly) quota.push([Math.round(((Date.parse(time!) - START) / 3_600_000) * 100) / 100, +weekly]);
}
const window = JSON.parse(ssh('cat ~/agent-control/status/usage.json')).primary;
const weekEnd = window.resets_at * 1000 - window.window_minutes * 60_000; // the week that just reset
const weekStart = weekEnd - window.window_minutes * 60_000;

const hours = Math.max(commits.length, iterations.length, lines.length);
const fill = (a: number[]) => Array.from({ length: hours }, (_, i) => a[i] ?? 0);
const now = Date.now();
const stats = {
  generatedAt: new Date(now).toISOString(),
  start: new Date(START).toISOString(),
  hours,
  commitsPerHour: fill(commits),
  linesPerHour: fill(lines),
  iterationsPerHour: fill(iterations),
  quota,
  week: { start: (weekStart - START) / 3_600_000, end: (weekEnd - START) / 3_600_000 },
  totals: {
    commits: commits.reduce((a, b) => a + (b ?? 0), 0),
    iterations: iterations.reduce((a, b) => a + (b ?? 0), 0),
    lines: lines.reduce((a, b) => a + (b ?? 0), 0),
    tokensIn, tokensCached, tokensOut, measured,
  },
};
const OUT = path.join(import.meta.dir, 'stats.json');
writeFileSync(OUT, JSON.stringify(stats) + '\n');
console.log(`wrote ${OUT}:`, stats.hours, 'hours', stats.totals);
