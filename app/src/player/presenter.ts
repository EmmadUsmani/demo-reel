// The presenter's view of a deck (?view=presenter): the slide on screen, a still of the next one, the
// notes for this slide, k / N, a stopwatch and the wall clock, and big Previous / Next buttons. It steps
// like slides mode (deck.ts: each step plays to the next stop and holds, on the wall clock, with no
// sound) and is its own page, stepped by hand: nothing is synced between views.
import type { Engine } from '../engine/engine';
import { slideNotes, type Spoken } from '../engine/notes';
import { authoredNotes, fetchCaptions, narrationCaptions } from './captions';
import { AmbientClock } from './ambient';
import { CORNER_HTML, paintCorner } from './corner';
import { PlaybackClock } from './clock';
import { Deck, type Move } from './deck';
import { keyCommand } from './keys';
import { escapeHtml, spanOf, startTime, type Caption } from './moments';
import { viewHash } from './params';
import { attachScrub, paintProgress, PROGRESS_HTML } from './progress';
import { Stopwatch, stopwatchText, wallClockText } from './timer';

export type PresenterOptions = {
  name: string;
  title: string;
  /** Play only this timeline entry (an embed); the engine was loaded with it alone. */
  scene?: string;
  /** Open on this slide (1-based). */
  slide?: number;
  /** The frame shown before the first step, s (Edit.poster). */
  poster?: number;
  /** False for an edit that is a deck (Edit.deck): there is no captions.json to ask for. */
  sound?: boolean;
};

/** The next slide's still is drawn this wide; the page scales it. */
const STILL = { w: 960, h: 540 };

export class Presenter {
  private t: number;
  private playing = false;
  private drawn = Number.NaN;
  private from: number;
  private to: number;
  private deck: Deck;
  private clock: PlaybackClock;
  /** The clock for motion that goes on while a slide is held (Frame.ambient). */
  private ambient = new AmbientClock();
  private drawnAmbient = Number.NaN;
  /** The progress bar is being dragged: the step stands still where the pointer puts it. */
  private scrubbing = false;
  private stopwatch = new Stopwatch();
  private captions: Caption[];
  private authored: Spoken[];
  /** The slide whose still the next-slide canvas holds: null for none (on the last slide); -2 before the first draw. */
  private stillOf: number | null = -2;
  private still: CanvasRenderingContext2D;
  private el: Record<string, HTMLElement> = {};
  private bar!: HTMLElement;
  private corner!: HTMLElement;

  constructor(private root: HTMLElement, private canvas: HTMLCanvasElement, private engine: Engine, private o: PresenterOptions) {
    const span = spanOf(engine.timeline, o.scene, engine.duration);
    this.from = span.start;
    this.to = span.end;
    this.clock = new PlaybackClock(this.to);
    this.deck = new Deck(engine.stops().map((s) => s.t).filter((t) => t >= this.from && t < this.to), this.from);
    this.captions = narrationCaptions(engine);
    this.authored = authoredNotes(engine);
    this.t = startTime({ from: this.from, to: this.to, embed: !!o.scene, stops: this.deck.stops, poster: o.poster, timeline: engine.timeline });
    if (o.slide) {
      this.deck.go(o.slide - 1);
      this.t = this.deck.timeOf(this.deck.slide);
    }
    this.ambient.hold(performance.now());
    this.build();
    this.still = (this.el.still as HTMLCanvasElement).getContext('2d', { alpha: false })!;
    if (o.sound !== false) void this.loadCaptions();
    requestAnimationFrame((now) => this.frame(now));
  }

  /** scripts/audio.ts times each caption to its speech; the notes fall back on those lines. */
  private async loadCaptions() {
    this.captions = (await fetchCaptions(this.o.name)) ?? this.captions;
    this.notes();
  }

  // ------------------------------------------------------------------ stepping

  next() {
    const move = this.deck.next();
    if (move) this.stopwatch.begin(performance.now());
    this.carry(move);
  }
  prev() { this.carry(this.deck.prev()); }
  go(slide: number) { this.carry(this.deck.go(slide)); }

  private carry(move: Move | null) {
    if (!move) return;
    this.playing = move.kind === 'play';
    this.t = move.kind === 'play' ? move.from : move.t;
    if (move.kind === 'play') { this.ambient.resume(performance.now()); this.ambient.play(performance.now()); }
    else { this.ambient.reset(); this.ambient.hold(performance.now()); }
    this.clock.reset(this.t, performance.now());
    this.drawn = Number.NaN;
    this.notes();
    this.progress();
  }

