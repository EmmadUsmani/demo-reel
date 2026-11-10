// The player: the engine draws each frame live (a frame is a pure function of its time), and the
// soundtrack plays alongside as an <audio> element that keeps the time. Two tracks, so the narration
// can be switched off: mix (voice and effects) and effects (the effects alone, not ducked).
// Two modes over the same frames: video (play straight through) and slides (deck.ts: each step plays
// from one stop to the next and holds). A player can also be limited to one scene, for embedding.
import type { Engine } from '../engine/engine';
import { AmbientClock } from './ambient';
import { CORNER_HTML, paintCorner } from './corner';
import { PlaybackClock } from './clock';
import { Deck, type Move } from './deck';
import { ICON } from './icons';
import { keyCommand } from './keys';
import { viewHash } from './params';
import { attachScrub, paintProgress, PROGRESS_HTML } from './progress';
import { slideNotes, type Spoken } from '../engine/notes';
import { authoredNotes, fetchCaptions, narrationCaptions } from './captions';
import { captionAt, clockText, escapeHtml, sceneAt, spanOf, startTime, type Caption } from './moments';
import { shareLinks } from './share';

export type Mode = 'video' | 'slides';

export type PlayerOptions = {
  /** The edit, which names its soundtrack folder: audio/<name>/. */
  name: string;
  title: string;
  mode: Mode;
  /** Play only this timeline entry (an embed); the engine was loaded with it alone. */
  scene?: string;
  /** Where to start (and what the poster shows), s. */
  t?: number;
  /** Slides mode: start on this slide (1-based). */
  slide?: number;
  /** The frame shown before the first play, s (Edit.poster); without one, the end of the first scene. */
  poster?: number;
  captions: boolean;
  narration: boolean;
  /** False for an edit that is a deck (Edit.deck): no soundtrack is asked for, and time runs on the wall clock. */
  sound?: boolean;
};

type Track = 'mix' | 'effects';

/** Built players carry MP3 (every browser, every host that serves audio); the dev server, audio.ts's WAVs. */
const AUDIO_EXT = import.meta.env.PLAYER_AUDIO;

export class Player {
  private t: number;
  private playing = false;
  private started = false;
  private drawn = Number.NaN;
  /** The span played: the whole edit, or one scene. */
  private from: number;
  private to: number;
  private mode: Mode;
  private deck: Deck;
  private clock: PlaybackClock;
  /** The clock for motion that goes on while a slide is held (Frame.ambient); in the video it is just t. */
  private ambient = new AmbientClock();
  private drawnAmbient = Number.NaN;
  /** The progress bar is being dragged: the step stands still where the pointer puts it. */
  private scrubbing = false;
  /** The browser refused to start the sound (autoplay rules): play silently until the next play. */
  private silent = false;
  private tracks: Partial<Record<Track, HTMLAudioElement>> = {};
  private narration: boolean;
  private captionsOn: boolean;
  private notesOn = false;
  private muted = false;
  private captions: Caption[];
  private authored: Spoken[];
  private idleTimer = 0;
  private el: Record<string, HTMLElement> = {};

  constructor(private root: HTMLElement, private canvas: HTMLCanvasElement, private engine: Engine, private o: PlayerOptions) {
    const span = spanOf(engine.timeline, o.scene, engine.duration);
    this.from = span.start;
    this.to = span.end;
    this.clock = new PlaybackClock(this.to);
    this.deck = new Deck(engine.stops().map((s) => s.t).filter((t) => t >= this.from && t < this.to), this.from);
    this.mode = o.mode;
    this.narration = o.narration;
    this.captionsOn = o.captions;
    this.captions = narrationCaptions(engine);
    this.authored = authoredNotes(engine);
    this.t = startTime({ from: this.from, to: this.to, t: o.t, embed: !!o.scene, stops: this.deck.stops, poster: o.poster, timeline: engine.timeline });
    if (this.mode === 'slides' && o.slide) { this.started = true; this.t = (this.deck.go(o.slide - 1) as { t: number }).t; }
    if (this.mode === 'slides') this.ambient.hold(performance.now());
    this.build();
    if (o.sound !== false) {
      this.loadAudio();
      void this.loadCaptions();
    }
    requestAnimationFrame((now) => this.frame(now));
  }

