#!/usr/bin/env bun
// The real numbers behind the velocity and pacing charts, written to stats.json (committed, so the
// edit renders without network access). Read-only: git history from the news-digest clone, and the
// supervisor's own logs on the VM over ssh (the iteration log and the per-iteration usage log).
//   ND_REPO=~/projects/news-digest ND_VM=news-digest.exe.xyz bun projects/news-digest/stats.ts
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { countIterations, parseGitLog, parseUsage, START } from './stats-parse';

const REPO = (process.env.ND_REPO ?? '~/projects/news-digest').replace(/^~/, os.homedir());
const VM = process.env.ND_VM ?? 'news-digest.exe.xyz';
const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, { maxBuffer: 64 << 20 }).toString();
const ssh = (command: string) => sh('ssh', ['-o', 'BatchMode=yes', VM, command]);

sh('git', ['-C', REPO, 'fetch', '-q', 'origin']);

// commits and inserted lines per hour (merges excluded from line counts, which git counts twice)
const { commits, lines } = parseGitLog(sh('git', ['-C', REPO, 'log', 'origin/main', '--format=@%ct %P', '--shortstat']));

// iterations finished per hour, and the weekly quota after each one
const finished = ssh('grep -E "Iteration [0-9]+ finished" ~/agent-control/logs/supervisor.log | cut -c1-20');
const iterations = countIterations(finished.trim().split('\n'));
const { quota, tokensIn, tokensCached, tokensOut, measured } = parseUsage(ssh('cut -f1,2,3,4,5,8 ~/agent-control/logs/usage.tsv'));
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
