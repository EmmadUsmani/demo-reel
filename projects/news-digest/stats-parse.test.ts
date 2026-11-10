import { describe, expect, test } from 'bun:test';
import { countIterations, hourOf, parseGitLog, parseUsage, START } from './stats-parse';

const seconds = (hours: number, extra = 0) => START / 1000 + hours * 3600 + extra;
const iso = (hours: number, extra = 0) => new Date(START + hours * 3_600_000 + extra * 1000).toISOString().slice(0, 19) + 'Z';

describe('hourOf', () => {
  test('counts whole hours from the first iteration (Nov 1, 09:00 PT), and is negative before it', () => {
    expect(new Date(START).toISOString()).toBe('2026-11-01T17:00:00.000Z');
    expect(hourOf(START)).toBe(0);
    expect(hourOf(START + 3_599_999)).toBe(0);
    expect(hourOf(START + 3_600_000)).toBe(1);
    expect(hourOf(START - 1)).toBe(-1);
  });
});

describe('parseGitLog', () => {
  const log = [
    `@${seconds(0, 10)} p1`, '', ' 3 files changed, 10 insertions(+), 2 deletions(-)', '',
    `@${seconds(0, 20)} p2`, '', ' 1 file changed, 5 insertions(+)', '',
    `@${seconds(3, 5)} p3`, '', ' 1 file changed, 4 deletions(-)', '',
    `@${seconds(4)} p4 p5`, '', ' 9 files changed, 900 insertions(+), 100 deletions(-)', '', // a merge
    `@${seconds(4, 30)} p6`, '', ' 1 file changed, 1 insertion(+)', '',
    `@${seconds(-2)} p7`, '', ' 1 file changed, 7 insertions(+)', '', // before the first iteration
  ].join('\n');

  test('counts commits and changed lines per hour', () => {
    const { commits, lines } = parseGitLog(log);
    expect(commits[0]).toBe(2);
    expect(lines[0]).toBe(10 + 2 + 5);
    expect(commits[3]).toBe(1);
    expect(lines[3]).toBe(4);
  });

  test('a merge is a commit, but its lines (which git counts twice) are not', () => {
    const { commits, lines } = parseGitLog(log);
    expect(commits[4]).toBe(2); // the merge, and the commit after it
    expect(lines[4]).toBe(1);
  });

  test('ignores commits from before the first iteration, and leaves quiet hours empty', () => {
    const { commits, lines } = parseGitLog(log);
    expect(commits).toHaveLength(5);
    expect(commits[1]).toBeUndefined();
    expect(lines[1]).toBeUndefined();
  });

  test('an empty log has nothing', () => {
    expect(parseGitLog('')).toEqual({ commits: [], lines: [] });
  });
});

describe('countIterations', () => {
  test('counts the log timestamps in each hour', () => {
    const counts = countIterations([iso(0, 5), iso(0, 3000), iso(2, 1), iso(-1)]);
    expect(counts[0]).toBe(2);
    expect(counts[1]).toBeUndefined();
    expect(counts[2]).toBe(1);
    expect(counts).toHaveLength(3);
  });
});

describe('parseUsage', () => {
  const row = (time: string, input: number, cached: number, output: number, weekly: string) => [time, 'x', input, cached, output, weekly].join('\t');

  test('adds up the tokens of runs that measured any, and counts them', () => {
    const usage = parseUsage([row(iso(1), 100, 90, 10, '1'), row(iso(2), 0, 0, 0, '2'), row(iso(3), 50, 40, 5, '3')].join('\n'));
    expect(usage).toMatchObject({ tokensIn: 150, tokensCached: 130, tokensOut: 15, measured: 2 });
  });

  test('records the weekly quota as [hours since the start, percent used], and skips runs without one', () => {
    const usage = parseUsage([row(iso(1, 1800), 1, 1, 1, '5'), row(iso(2), 1, 1, 1, ''), row(iso(3), 1, 1, 1, '7')].join('\n') + '\n');
    expect(usage.quota).toEqual([[1.5, 5], [3, 7]]);
  });
});
