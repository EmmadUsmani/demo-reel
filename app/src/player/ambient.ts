// The ambient clock of a deck: the time for motion that should keep going on a held slide (Frame.ambient).
// While a step plays it equals the video time plus whatever was held before; while a slide is held the
// video time stands still on its stop and this clock keeps running with the wall clock. It is continuous
// across a step (the next one carries on from where the held slide's clock was) and starts over on a jump.
// It can also be paused (Space): the clock stands still, and the player stops its step with it.
// Pure, so it is tested without a browser (ambient.test.ts); the player and the presenter both use it.

export class AmbientClock {
  /** How far ahead of the video time the clock is: the time spent held, before the current hold. */
  private ahead = 0;
  /** When the slide on screen started to hold (ms, performance.now), or null while a step plays. */
  private since: number | null = null;
  /** When the clock was paused (ms), or null while it runs. */
  private pausedAt: number | null = null;

  /** A slide is held from `perf` on: a step arrived, or a jump landed on a slide. */
  hold(perf: number) {
    this.since ??= this.pausedAt ?? perf;
  }

  /** A step starts: the time held so far stays in the clock, so nothing jumps. (Pausing is separate: see resume.) */
  play(perf: number) {
    this.ahead += this.heldFor(perf);
    this.since = null;
  }

  /** A jump (back, go, a seek, a change of mode): the clock starts over at the video time, running. */
  reset() {
    this.ahead = 0;
    this.since = null;
    this.pausedAt = null;
  }

  /** Stand still from `perf` on. */
  pause(perf: number) {
    this.pausedAt ??= perf;
  }

  /** Run again from `perf`: the time spent paused is not counted. */
  resume(perf: number) {
    if (this.pausedAt === null) return;
    if (this.since !== null) this.since += perf - this.pausedAt;
    this.pausedAt = null;
  }

  get paused() { return this.pausedAt !== null; }
  get held() { return this.since !== null; }

  /** The ambient time at `perf`, for the video time `t`. */
  read(t: number, perf: number): number {
    return t + this.ahead + this.heldFor(perf);
  }

  private heldFor(perf: number) { return this.since === null ? 0 : Math.max(0, (this.pausedAt ?? perf) - this.since) / 1000; }
}
