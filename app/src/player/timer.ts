// The presenter's stopwatch: starts on the first step forward, can be paused and reset. Pure (times are
// passed in), so it is tested without a browser (timer.test.ts).

export class Stopwatch {
  /** Elapsed time banked by earlier runs, ms. */
  private banked = 0;
  /** When the current run began (ms, performance.now), or null while idle or paused. */
  private since: number | null = null;
  private begun = false;

  get state(): 'idle' | 'running' | 'paused' {
    return this.since !== null ? 'running' : this.begun ? 'paused' : 'idle';
  }

  /** The first step forward starts it; later steps leave it as it is (a pause stays paused). */
  begin(now: number) {
    if (this.begun) return;
    this.begun = true;
    this.since = now;
  }

  /** The pause button: stops a running timer, continues a paused one, starts an idle one. */
  toggle(now: number) {
    if (this.since !== null) { this.banked += now - this.since; this.since = null; }
    else { this.begun = true; this.since = now; }
  }

  reset() {
    this.banked = 0;
    this.since = null;
    this.begun = false;
  }

  elapsed(now: number): number {
    return this.banked + (this.since === null ? 0 : Math.max(0, now - this.since));
  }
}

/** m:ss, and h:mm:ss from an hour on. */
export function stopwatchText(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** The wall clock as hh:mm (24 hours, so it reads the same on every machine). */
export const wallClockText = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
