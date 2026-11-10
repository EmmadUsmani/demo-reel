// The player: the engine draws each frame live (a frame is a pure function of its time), and the
// soundtrack plays alongside as an <audio> element that keeps the time. Two tracks, so the narration
// can be switched off: mix (voice and effects) and effects (the effects alone, not ducked).
// Two modes over the same frames: video (play straight through) and slides (deck.ts: each step plays
// from one stop to the next and holds). A player can also be limited to one scene, for embedding.
import type { Engine } from '../engine/engine';
import { PlaybackClock } from './clock';
import { Deck, type Move } from './deck';

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
};

type Caption = { at: number; end: number; text: string };
type Track = 'mix' | 'effects';

/** Built players carry MP3 (every browser, every host that serves audio); the dev server, audio.ts's WAVs. */
const AUDIO_EXT = import.meta.env.PLAYER_AUDIO;

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
  replay: '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M4 9v6h4l5 4V5L8 9z"/></svg>',
  muted: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  fullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M15.5 5.5L8.5 12l7 6.5z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M8.5 5.5l7 6.5-7 6.5z"/></svg>',
};

const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

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
  /** The browser refused to start the sound (autoplay rules): play silently until the next play. */
  private silent = false;
  private tracks: Partial<Record<Track, HTMLAudioElement>> = {};
  private narration: boolean;
  private captionsOn: boolean;
  private notesOn = false;
  private muted = false;
  private captions: Caption[];
  private idleTimer = 0;
  private el: Record<string, HTMLElement> = {};

  constructor(private root: HTMLElement, private canvas: HTMLCanvasElement, private engine: Engine, private o: PlayerOptions) {
    const entry = o.scene ? engine.timeline.find((e) => e.id === o.scene) : undefined;
    if (o.scene && !entry) throw new Error(`no scene '${o.scene}' (scenes: ${engine.timeline.map((e) => e.id).join(', ')})`);
    this.from = entry?.start ?? 0;
    this.to = entry?.end ?? engine.duration;
    this.clock = new PlaybackClock(this.to);
    this.deck = new Deck(engine.stops().map((s) => s.t).filter((t) => t >= this.from && t < this.to), this.from);
    this.mode = o.mode;
    this.narration = o.narration;
    this.captionsOn = o.captions;
    this.captions = engine.narration().map((line) => ({ at: line.at, end: line.until, text: line.caption ?? line.text }));
    this.t = Math.min(this.to - 1e-3, Math.max(this.from, o.t ?? (entry ? this.deck.stops.at(-1) ?? this.from : o.poster ?? this.poster())));
    if (this.mode === 'slides' && o.slide) { this.started = true; this.t = (this.deck.go(o.slide - 1) as { t: number }).t; }
    this.build();
    this.loadAudio();
    void this.loadCaptions();
    requestAnimationFrame((now) => this.frame(now));
  }

  /** Before playing, show a frame with something on it: the first stop, else the end of the first scene. */
  private poster() {
    const [first, second] = this.engine.timeline;
    return this.deck.stops[0] ?? Math.max(0, Math.min(second?.start ?? this.to, first?.end ?? this.to) - 1 / 60);
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
      // paused from outside (media keys, headphones unplugged, the browser): the video pauses with it
      audio.addEventListener('pause', () => { if (this.playing && audio === this.track() && !audio.ended) this.pause(); });
      audio.src = url;
      this.tracks[track] = audio;
    }
  }

  /** scripts/audio.ts times each caption to its speech; without it, a caption shows for its whole beat. */
  private async loadCaptions() {
    try {
      const response = await fetch(`audio/${this.o.name}/captions.json`);
      if (response.ok) this.captions = (await response.json()) as Caption[];
    } catch { /* keep the beat-long captions */ }
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
      if (audio !== heard || !this.playing) { if (!audio.paused) audio.pause(); continue; }
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
      this.sync();
    } else {
      this.playing = true; // before the seek, which would otherwise take the deck back to that slide
      this.seek(move.from);
      this.silent = false;
      this.clockReset();
      this.sync();
    }
    this.notes();
  }

  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
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
    if (this.playing) {
      this.t = this.clock.read(this.t, perf, this.track());
      if (this.mode === 'slides' && this.deck.arrive(this.t)) {
        this.playing = false;
        this.seek(this.deck.stops[this.deck.slide]!);
        this.sync();
      } else if (this.t >= this.to) {
        this.t = this.to - 1e-3;
        this.pause();
      }
    }
    try {
      if (this.t !== this.drawn) {
        const t = this.t;
        await this.engine.prepare(t);
        this.engine.render(t);
        this.drawn = t;
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
            <button class="pill share-on" aria-pressed="false">Share</button>
            <button class="fs" aria-label="Full screen" title="Full screen (f)">${ICON.fullscreen}</button>
          </div>
        </div>
        <div class="share" hidden>
          <label>Link to this moment<input class="link-t" readonly></label>
          <label class="for-slides">Link to this slide<input class="link-slide" readonly></label>
          <label>Embed this scene<textarea class="embed" readonly rows="4"></textarea></label>
        </div>
      </div></div>
      <aside class="notes" hidden></aside>`;
    const $ = (selector: string) => this.root.querySelector<HTMLElement>(selector)!;
    for (const name of ['frame', 'caption', 'big', 'bar', 'marks', 'scrub', 'tip', 'play', 'pager', 'back', 'count', 'fwd', 'mute', 'time', 'title', 'voice', 'cc', 'notes-on', 'mode', 'share-on', 'fs', 'share', 'link-t', 'link-slide', 'embed', 'notes']) this.el[name] = $(`.${name}`);
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
      const scene = this.engine.timeline.filter((e) => t >= e.start && t < e.end).at(-1)?.id;
      this.el.tip!.textContent = `${clock(t - this.from)}${scene ? `  ·  ${scene}` : ''}`;
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
    this.el['share-on']!.addEventListener('click', () => this.share(this.el.share!.hidden === true));
    for (const field of ['link-t', 'link-slide', 'embed']) this.el[field]!.addEventListener('focus', (event) => (event.target as HTMLInputElement).select());
    this.el.fs!.addEventListener('click', () => this.fullscreen());
    window.addEventListener('keydown', (event) => this.key(event));
    this.root.addEventListener('pointermove', () => this.wake());
    this.ui();
    this.notes();
  }

  private key(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement).closest?.('.share')) return;
    const k = event.key, slides = this.mode === 'slides';
    if (slides && [' ', 'ArrowRight', 'PageDown', 'Enter'].includes(k)) this.next();
    else if (slides && ['ArrowLeft', 'PageUp', 'Backspace'].includes(k)) this.prev();
    else if (slides && k === 'Home') this.go(-1);
    else if (slides && k === 'End') this.go(this.deck.count - 1);
    else if (k === ' ' || k === 'k') this.toggle();
    else if (k === 'ArrowRight') this.seek(this.t + (event.shiftKey ? 1 / 60 : 5));
    else if (k === 'ArrowLeft') this.seek(this.t - (event.shiftKey ? 1 / 60 : 5));
    else if (k === 'Home') this.seek(this.from);
    else if (k === 'n') this.setNarration(!this.narration);
    else if (k === 'c') this.setCaptions(!this.captionsOn);
    else if (k === 's') this.setNotes(!this.notesOn);
    else if (k === 'v') this.setMode(slides ? 'video' : 'slides');
    else if (k === 'm') this.setMuted(!this.muted);
    else if (k === 'f') this.fullscreen();
    else if (k === 'Escape') this.share(false);
    else return;
    event.preventDefault();
    this.wake();
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
    const base = `${location.origin === 'null' ? '' : location.origin}${location.pathname}`;
    const keep = new URLSearchParams(location.search);
    for (const k of ['t', 'slide', 'mode', 'scene']) keep.delete(k);
    const url = (params: Record<string, string>) => {
      const q = new URLSearchParams(keep);
      for (const [k, v] of Object.entries(params)) q.set(k, v);
      return `${base}?${q}`;
    };
    const scene = this.o.scene ?? this.engine.timeline.filter((e) => this.t >= e.start && this.t < e.end).at(-1)?.id ?? '';
    (this.el['link-t'] as HTMLInputElement).value = url({ ...(this.o.scene ? { scene: this.o.scene } : {}), t: this.t.toFixed(2) });
    (this.el['link-slide'] as HTMLInputElement).value = url({ ...(this.o.scene ? { scene: this.o.scene } : {}), mode: 'slides', slide: String(Math.max(1, this.deck.slide + 1)) });
    (this.el.embed as HTMLTextAreaElement).value = `<iframe src="${escape(url({ scene }))}" width="960" height="540" style="border:0" allow="autoplay; fullscreen" allowfullscreen title="${escape(`${this.o.title}: ${scene}`)}"></iframe>`;
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
    this.el.play!.hidden = slides;
    this.el.pager!.hidden = !slides;
    this.el.time!.hidden = slides;
    $hide(this.el.scrub!.parentElement!, slides);
    $hide(this.root.querySelector('.share .for-slides')!, !slides);
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
    const lines = k < 0 ? [] : this.captions.filter((c) => c.at > (this.deck.stops[k - 1] ?? this.from) - 1e-6 && c.at <= this.deck.stops[k]!);
    this.el.notes!.innerHTML = k < 0
      ? '<p class="hint">Press → or click the slide to start. ← goes back.</p>'
      : `<h2>Slide ${k + 1} of ${this.deck.count}</h2>${lines.map((l) => `<p>${escape(l.text)}</p>`).join('') || '<p class="hint">No narration on this slide.</p>'}`;
    this.ui();
  }

  /** What changes with every frame: the time, the scrubber and the caption. */
  private tick() {
    (this.el.scrub as HTMLInputElement).value = String(this.t);
    this.el.time!.textContent = `${clock(this.t - this.from)} / ${clock(this.to - this.from)}`;
    const caption = this.captionsOn && this.started ? this.captions.find((c) => this.t >= c.at && this.t < c.end) : undefined;
    if (this.el.caption!.textContent !== (caption?.text ?? '')) this.el.caption!.textContent = caption?.text ?? '';
    this.el.caption!.hidden = !caption;
  }
}

function $hide(el: Element, hidden: boolean) { (el as HTMLElement).hidden = hidden; }