  // ------------------------------------------------------------------ sound

  private loadAudio() {
    for (const track of ['mix', 'effects'] as Track[]) {
      const audio = new Audio();
      audio.preload = 'auto';
      const url = `audio/${this.o.name}/${track}.${AUDIO_EXT}`;
      audio.addEventListener('error', async () => {
        // a host that allows media only from blob: URLs (a Claude artifact) still lets the page fetch its
        // own files: play the track from memory instead (it loads whole before it plays)
        if (!audio.src.startsWith('blob:')) {
          try {
            const response = await fetch(url);
            if (response.ok) { audio.src = URL.createObjectURL(await response.blob()); return; }
          } catch { /* no way to it: play silent */ }
        }
        console.warn(`no ${track} soundtrack (${url}): ${audio.error?.message ?? 'failed to load'}`);
        delete this.tracks[track];
        this.clockReset();
        this.sync();
      });
      // a track that became playable late (fetched as a blob) starts if the video is already playing
      audio.addEventListener('canplay', () => { if (this.playing && audio === this.track() && audio.paused) this.sync(); });
      // paused from outside (media keys, headphones unplugged, the browser): the video pauses with it. The
      // event arrives a task after the pause, so one from our own sync() that the video has played on
      // from since (a double tap of space) finds the audio playing again: not a pause from outside.
      audio.addEventListener('pause', () => { if (audio.paused && this.playing && !this.ambient.paused && audio === this.track() && !audio.ended) this.pause(); });
      audio.src = url;
      this.tracks[track] = audio;
    }
  }

  /** scripts/audio.ts times each caption to its speech; without it, a caption shows for its whole beat. */
  private async loadCaptions() {
    this.captions = (await fetchCaptions(this.o.name)) ?? this.captions;
    this.drawn = Number.NaN;
    this.notes();
  }

  /** The track that should be heard, if it loaded: narration off plays the effects alone. */
  private track(): HTMLAudioElement | undefined {
    if (this.silent) return undefined;
    return this.narration ? this.tracks.mix ?? this.tracks.effects : this.tracks.effects ?? this.tracks.mix;
  }

  private clockReset() { this.clock.reset(this.t, performance.now()); }

  // ------------------------------------------------------------------ transport

  play() {
    // the poster is a frame from inside the video: the first play starts at the beginning
    if (this.t >= this.to - 0.02 || (!this.started && this.o.t === undefined)) this.t = this.from;
    this.playing = this.started = true;
    this.silent = false;
    this.drawn = Number.NaN; // captions appear once the video has started: redraw this frame even if the clock hasn't moved yet
    this.clockReset();
    this.sync();
  }

  pause() {
    this.playing = false;
    this.sync();
  }

  toggle() {
    if (this.mode === 'slides') return this.next();
    if (this.playing) this.pause();
    else this.play();
  }

  seek(t: number) {
    this.t = Math.min(this.to - 1e-3, Math.max(this.from, t));
    this.clockReset();
    const audio = this.track();
    if (audio) audio.currentTime = this.t;
    this.drawn = Number.NaN;
    if (this.mode === 'slides' && !this.playing) this.deck.sync(this.t);
  }

  /** Make the audio match the transport: only the chosen track plays, from the picture's time. */
  private sync() {
    const heard = this.track();
    for (const audio of Object.values(this.tracks)) {
      if (audio !== heard || !this.playing || this.ambient.paused) { if (!audio.paused) audio.pause(); continue; }
      audio.muted = this.muted;
      if (Math.abs(audio.currentTime - this.t) > 0.05) audio.currentTime = this.t;
      if (audio.paused) {
        audio.play().catch((error: DOMException) => {
          // only the browser's autoplay rules make the video go on silently (until the next play); a
          // pause got there first (AbortError), or the track is still loading or failed (its events say)
          if (error.name !== 'NotAllowedError') return;
          this.silent = true;
          this.clockReset();
          this.ui();
        });
      }
    }
    this.ui();
  }

