// Playing a recorded clip (capture/record.ts): which frame shows at a scene time, where the pointer
// was, and when it clicked or typed. A scene plans its playback as segments — play a stretch of the
// recording, hold a frame — so a beat can be held for its narration without re-recording, and the
// sounds and lines a scene declares anchor to the clip's own named marks.
import { footageUrl, type Footage } from './assets';

export type ClipFrame = { file: string; x: number; y: number; down: boolean; url?: string; key?: string; wheel?: number };
export type Clip = {
  dir: string;
  fps: number;
  scrollY: number;
  frames: ClipFrame[];
  marks: Record<string, { frame: number; scrollY?: number; boxes: Record<string, { x: number; y: number; w: number; h: number }> }>;
};

type Segment = { start: number; dur: number; from: number; to: number };
type At = number | string;

/** Decoded frames, least recently used first out: a clip is thousands of 2880x1800 frames. */
class FrameCache {
  private bitmaps = new Map<string, ImageBitmap>();
  private loading = new Map<string, Promise<ImageBitmap>>();
  constructor(private capacity = 10) {}

  get(url: string) {
    const bitmap = this.bitmaps.get(url);
    if (bitmap) { this.bitmaps.delete(url); this.bitmaps.set(url, bitmap); }
    return bitmap;
  }

  async load(url: string) {
    const cached = this.get(url);
    if (cached) return cached;
    if (!this.loading.has(url)) {
      this.loading.set(url, (async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
        const bitmap = await createImageBitmap(await response.blob());
        this.bitmaps.set(url, bitmap);
        while (this.bitmaps.size > this.capacity) {
          const [oldest, old] = this.bitmaps.entries().next().value as [string, ImageBitmap];
          this.bitmaps.delete(oldest);
          old.close();
        }
        this.loading.delete(url);
        return bitmap;
      })());
    }
    return this.loading.get(url)!;
  }
}

const cache = new FrameCache(12);

export class ClipPlayer {
  readonly clip: Clip;
  private segments: Segment[] = [];
  private cursor = 0;
  private lastFrame = 0;
  private urls: string[] = [];

  constructor(readonly footage: Footage, readonly id: string) {
    const clip = footage.clips[id];
    if (!clip) throw new Error(`no clip '${id}' in footage/${footage.name} (record it: bun capture/${footage.name}.ts)`);
    this.clip = clip;
    // the address bar is recorded only where it changes
    let url = '';
    this.urls = clip.frames.map((frame) => (url = frame.url ?? url));
  }

  get frameCount() { return this.clip.frames.length; }
  get duration() { return this.cursor; }

  /** A mark's frame, or a frame index; 'start' and 'end' are the clip's own ends. */
  frameOf(at: At): number {
    if (typeof at === 'number') return Math.max(0, Math.min(this.frameCount - 1, at));
    if (at === 'start') return 0;
    if (at === 'end') return this.frameCount - 1;
    const mark = this.clip.marks[at];
    if (!mark) throw new Error(`clip '${this.id}' has no mark '${at}' (marks: ${Object.keys(this.clip.marks).join(', ')})`);
    return mark.frame;
  }

  /**
   * A mark's element boxes in the scene's page space. Frames are drawn at the clip's starting scroll,
   * so a box measured after the page scrolled (or navigated) is moved by the difference.
   */
  boxes(mark: string) {
    const found = this.clip.marks[mark];
    if (!found) throw new Error(`clip '${this.id}' has no mark '${mark}'`);
    const shift = this.clip.scrollY - (found.scrollY ?? this.clip.scrollY);
    return Object.fromEntries(Object.entries(found.boxes).map(([key, box]) => [key, { ...box, y: box.y + shift }]));
  }

  /** Play the recording from one point to another at `rate` (1 = as recorded). */
  play(from: At, to: At = 'end', rate = 1) {
    const a = this.frameOf(from), b = this.frameOf(to);
    const dur = Math.abs(b - a) / (this.clip.fps * rate);
    this.segments.push({ start: this.cursor, dur, from: a, to: b });
    this.cursor += dur;
    this.lastFrame = b;
    return this;
  }

  /** Hold the last frame played (or a given one) for `seconds`. */
  hold(seconds: number, at?: At) {
    const frame = at === undefined ? this.lastFrame : this.frameOf(at);
    this.segments.push({ start: this.cursor, dur: seconds, from: frame, to: frame });
    this.cursor += seconds;
    this.lastFrame = frame;
    return this;
  }

  /** Play through to the end, then hold the last frame until `total` seconds. */
  until(total: number) {
    if (total > this.cursor) this.hold(total - this.cursor);
    return this;
  }

  /** The frame that shows at scene time `t`. */
  frameAt(t: number): number {
    if (!this.segments.length) return 0;
    let segment = this.segments[this.segments.length - 1]!;
    for (const s of this.segments) if (t < s.start + s.dur) { segment = s; break; }
    if (t < segment.start) return segment.from;
    const k = segment.dur > 0 ? Math.min(1, (t - segment.start) / segment.dur) : 1;
    return Math.round(segment.from + (segment.to - segment.from) * k);
  }

  /** The first scene time at which a frame (or mark) shows. */
  timeOf(at: At): number {
    const frame = this.frameOf(at);
    for (const s of this.segments) {
      const lo = Math.min(s.from, s.to), hi = Math.max(s.from, s.to);
      if (frame < lo || frame > hi) continue;
      if (s.from === s.to) return s.start;
      return s.start + (Math.abs(frame - s.from) / Math.abs(s.to - s.from)) * s.dur;
    }
    throw new Error(`clip '${this.id}': frame ${frame} (${String(at)}) never plays in this scene's plan`);
  }

  /** Scene times of every press (button down), release (button up), keystroke and wheel notch that plays. */
  events(kind: 'press' | 'release' | 'key' | 'wheel') {
    const times: number[] = [];
    this.clip.frames.forEach((frame, i) => {
      const previous = this.clip.frames[i - 1];
      const hit = kind === 'key' ? Boolean(frame.key) : kind === 'wheel' ? Boolean(frame.wheel) : kind === 'press' ? frame.down && !previous?.down : !frame.down && Boolean(previous?.down);
      if (!hit) return;
      try { times.push(this.timeOf(i)); } catch { /* not in this scene's plan */ }
    });
    return times;
  }

  pointer(t: number) {
    const frame = this.clip.frames[this.frameAt(t)]!;
    return { x: frame.x, y: frame.y + this.clip.scrollY, down: frame.down };
  }

  url(t: number) { return this.urls[this.frameAt(t)] ?? ''; }

  private frameUrl(i: number) { return footageUrl(this.footage.name, `${this.clip.dir}/${this.clip.frames[i]!.file}`); }

  /** Decode the frames scene time t needs (and the next one), before the frame is drawn. */
  async prepare(t: number) {
    const i = this.frameAt(t);
    await Promise.all([cache.load(this.frameUrl(i)), i + 1 < this.frameCount ? cache.load(this.frameUrl(i + 1)) : null]);
  }

  /** The decoded frame for scene time t (prepare() first), or the nearest one already decoded. */
  bitmap(t: number) {
    const i = this.frameAt(t);
    for (let d = 0; d < 30; d++) {
      const hit = cache.get(this.frameUrl(Math.max(0, i - d)));
      if (hit) return hit;
    }
    return undefined;
  }
}
