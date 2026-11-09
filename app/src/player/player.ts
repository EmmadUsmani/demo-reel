// The player: the engine draws each frame live (a frame is a pure function of its time), and the
// soundtrack plays alongside as an <audio> element that keeps the time. Two tracks, so the narration
// can be switched off: mix (voice and effects) and effects (the effects alone, not ducked).
import type { Engine } from '../engine/engine';
import { PlaybackClock } from './clock';

export type PlayerOptions = {
  /** The edit, which names its soundtrack folder: audio/<name>/. */
  name: string;
  title: string;
  /** Where to start (and what the poster shows), s. */
  t?: number;
  /** The frame shown before the first play, s (Edit.poster); without one, the end of the first scene. */
  poster?: number;
  captions: boolean;
  narration: boolean;
};

type Caption = { at: number; end: number; text: string };
type Track = 'mix' | 'effects';

/** Built players carry AAC; the dev server plays scripts/audio.ts's WAVs where they are. */
const AUDIO_EXT = import.meta.env.PLAYER_BUILD ? 'm4a' : 'wav';

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
  replay: '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M4 9v6h4l5 4V5L8 9z"/></svg>',
  muted: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  fullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
};

const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

export class Player {
  private t: number;
  private playing = false;
  private started = false;
  private drawn = Number.NaN;
  /** The span played: the whole edit. */
  private from = 0;
  private to: number;
  private clock: PlaybackClock;
  /** The browser refused to start the sound (autoplay rules): play silently until the next play. */
  private silent = false;
  private tracks: Partial<Record<Track, HTMLAudioElement>> = {};
  private narration: boolean;
  private captionsOn: boolean;
  private muted = false;
  private captions: Caption[];
  private idleTimer = 0;
  private el: Record<string, HTMLElement> = {};

  constructor(private root: HTMLElement, private canvas: HTMLCanvasElement, private engine: Engine, private o: PlayerOptions) {
    this.to = engine.duration;
    this.clock = new PlaybackClock(this.to);
    this.narration = o.narration;
    this.captionsOn = o.captions;
    this.captions = engine.narration().map((line) => ({ at: line.at, end: line.until, text: line.caption ?? line.text }));
    this.t = o.t ?? o.poster ?? this.poster();
    this.build();
    this.loadAudio();
    void this.loadCaptions();
    requestAnimationFrame((now) => this.frame(now));
  }

  /** Before playing, show a frame with something on it: the end of the first scene, not its blank start. */
  private poster() {
    const [first, second] = this.engine.timeline;
    return Math.max(0, Math.min(second?.start ?? this.to, first?.end ?? this.to) - 1 / 60);
  }

  // ------------------------------------------------------------------ sound