  /** Freeze the step and the ambient motion, or let them run on. */
  togglePause() {
    const now = performance.now();
    if (this.ambient.paused) { this.ambient.resume(now); this.clock.reset(this.t, now); }
    else this.ambient.pause(now);
    this.progress();
  }

  /** Dragging the progress bar: the step goes where the pointer is; on release it plays on from there (or, paused or arrived, stays). */
  private scrubStart() { this.scrubbing = true; }

  private scrubTo(fraction: number) {
    const t = this.deck.scrub(fraction);
    if (t === null) return;
    this.t = t;
    this.drawn = Number.NaN;
  }

  private scrubEnd() {
    this.scrubbing = false;
    if (this.deck.slide < 0 && this.deck.target === null) return; // before the first slide there is no step to scrub
    const now = performance.now();
    this.playing = this.deck.target !== null;
    if (this.playing) this.ambient.play(now);
    else this.ambient.hold(now);
    this.clock.reset(this.t, now);
    this.notes();
  }

  private async frame(perf: number) {
    if (this.playing && !this.ambient.paused && !this.scrubbing) {
      this.t = this.clock.read(this.t, perf);
      if (this.deck.arrive(this.t)) {
        this.playing = false;
        this.t = this.deck.stops[this.deck.slide]!;
        this.ambient.hold(perf);
        this.notes();
      } else if (this.t >= this.to) {
        this.t = this.to - 1e-3;
        this.playing = false;
      }
    }
    try {
      // the next slide's still is drawn through the engine too, so it is drawn only when the slide changes,
      // and the frame on screen is drawn again right after
      if (this.stillOf !== this.deck.upNext()) await this.drawStill(this.deck.upNext());
      // a held slide is drawn again every frame: its ambient motion goes on
      const ambient = this.ambient.read(this.t, perf);
      if (this.t !== this.drawn || ambient !== this.drawnAmbient) {
        const t = this.t;
        await this.engine.prepare(t, 1, 0.5, 60, ambient);
        this.engine.render(t, 1, 0.5, 60, ambient);
        this.drawn = t;
        this.drawnAmbient = ambient;
      }
    } catch (error) {
      console.error(error); // one bad frame must not stop the page
      this.drawn = this.t;
    }
    this.clocks();
    this.progress();
    requestAnimationFrame((now) => this.frame(now));
  }

  /** The still of slide `slide` (its stop: fully built) into the next-slide canvas, or none to show. */
  private async drawStill(slide: number | null) {
    this.stillOf = slide;
    this.el.still!.hidden = slide === null;
    this.el.end!.hidden = slide !== null;
    if (slide === null) return;
    const t = this.deck.timeOf(slide);
    await this.engine.prepare(t);
    this.engine.render(t);
    this.still.drawImage(this.canvas, 0, 0, STILL.w, STILL.h);
    this.drawn = Number.NaN;
  }

  // ------------------------------------------------------------------ interface

