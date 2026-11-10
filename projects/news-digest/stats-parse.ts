// The parsing behind stats.ts, kept apart from its ssh and git calls so it can be tested on small inputs.

/** The first iteration's day (Nov 1, 09:00 PT): hour 0 of every series. */
export const START = Date.parse('2026-11-01T17:00:00Z');
export const hourOf = (ms: number) => Math.floor((ms - START) / 3_600_000);

/**
 * Commits and inserted-plus-deleted lines per hour from `git log --format=@%ct %P --shortstat`. Merges
 * count as commits but not as lines, which git counts twice; commits before START are ignored.
 */
export function parseGitLog(log: string) {
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
  return { commits, lines };
}

/** Iterations finished per hour, from the supervisor log's timestamps (one per "Iteration N finished" row). */
export function countIterations(rows: string[]) {
  const iterations: number[] = [];
  for (const row of rows) {
    const h = hourOf(Date.parse(row));
    if (h >= 0) iterations[h] = (iterations[h] ?? 0) + 1;
  }
  return iterations;
}

/** The usage log's tab-separated columns (time, _, input, cached, output, weekly %): token totals, and the weekly quota used after each iteration. */
export function parseUsage(tsv: string) {
  const quota: [number, number][] = [];
  let tokensIn = 0, tokensCached = 0, tokensOut = 0, measured = 0;
  for (const row of tsv.trim().split('\n')) {
    const [time, , input, cached, output, weekly] = row.split('\t');
    if (+input! > 0) { tokensIn += +input!; tokensCached += +cached!; tokensOut += +output!; measured++; }
    if (weekly) quota.push([Math.round(((Date.parse(time!) - START) / 3_600_000) * 100) / 100, +weekly]);
  }
  return { quota, tokensIn, tokensCached, tokensOut, measured };
}