  private loadAudio() {
    for (const track of ['mix', 'effects'] as Track[]) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.addEventListener('error', () => {
        console.warn(`no ${track} soundtrack (${audio.src}): ${audio.error?.message ?? 'failed to load'}`);
        delete this.tracks[track];
        this.clockReset();
        this.sync();
      });
      // paused from outside (media keys, headphones unplugged, the browser): the video pauses with it
      audio.addEventListener('pause', () => { if (this.playing && audio === this.track() && !audio.ended) this.pause(); });
      audio.src = `audio/${this.o.name}/${track}.${AUDIO_EXT}`;
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

  toggle() { if (this.playing) this.pause(); else this.play(); }

  seek(t: number) {
    this.t = Math.min(this.to - 1e-3, Math.max(this.from, t));
    this.clockReset();
    const audio = this.track();
    if (audio) audio.currentTime = this.t;
    this.drawn = Number.NaN;
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
          if (error.name === 'AbortError') return; // a pause or a switch got there first
          this.silent = true; // blocked: the wall clock keeps time, and the next play tries again
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

  // ------------------------------------------------------------------ drawing

  private async frame(perf: number) {
    if (this.playing) {
      this.t = this.clock.read(this.t, perf, this.track());
      if (this.t >= this.to) { this.t = this.to - 1e-3; this.pause(); }
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
    this.root.innerHTML = `
      <div class="stage"><div class="frame">
        <div class="caption" hidden></div>
        <button class="big" aria-label="Play">${ICON.play}</button>
        <div class="bar">
          <div class="track"><div class="marks"></div><input class="scrub" type="range" min="0" step="0.01" aria-label="Seek"><div class="tip" hidden></div></div>
          <div class="row">
            <button class="play" aria-label="Play">${ICON.play}</button>
            <button class="mute" aria-label="Mute">${ICON.sound}</button>
            <span class="time"></span>
            <span class="title"></span>
            <span class="grow"></span>
            <button class="pill voice" aria-pressed="true" title="Narration (n)">Narration</button>
            <button class="pill cc" aria-pressed="false" title="Captions (c)">CC</button>
            <button class="fs" aria-label="Full screen" title="Full screen (f)">${ICON.fullscreen}</button>
          </div>
        </div>
      </div></div>`;
    const $ = (selector: string) => this.root.querySelector<HTMLElement>(selector)!;
    for (const name of ['frame', 'caption', 'big', 'bar', 'marks', 'scrub', 'tip', 'play', 'mute', 'time', 'title', 'voice', 'cc', 'fs']) this.el[name] = $(`.${name}`);
    this.el.frame!.prepend(this.canvas);
    this.el.title!.textContent = this.o.title;

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
      this.el.tip!.textContent = `${clock(t)}${scene ? `  ·  ${scene}` : ''}`;
      this.el.tip!.style.left = `${event.clientX - box.left}px`;
      this.el.tip!.hidden = false;
    });
    track.addEventListener('pointerleave', () => { this.el.tip!.hidden = true; });

    this.canvas.addEventListener('click', () => this.toggle());
    this.el.big!.addEventListener('click', () => this.toggle());
    this.el.play!.addEventListener('click', () => this.toggle());
    this.el.mute!.addEventListener('click', () => this.setMuted(!this.muted));
    this.el.voice!.addEventListener('click', () => this.setNarration(!this.narration));
    this.el.cc!.addEventListener('click', () => this.setCaptions(!this.captionsOn));
    this.el.fs!.addEventListener('click', () => this.fullscreen());
    window.addEventListener('keydown', (event) => this.key(event));
    this.root.addEventListener('pointermove', () => this.wake());
    this.ui();
  }

  private key(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const k = event.key;
    if (k === ' ' || k === 'k') this.toggle();
    else if (k === 'ArrowRight') this.seek(this.t + (event.shiftKey ? 1 / 60 : 5));
    else if (k === 'ArrowLeft') this.seek(this.t - (event.shiftKey ? 1 / 60 : 5));
    else if (k === 'Home') this.seek(this.from);
    else if (k === 'n') this.setNarration(!this.narration);
    else if (k === 'c') this.setCaptions(!this.captionsOn);
    else if (k === 'm') this.setMuted(!this.muted);
    else if (k === 'f') this.fullscreen();
    else return;
    event.preventDefault();
    this.wake();
  }

  private fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void this.root.requestFullscreen?.();
  }

  /** The controls hide while the video plays and nobody touches it. */
  private wake() {
    this.root.classList.remove('idle');
    clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => { if (this.playing) this.root.classList.add('idle'); }, 2500);
  }

  /** The controls that change with the transport state. */
  private ui() {
    const ended = !this.playing && this.started && this.t >= this.to - 0.02;
    this.el.play!.innerHTML = this.playing ? ICON.pause : ended ? ICON.replay : ICON.play;
    this.el.play!.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    this.el.big!.innerHTML = ended ? ICON.replay : ICON.play;
    this.el.big!.hidden = this.playing || (this.started && !ended);
    this.el.mute!.innerHTML = this.muted ? ICON.muted : ICON.sound;
    const sound = Object.keys(this.tracks).length > 0 && !this.silent;
    this.el.mute!.hidden = !sound;
    this.el.voice!.hidden = !(this.tracks.mix && this.tracks.effects);
    this.el.voice!.setAttribute('aria-pressed', String(this.narration));
    this.el.cc!.setAttribute('aria-pressed', String(this.captionsOn));
    this.root.classList.toggle('playing', this.playing);
    if (!this.playing) this.root.classList.remove('idle');
    else this.wake();
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