  setNarration(on: boolean) { this.narration = on; this.clockReset(); this.sync(); }
  setCaptions(on: boolean) { this.captionsOn = on; this.drawn = Number.NaN; this.ui(); }
  setMuted(on: boolean) { this.muted = on; this.sync(); }
  setNotes(on: boolean) { this.notesOn = on; this.ui(); }

  // ------------------------------------------------------------------ slides

  next() { this.carry(this.deck.next()); }
  prev() { this.carry(this.deck.prev()); }
  go(slide: number) { this.carry(this.deck.go(slide)); }

  private carry(move: Move | null) {
    if (!move) return;
    this.started = true;
    if (move.kind === 'show') {
      this.playing = false;
      this.seek(move.t);
      this.ambient.reset();
      this.ambient.hold(performance.now());
      this.sync();
    } else {
      this.playing = true; // before the seek, which would otherwise take the deck back to that slide
      this.seek(move.from);
      this.ambient.resume(performance.now());
      this.ambient.play(performance.now());
      this.silent = false;
      this.clockReset();
      this.sync();
    }
    this.notes();
  }

  /** Slides mode: freeze the step and the ambient motion, or let them run on. */
  togglePause() {
    if (this.mode !== 'slides') return;
    const now = performance.now();
    if (this.ambient.paused) { this.ambient.resume(now); this.clockReset(); }
    else this.ambient.pause(now);
    this.sync();
  }

  /** Dragging the progress bar: the step goes where the pointer is; on release it plays on from there (or, paused or arrived, stays). */
  private scrubStart() { this.scrubbing = true; }

  private scrubTo(fraction: number) {
    const t = this.deck.scrub(fraction);
    if (t === null) return;
    this.t = t;
    this.drawn = Number.NaN;
    const audio = this.track();
    if (audio) audio.currentTime = t;
  }