  private build() {
    this.root.classList.remove('loading');
    this.root.classList.add('presenter');
    this.root.innerHTML = `
      <header class="p-head">
        <span class="p-title"></span>
        <span class="p-count" aria-label="Slide"></span>
        <span class="p-timer">
          <span class="p-elapsed" aria-label="Elapsed time">0:00</span>
          <button class="p-pause pill" aria-label="Pause the timer">Pause</button>
          <button class="p-reset pill" aria-label="Reset the timer">Reset</button>
        </span>
        <span class="p-clock" aria-label="Time of day"></span>
        <button class="p-audience pill" title="Open the audience view on this slide">Audience view</button>
      </header>
      <div class="p-slides">
        <figure class="p-now"><figcaption class="p-state">Now</figcaption><div class="p-shot">${PROGRESS_HTML}${CORNER_HTML}</div></figure>
        <figure class="p-up"><figcaption>Next</figcaption><div class="p-shot"><canvas class="p-still" width="${STILL.w}" height="${STILL.h}"></canvas><div class="p-end" hidden>End of the deck</div></div></figure>
      </div>
      <section class="p-notes" aria-label="Speaker notes"></section>
      <nav class="p-nav">
        <button class="p-prev" aria-label="Previous slide">Previous</button>
        <button class="p-fwd" aria-label="Next slide">Next</button>
      </nav>`;
    const $ = (selector: string) => this.root.querySelector<HTMLElement>(selector)!;
    for (const name of ['title', 'count', 'elapsed', 'pause', 'reset', 'clock', 'still', 'end', 'notes', 'prev', 'fwd', 'audience', 'state']) this.el[name] = $(`.p-${name}`);
    $('.p-now .p-shot').prepend(this.canvas);
    this.bar = $('.p-now .progress');
    this.corner = $('.p-now .corner');
    this.el.title!.textContent = this.o.scene ? `${this.o.title} · ${this.o.scene}` : this.o.title;

    this.canvas.addEventListener('click', () => this.next());
    this.el.prev!.addEventListener('click', () => this.prev());
    this.el.fwd!.addEventListener('click', () => this.next());
    $('.p-now .c-back').addEventListener('click', () => this.prev());
    $('.p-now .c-pause').addEventListener('click', () => this.togglePause());
    $('.p-now .c-next').addEventListener('click', () => this.next());
    attachScrub(this.bar, {
      start: () => this.scrubStart(),
      to: (fraction) => this.scrubTo(fraction),
      end: () => this.scrubEnd(),
      nudge: (by) => { this.scrubStart(); this.scrubTo(this.deck.progress(this.t).fraction + by); this.scrubEnd(); },
    });
    this.el.audience!.addEventListener('click', () => { location.hash = viewHash('player', this.deck.target ?? this.deck.slide); });
    this.el.pause!.addEventListener('click', () => { this.stopwatch.toggle(performance.now()); this.clocks(); });
    this.el.reset!.addEventListener('click', () => { this.stopwatch.reset(); this.clocks(); });
    // a click does not leave a button focused, so Space then pauses instead of pressing it again (Tab to a button still does)
    this.root.addEventListener('mousedown', (event) => { if ((event.target as HTMLElement).closest('button')) event.preventDefault(); });
    window.addEventListener('keydown', (event) => this.key(event));
    this.notes();
  }

  private key(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // a focused button takes space and Enter itself (a click)
    if (target.closest?.('button') && [' ', 'Enter'].includes(event.key)) return;
    const command = keyCommand(event.key, event.shiftKey, 'slides');
    if (command?.kind === 'next') this.next();
    else if (command?.kind === 'prev') this.prev();
    else if (command?.kind === 'pause') this.togglePause();
    else if (command?.kind === 'slide') this.go(command.to === 'first' ? -1 : this.deck.count - 1);
    else return;
    event.preventDefault();
  }

  /** What changes with the slide: k / N, the notes, the buttons. */
  private notes() {
    const k = this.deck.target ?? this.deck.slide;
    this.el.count!.textContent = `${k + 1 > 0 ? k + 1 : '–'} / ${this.deck.count}`;
    (this.el.prev as HTMLButtonElement).disabled = this.deck.slide < 0 && this.deck.target === null;
    (this.el.fwd as HTMLButtonElement).disabled = this.deck.slide >= this.deck.count - 1 && this.deck.target === null;
    const lines = slideNotes({ authored: this.authored, spoken: this.captions }, this.deck.stops, this.from, k);
    this.el.notes!.innerHTML = k < 0
      ? '<p class="hint">Press Next (or →) to start. ← goes back.</p>'
      : lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('') || '<p class="hint">No notes for this slide.</p>';
    this.el.notes!.scrollTop = 0;
  }

  /** The step's progress bar, and what the Now panel says of it. */
  private progress() {
    const progress = this.deck.progress(this.t, this.ambient.paused);
    paintCorner(this.corner, { paused: this.ambient.paused, canBack: this.deck.slide >= 0 || this.deck.target !== null, canNext: this.deck.slide < this.deck.count - 1 || this.deck.target !== null });
    paintProgress(this.bar, progress);
    const label = { empty: 'Now', playing: 'Now · playing', paused: 'Now · paused', done: 'Now · ready' }[progress.state];
    if (this.el.state!.textContent !== label) this.el.state!.textContent = label;
  }

  /** The stopwatch and the time of day: text only when it changes. */
  private clocks() {
    const text = (name: string, value: string) => { if (this.el[name]!.textContent !== value) this.el[name]!.textContent = value; };
    text('elapsed', stopwatchText(this.stopwatch.elapsed(performance.now())));
    text('clock', wallClockText(new Date()));
    text('pause', this.stopwatch.state === 'running' ? 'Pause' : this.stopwatch.state === 'paused' ? 'Resume' : 'Start');
    this.el.elapsed!.classList.toggle('paused', this.stopwatch.state === 'paused');
  }
}
