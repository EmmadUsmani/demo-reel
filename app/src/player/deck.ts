// Slides mode: the video as a deck. Each step forward plays from one stop to the next (with its
// narration) and holds there; back jumps to the previous stop at once. Pure state, so it is tested
// without a browser (deck.test.ts); the player carries out the moves.

/** What the player should do: play a stretch and hold at its end, or show a time, paused. */
export type Move = { kind: 'play'; from: number; to: number } | { kind: 'show'; t: number };

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