  private scrubEnd() {
    this.scrubbing = false;
    if (this.deck.slide < 0 && this.deck.target === null) return; // before the first slide there is no step to scrub
    this.started = true;
    const now = performance.now();
    this.playing = this.deck.target !== null;
    if (this.playing) this.ambient.play(now);
    else this.ambient.hold(now);
    this.clockReset();
    this.sync();
    this.notes();
  }

  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.ambient.reset();
    if (mode === 'slides') {
      this.deck.sync(this.t);
      this.go(this.deck.slide);
    }
    this.root.classList.toggle('slides', mode === 'slides');
    this.notes();
    this.ui();
  }

  // ------------------------------------------------------------------ drawing

  private async frame(perf: number) {
    if (this.playing && !this.ambient.paused && !this.scrubbing) {
      this.t = this.clock.read(this.t, perf, this.track());
      if (this.mode === 'slides' && this.deck.arrive(this.t)) {
        this.playing = false;
        this.seek(this.deck.stops[this.deck.slide]!);
        this.ambient.hold(perf);
        this.sync();
      } else if (this.t >= this.to) {
        this.t = this.to - 1e-3;
        this.pause();
      }
    }
    const ambient = this.mode === 'slides' ? this.ambient.read(this.t, perf) : this.t;
    try {
      // a held slide is drawn again every frame: its ambient motion goes on
      if (this.t !== this.drawn || ambient !== this.drawnAmbient) {
        const t = this.t;
        await this.engine.prepare(t, 1, 0.5, 60, ambient);
        this.engine.render(t, 1, 0.5, 60, ambient);
        this.drawn = t;
        this.drawnAmbient = ambient;
        this.tick();
      }
    } catch (error) {
      console.error(error); // one bad frame must not stop the player
      this.drawn = this.t;
    }
    requestAnimationFrame((now) => this.frame(now));
  }

  // ------------------------------------------------------------------ interface

  private build() {
    this.root.classList.remove('loading');
    this.root.classList.toggle('slides', this.mode === 'slides');
    this.root.innerHTML = `
      <div class="stage"><div class="frame">
        ${PROGRESS_HTML}
        ${CORNER_HTML}
        <div class="caption" hidden></div>
        <button class="big" aria-label="Play">${ICON.play}</button>
        <div class="bar">
          <div class="track"><div class="marks"></div><input class="scrub" type="range" min="0" step="0.01" aria-label="Seek"><div class="tip" hidden></div></div>
          <div class="row">
            <button class="play" aria-label="Play">${ICON.play}</button>
            <span class="pager"><button class="back" aria-label="Previous slide">${ICON.prev}</button><span class="count"></span><button class="fwd" aria-label="Next slide">${ICON.next}</button></span>
            <button class="mute" aria-label="Mute">${ICON.sound}</button>
            <span class="time"></span>
            <span class="title"></span>
            <span class="grow"></span>
            <button class="pill voice" aria-pressed="true" title="Narration (n)">Narration</button>
            <button class="pill cc" aria-pressed="false" title="Captions (c)">CC</button>
            <button class="pill notes-on" aria-pressed="false" title="Speaker notes (s)">Notes</button>
            <button class="pill mode" aria-pressed="false" title="Slides: step through the video (v)">Slides</button>
            <button class="pill presenter-on" title="Open the presenter view on this slide">Presenter</button>
            <button class="pill share-on" aria-pressed="false">Share</button>
            <button class="fs" aria-label="Full screen" title="Full screen (f)">${ICON.fullscreen}</button>
          </div>
        </div>
        <div class="share" hidden>
          <label>Link to this moment<input class="link-t" readonly></label>
          <label class="for-slides">Link to this slide<input class="link-slide" readonly></label>
          <label>Presenter view: notes, next slide, timer<input class="link-presenter" readonly></label>
          <a class="open-presenter" target="_blank" rel="noopener">Open the presenter view</a>
          <label>Embed this scene<textarea class="embed" readonly rows="4"></textarea></label>
        </div>
      </div></div>
      <aside class="notes" hidden></aside>`;
    const $ = (selector: string) => this.root.querySelector<HTMLElement>(selector)!;
    for (const name of ['frame', 'caption', 'big', 'bar', 'marks', 'scrub', 'tip', 'play', 'pager', 'back', 'count', 'fwd', 'mute', 'time', 'title', 'voice', 'cc', 'notes-on', 'mode', 'presenter-on', 'share-on', 'progress', 'corner', 'c-back', 'c-pause', 'c-next', 'fs', 'share', 'link-t', 'link-slide', 'link-presenter', 'open-presenter', 'embed', 'notes']) this.el[name] = $(`.${name}`);
    this.el.frame!.prepend(this.canvas);
    this.el.title!.textContent = this.o.scene ? `${this.o.title} · ${this.o.scene}` : this.o.title;

    const scrub = this.el.scrub as HTMLInputElement;
    scrub.min = String(this.from);
    scrub.max = String(this.to);
    scrub.addEventListener('input', () => this.seek(+scrub.value));
    for (const entry of this.engine.timeline) {
      if (entry.start <= this.from || entry.start >= this.to) continue;
      const mark = document.createElement('i');
      mark.style.left = `${((entry.start - this.from) / (this.to - this.from)) * 100}%`;
      this.el.marks!.append(mark);
    }
    const track = $('.track');
    track.addEventListener('pointermove', (event) => {
      const box = track.getBoundingClientRect();
      const t = this.from + Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * (this.to - this.from);
      const scene = sceneAt(this.engine.timeline, t);
      this.el.tip!.textContent = `${clockText(t - this.from)}${scene ? `  ·  ${scene}` : ''}`;
      this.el.tip!.style.left = `${event.clientX - box.left}px`;
      this.el.tip!.hidden = false;
    });
    track.addEventListener('pointerleave', () => { this.el.tip!.hidden = true; });

    this.canvas.addEventListener('click', () => this.toggle());
    this.el.big!.addEventListener('click', () => this.toggle());
    this.el.play!.addEventListener('click', () => this.toggle());
    this.el.back!.addEventListener('click', () => this.prev());
    this.el.fwd!.addEventListener('click', () => this.next());
    this.el.mute!.addEventListener('click', () => this.setMuted(!this.muted));
    this.el.voice!.addEventListener('click', () => this.setNarration(!this.narration));
    this.el.cc!.addEventListener('click', () => this.setCaptions(!this.captionsOn));
    this.el['notes-on']!.addEventListener('click', () => this.setNotes(!this.notesOn));
    this.el.mode!.addEventListener('click', () => this.setMode(this.mode === 'video' ? 'slides' : 'video'));
    this.el['c-back']!.addEventListener('click', () => this.prev());
    this.el['c-pause']!.addEventListener('click', () => this.togglePause());
    this.el['c-next']!.addEventListener('click', () => this.next());
    attachScrub(this.el.progress!, {
      start: () => this.scrubStart(),
      to: (fraction) => this.scrubTo(fraction),
      end: () => this.scrubEnd(),
      nudge: (by) => { this.scrubStart(); this.scrubTo(this.deck.progress(this.t).fraction + by); this.scrubEnd(); },
    });
    this.el['presenter-on']!.addEventListener('click', () => this.openPresenter());
    this.el['share-on']!.addEventListener('click', () => this.share(this.el.share!.hidden === true));
    for (const field of ['link-t', 'link-slide', 'link-presenter', 'embed']) this.el[field]!.addEventListener('focus', (event) => (event.target as HTMLInputElement).select());
    this.el.fs!.addEventListener('click', () => this.fullscreen());
    // a click does not leave a button focused, so Space then pauses instead of pressing it again (Tab to a button still does)
    this.root.addEventListener('mousedown', (event) => { if ((event.target as HTMLElement).closest('button')) event.preventDefault(); });
    window.addEventListener('keydown', (event) => this.key(event));
    this.root.addEventListener('pointermove', () => this.wake());
    this.ui();
    this.notes();
  }

  private key(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (event.metaKey || event.ctrlKey || event.altKey || target.closest?.('.share')) return;
    // a focused corner button takes space and Enter itself (a click)
    if (target.closest?.('.corner') && [' ', 'Enter'].includes(event.key)) return;
    const command = keyCommand(event.key, event.shiftKey, this.mode);
    if (!command) return;
    switch (command.kind) {
      case 'next': this.next(); break;
      case 'prev': this.prev(); break;
      case 'slide': this.go(command.to === 'first' ? -1 : this.deck.count - 1); break;
      case 'toggle': this.toggle(); break;
      case 'pause': this.togglePause(); break;
      case 'seekBy': this.seek(this.t + command.by); break;
      case 'seekStart': this.seek(this.from); break;
      case 'narration': this.setNarration(!this.narration); break;
      case 'captions': this.setCaptions(!this.captionsOn); break;
      case 'notes': this.setNotes(!this.notesOn); break;
      case 'mode': this.setMode(this.mode === 'slides' ? 'video' : 'slides'); break;
      case 'mute': this.setMuted(!this.muted); break;
      case 'fullscreen': this.fullscreen(); break;
      case 'closeShare': this.share(false); break;
    }
    event.preventDefault();
    this.wake();
  }

  /** The presenter view, on the slide on screen (in video mode, the one at or before the current time). */
  private openPresenter() {
    if (this.mode === 'video') this.deck.sync(this.t);
    location.hash = viewHash('presenter', this.deck.target ?? this.deck.slide);
  }

  private fullscreen() {
    // a host's frame may refuse it
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else this.root.requestFullscreen?.().catch(() => {});
  }

  /** Links to this moment and slide, and an iframe that plays the current scene alone. */
  private share(open: boolean) {
    this.el.share!.hidden = !open;
    this.el['share-on']!.setAttribute('aria-pressed', String(open));
    if (!open) return;
    const scene = this.o.scene ?? sceneAt(this.engine.timeline, this.t) ?? '';
    if (this.mode === 'video') this.deck.sync(this.t); // the slide the presenter's link opens on
    const links = shareLinks(location, { title: this.o.title, scene: this.o.scene, sceneOnScreen: scene, t: this.t, slide: this.deck.slide });
    (this.el['link-t'] as HTMLInputElement).value = links.moment;
    (this.el['link-slide'] as HTMLInputElement).value = links.slide;
    (this.el['link-presenter'] as HTMLInputElement).value = links.presenter;
    (this.el['open-presenter'] as HTMLAnchorElement).href = links.presenter;
    (this.el.embed as HTMLTextAreaElement).value = links.embed;
  }

  /** The controls hide when nobody touches them: while the video plays, and always on a slide, so they don't cover it. */
  private wake() {
    this.root.classList.remove('idle');
    clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => { if (this.hides() && this.el.share!.hidden) this.root.classList.add('idle'); }, 2500);
  }

  private hides() { return this.playing || (this.mode === 'slides' && this.started); }

  /** The controls that change with the transport state. */
  private ui() {
    const slides = this.mode === 'slides';
    const ended = !this.playing && this.started && this.t >= this.to - 0.02;
    this.el.play!.innerHTML = this.playing ? ICON.pause : ended ? ICON.replay : ICON.play;
    this.el.play!.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    this.el.big!.innerHTML = ended && !slides ? ICON.replay : ICON.play;
    this.el.big!.setAttribute('aria-label', slides ? 'Start' : 'Play');
    this.el.big!.hidden = slides ? this.started : this.playing || (this.started && !ended);
    this.el.mute!.innerHTML = this.muted ? ICON.muted : ICON.sound;
    this.el.mute!.hidden = !(Object.keys(this.tracks).length > 0 && !this.silent);
    this.el.voice!.hidden = !(this.tracks.mix && this.tracks.effects);
    this.el.voice!.setAttribute('aria-pressed', String(this.narration));
    this.el.cc!.setAttribute('aria-pressed', String(this.captionsOn));
    this.el['notes-on']!.setAttribute('aria-pressed', String(this.notesOn));
    this.el['notes-on']!.hidden = !slides;
    this.el.notes!.hidden = !(slides && this.notesOn);
    this.el.mode!.setAttribute('aria-pressed', String(slides));
    this.el.mode!.hidden = this.deck.count === 0;
    this.el['presenter-on']!.hidden = this.deck.count === 0;
    this.el.progress!.hidden = !slides;
    this.el.corner!.hidden = !slides;
    paintCorner(this.el.corner!, { paused: this.ambient.paused, canBack: this.deck.slide >= 0 || this.deck.target !== null, canNext: this.deck.slide < this.deck.count - 1 || this.deck.target !== null });
    this.progress();
    this.el.play!.hidden = slides;
    this.el.pager!.hidden = !slides;
    this.el.time!.hidden = slides;
    $hide(this.el.scrub!.parentElement!, slides);
    for (const el of this.root.querySelectorAll('.share .for-slides')) $hide(el, !slides);
    const shown = this.deck.target ?? this.deck.slide;
    this.el.count!.textContent = `${shown + 1 > 0 ? shown + 1 : '–'} / ${this.deck.count}`;
    (this.el.back as HTMLButtonElement).disabled = this.deck.slide < 0 && this.deck.target === null;
    (this.el.fwd as HTMLButtonElement).disabled = this.deck.slide >= this.deck.count - 1 && this.deck.target === null;
    this.root.classList.toggle('playing', this.playing);
    if (!this.hides()) this.root.classList.remove('idle');
    else this.wake();
  }

  /** Speaker notes: what is said on the way to the slide on screen (or being played to). */
  private notes() {
    if (!this.el.notes) return;
    const k = this.deck.target ?? this.deck.slide;
    const lines = slideNotes({ authored: this.authored, spoken: this.captions }, this.deck.stops, this.from, k);
    this.el.notes!.innerHTML = k < 0
      ? '<p class="hint">Press → or click the slide to start. ← goes back.</p>'
      : `<h2>Slide ${k + 1} of ${this.deck.count}</h2>${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('') || '<p class="hint">No narration on this slide.</p>'}`;
    this.ui();
  }

  private progress() { paintProgress(this.el.progress!, this.deck.progress(this.t, this.ambient.paused)); }

  /** What changes with every frame: the time, the scrubber, the step's progress and the caption. */
  private tick() {
    this.progress();
    (this.el.scrub as HTMLInputElement).value = String(this.t);
    this.el.time!.textContent = `${clockText(this.t - this.from)} / ${clockText(this.to - this.from)}`;
    const caption = this.captionsOn && this.started ? captionAt(this.captions, this.t) : undefined;
    if (this.el.caption!.textContent !== (caption?.text ?? '')) this.el.caption!.textContent = caption?.text ?? '';
    this.el.caption!.hidden = !caption;
  }
}

function $hide(el: Element, hidden: boolean) { (el as HTMLElement).hidden = hidden; }
