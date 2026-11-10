import { describe, expect, test } from 'bun:test';
import { cumulative, days, generatedAt, hourly, quota, seriesHours, START, summarise } from './data';
import stats from './stats.json';

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const series = (hours: number, perHour = { commits: 1, iterations: 2, lines: 10 }) => ({
  hours,
  commitsPerHour: Array(hours).fill(perHour.commits),
  iterationsPerHour: Array(hours).fill(perHour.iterations),
  linesPerHour: Array(hours).fill(perHour.lines),
  totals: stats.totals,
});

describe('summarise: the series by Pacific day', () => {
  test('day one starts at 09:00 (hour 9 of its day), so it is short, and the next days start at midnight', () => {
    // 40 hours from 09:00 on Sunday Nov 1: 15 hours that day, 24 the next, 1 on the third
    const { list } = summarise(series(40));
    expect(list.map((d) => [d.label, d.weekday])).toEqual([['Nov 1', 'Sun'], ['Nov 2', 'Mon'], ['Nov 3', 'Tue']]);
    expect(list[0]!.commits.slice(0, 9).every((c) => c === 0)).toBe(true);
    expect(list[0]!.commits.slice(9)).toEqual(Array(15).fill(1));
    expect(sum(list[1]!.commits)).toBe(24);
    expect(sum(list[2]!.commits)).toBe(1);
    expect(list[2]!.commits[0]).toBe(1);
  });

  test('only a day the series covers entirely is full, and averages count only those', () => {
    const { list, fullDayAverage } = summarise(series(40));
    expect(list.map((d) => d.full)).toEqual([false, true, false]);
    expect(fullDayAverage).toEqual({ commits: 24, iterations: 48, lines: 240 });
    // one hour short of covering Nov 2: no day is full
    expect(summarise(series(38)).list.map((d) => d.full)).toEqual([false, false]);
    // exactly through midnight
    expect(summarise(series(39)).list.map((d) => d.full)).toEqual([false, true]);
  });

  test('per-day totals are the sums of their hours, and nothing is lost between days', () => {
    const s = series(100, { commits: 3, iterations: 1, lines: 7 });
    const out = summarise(s);
    expect(sum(out.commits)).toBe(300);
    expect(sum(out.iterations)).toBe(100);
    expect(sum(out.list.map((d) => d.lines))).toBe(700);
    expect(out.commits).toEqual(out.list.map((d) => sum(d.commits)));
  });

  test('a short series (hours missing from a stat) counts the missing hours as zero', () => {
    const s = { ...series(30), iterationsPerHour: [5] };
    expect(summarise(s).iterations).toEqual([5, 0]);
  });
});

describe('stats.json, the numbers behind the charts', () => {
  test('starts at Nov 1, 09:00 PST, and its series all cover the same hours', () => {
    expect(stats.start).toBe('2026-11-01T17:00:00.000Z');
    expect(START).toBe(Date.parse('2026-11-01T17:00:00Z'));
    for (const hours of [stats.commitsPerHour, stats.iterationsPerHour, stats.linesPerHour]) {
      expect(hours).toHaveLength(stats.hours);
      expect(hours.every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
    }
    expect(seriesHours).toBe(stats.hours);
    expect(hourly.commits).toBe(stats.commitsPerHour);
  });

  test('its totals are the sums of the hours, and the cache is part of the input', () => {
    expect(stats.totals.commits).toBe(sum(stats.commitsPerHour));
    expect(stats.totals.iterations).toBe(sum(stats.iterationsPerHour));
    expect(stats.totals.lines).toBe(sum(stats.linesPerHour));
    expect(stats.totals.tokensCached).toBeLessThanOrEqual(stats.totals.tokensIn);
    expect(stats.totals.measured).toBeGreaterThan(0);
    expect(stats.totals.measured).toBeLessThanOrEqual(stats.totals.iterations);
  });

  test('was written no earlier than its last hour began, and covers up to then', () => {
    const hoursSince = (Date.parse(generatedAt) - START) / 3_600_000;
    expect(stats.hours).toBeLessThanOrEqual(Math.ceil(hoursSince));
    expect(stats.hours).toBeGreaterThan(hoursSince - 48); // not a stale file
  });

  test('the weekly quota runs through time, in percent, and falls only when a week resets', () => {
    expect(quota.points.length).toBeGreaterThan(0);
    quota.points.forEach(([hour, used], i) => {
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThanOrEqual(stats.hours);
      expect(used).toBeGreaterThanOrEqual(0);
      expect(used).toBeLessThanOrEqual(100);
      if (i > 0) expect(hour).toBeGreaterThanOrEqual(quota.points[i - 1]![0]);
    });
    const [weekStart, weekEnd] = [quota.week.start, quota.week.end];
    expect(weekEnd - weekStart).toBeCloseTo(7 * 24);
  });
});

describe('days, from stats.json', () => {
  test('cover the whole series: the days sum to the totals', () => {
    expect(sum(days.commits)).toBe(stats.totals.commits);
    expect(sum(days.iterations)).toBe(stats.totals.iterations);
    expect(sum(days.list.map((d) => d.lines))).toBe(stats.totals.lines);
    expect(days.list).toHaveLength(Math.floor((stats.hours - 1 + 9) / 24) + 1);
    expect(days.totals).toBe(stats.totals);
  });

  test('the first day and the last (still running) are not counted in the averages', () => {
    expect(days.list[0]!.full).toBe(false);
    expect(days.list.at(-1)!.full).toBe(false);
    expect(days.list.slice(1, -1).every((d) => d.full)).toBe(true);
    const full = days.list.filter((d) => d.full);
    expect(days.fullDayAverage.commits).toBe(Math.round(sum(full.map((d) => sum(d.commits))) / full.length));
  });
});

describe('cumulative', () => {
  test('is the running total, one per hour', () => {
    expect(cumulative([1, 0, 2, 3])).toEqual([1, 1, 3, 6]);
    expect(cumulative([])).toEqual([]);
    expect(cumulative(stats.commitsPerHour).at(-1)).toBe(stats.totals.commits);
  });
});

describe('what the narration says of these numbers (script.ts) is true of them', () => {
  test('"nine days in, over fifteen hundred commits"', () => {
    expect(days.list).toHaveLength(9);
    expect(stats.totals.commits).toBeGreaterThan(1500);
    expect(stats.totals.commits).toBeLessThan(1600);
  });

  test('"about two hundred iterations, and two hundred commits, every single day"', () => {
    expect(days.fullDayAverage.iterations).toBeGreaterThanOrEqual(190);
    expect(days.fullDayAverage.iterations).toBeLessThanOrEqual(210);
    expect(days.fullDayAverage.commits).toBeGreaterThanOrEqual(190);
    expect(days.fullDayAverage.commits).toBeLessThanOrEqual(210);
  });

  test('"an iteration takes about eight minutes", "a shipped change every seven"', () => {
    const minutesEach = (24 * 60) / days.fullDayAverage.iterations;
    expect(minutesEach).toBeGreaterThan(6);
    expect(minutesEach).toBeLessThan(9);
  });

  test('"two point four billion tokens, ninety-seven percent from cache, and nearly nine million written"', () => {
    const { tokensIn, tokensCached, tokensOut } = stats.totals;
    expect(tokensIn / 1e9).toBeCloseTo(2.4, 1);
    expect(Math.round((tokensCached / tokensIn) * 100)).toBe(97);
    expect(tokensOut).toBeGreaterThan(8.5e6);
    expect(tokensOut).toBeLessThan(9e6);
  });
});
