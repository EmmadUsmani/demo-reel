// Slides mode: the video as a deck. Each step forward plays from one stop to the next (with its
// narration) and holds there; back jumps to the previous stop at once. Pure state, so it is tested
// without a browser (deck.test.ts); the player carries out the moves.

/** What the player should do: play a stretch and hold at its end, or show a time, paused. */
export type Move = { kind: 'play'; from: number; to: number } | { kind: 'show'; t: number };

/**
 * How far the step on screen has played: 'empty' before the first slide, 'playing' on the way to a stop
 * ('paused' when the player has frozen it), 'done' once a slide is held.
 */
export type Progress = { fraction: number; state: 'empty' | 'playing' | 'paused' | 'done' };

export class Deck {
  /** The slide on screen (index into stops), or -1 before the first: the start of the video. */
  slide = -1;
  /** The slide being played to, while a step plays. */
  target: number | null = null;

  constructor(readonly stops: number[], readonly start: number) {}

  get count() { return this.stops.length; }
  private at(slide: number) { return slide < 0 ? this.start : this.stops[slide]!; }

  /** Forward: finish a step that's playing, else play the next one. */
  next(): Move | null {
    if (this.target !== null) return this.go(this.target);
    if (this.slide >= this.count - 1) return null;
    this.target = this.slide + 1;
    return { kind: 'play', from: this.at(this.slide), to: this.at(this.target) };
  }

  /** Back: undo a step that's playing, else show the previous slide. */
  prev(): Move | null {
    if (this.target !== null) return this.go(this.slide);
    if (this.slide < 0) return null;
    return this.go(this.slide - 1);
  }

  /** Show a slide at once (-1: the start). */
  go(slide: number): Move {
    this.slide = Math.max(-1, Math.min(this.count - 1, slide));
    this.target = null;
    return { kind: 'show', t: this.at(this.slide) };
  }

  /** The step the bar stands for: the one playing, else the one that led to the slide on screen. Null before the first slide. */
  private step(): { index: number; from: number; to: number } | null {
    const index = this.target ?? this.slide;
    return index < 0 ? null : { index, from: this.at(index - 1), to: this.at(index) };
  }

  /** How far the step has played at video time `t`: from the stop it started at to the stop it plays to. */
  progress(t: number, paused = false): Progress {
    const step = this.step();
    if (!step) return { fraction: 0, state: 'empty' };
    if (this.target === null) return { fraction: 1, state: 'done' };
    const length = step.to - step.from;
    return { fraction: length > 0 ? Math.min(1, Math.max(0, (t - step.from) / length)) : 1, state: paused ? 'paused' : 'playing' };
  }

  /**
   * Drag the step's bar to `fraction` (0..1, clamped): the video time to show, or null before the first
   * slide. The end is the slide arrived; anywhere before it makes the step one that is playing again, so a
   * slide that had arrived can be scrubbed back and replayed from there.
   */
  scrub(fraction: number): number | null {
    const step = this.step();
    if (!step) return null;
    const f = Math.min(1, Math.max(0, fraction));
    if (f >= 1) {
      this.slide = step.index;
      this.target = null;
      return step.to;
    }
    this.slide = step.index - 1;
    this.target = step.index;
    return step.from + (step.to - step.from) * f;
  }

  /** The slide after the one on screen (or being played to): its index, or null on the last. */
  upNext(): number | null {
    const next = (this.target ?? this.slide) + 1;
    return next < this.count ? next : null;
  }

  /** The time slide `slide` shows (-1: the start). */
  timeOf(slide: number) { return this.at(slide); }

  /** Playback reached `t`: true when the step has arrived and should hold there. */
  arrive(t: number): boolean {
    if (this.target === null || t < this.at(this.target)) return false;
    this.slide = this.target;
    this.target = null;
    return true;
  }

  /** Take over from the video at `t`: the last slide at or before it. */
  sync(t: number) {
    this.target = null;
    this.slide = this.stops.filter((s) => s <= t + 1e-6).length - 1;
  }
}
