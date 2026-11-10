// The real numbers behind the charts (stats.json, written by stats.ts), shaped for the scenes:
// per-hour series, per-day totals on Pacific days (the owner's), and the quota week.
import stats from './stats.json';

type Stats = typeof stats;
export const START = Date.parse(stats.start); // Nov 1, 09:00 PST: hour 0 of every series
const PT_OFFSET = 9; // hours from midnight PT to START
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const hourly = { commits: stats.commitsPerHour, iterations: stats.iterationsPerHour, lines: stats.linesPerHour };

type Day = { label: string; weekday: string; commits: number[]; iterations: number[]; lines: number; full: boolean };
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/** The series regrouped by Pacific day: per-hour counts for each day, and the averages over the full days. */
export function summarise(s: Pick<Stats, 'hours' | 'commitsPerHour' | 'iterationsPerHour' | 'linesPerHour' | 'totals'>) {
  const list: Day[] = [];
  for (let h = 0; h < s.hours; h++) {
    const d = Math.floor((h + PT_OFFSET) / 24), hourOfDay = (h + PT_OFFSET) % 24;
    if (!list[d]) {
      const date = new Date(Date.UTC(2026, 10, 1 + d));
      list[d] = { label: `Nov ${1 + d}`, weekday: DAY_NAMES[date.getUTCDay()]!, commits: Array(24).fill(0), iterations: Array(24).fill(0), lines: 0, full: false };
    }
    const day = list[d]!;
    day.commits[hourOfDay] = (day.commits[hourOfDay] ?? 0) + (s.commitsPerHour[h] ?? 0);
    day.iterations[hourOfDay] = (day.iterations[hourOfDay] ?? 0) + (s.iterationsPerHour[h] ?? 0);
    day.lines += s.linesPerHour[h] ?? 0;
  }
  // a day is full when the series covers all of it (not the first day, which began at 09:00, or today)
  const lastFullDay = Math.floor((s.hours + PT_OFFSET) / 24) - 1;
  list.forEach((day, i) => { day.full = i >= 1 && i <= lastFullDay; });

  const full = list.filter((d) => d.full);
  return {
    list,
    commits: list.map((d) => sum(d.commits)),
    iterations: list.map((d) => sum(d.iterations)),
    fullDayAverage: {
      commits: Math.round(sum(full.map((d) => sum(d.commits))) / full.length),
      iterations: Math.round(sum(full.map((d) => sum(d.iterations))) / full.length),
      lines: Math.round(sum(full.map((d) => d.lines)) / full.length),
    },
    totals: s.totals,
  };
}

export const days = summarise(stats);

/** Cumulative series, per hour. */
export const cumulative = (a: number[]) => { let s = 0; return a.map((v) => (s += v)); };

/** The weekly quota: [hours since START, % used], and the week it belonged to (hours since START). */
export const quota = { points: stats.quota as [number, number][], week: stats.week };
export const generatedAt = stats.generatedAt;
/** Hours the series covers, from the first iteration's day (Nov 1, 09:00 PT) to the capture. */
export const seriesHours = stats.hours;
