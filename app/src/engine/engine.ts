// The player core: which scene plays when, and how a frame is drawn. A frame is a pure function of
// its time, so the preview, a still and the export all produce the same pixels.
import { H, PH, PW, SCALE, W, type Cue, type Frame, type Line, type Note, type Scene, type SceneClass } from './scene';
import { placeInScene, placeStops, type Stop } from './stops';

export type TimelineEntry = {
  id: string;
  load: () => Promise<{ default: SceneClass }>;
  /** Laid out by the engine: each entry starts where the previous one ends, less its `overlap`. */
  start: number;
  end: number;
  /** Seconds; omit to let the scene say (Scene.duration()). */
  dur?: number;
  /** Seconds this entry starts before the previous one ends: a crossfade. */
  overlap?: number;
  params?: Record<string, any>;
};

type Layer = { canvas: OffscreenCanvas; g: OffscreenCanvasRenderingContext2D };

function makeLayer(): Layer {
  const canvas = new OffscreenCanvas(PW, PH);
  const g = canvas.getContext('2d', { alpha: false })!;
  return { canvas, g };
}

export class Engine {
  readonly g: CanvasRenderingContext2D;
  timeline: TimelineEntry[] = [];
  scenes = new Map<string, Scene>();
  errors: string[] = [];
  private under = makeLayer();
  private over = makeLayer();
  private sub = makeLayer();

  constructor(readonly canvas: HTMLCanvasElement, private makeTimeline: () => TimelineEntry[]) {
    canvas.width = PW;
    canvas.height = PH;
    this.g = canvas.getContext('2d', { alpha: false })!;
  }

  get duration() { return Math.max(...this.timeline.map((e) => e.end)); }

  /**
   * Load every scene, then lay the edit out end to end: a scene's length is its entry's `dur` or
   * what the scene asks for, so holding a beat for its narration moves everything after it. Every
   * scene is loaded (even with `only`) because each one's length places the next.
   */
  async init(only?: (e: TimelineEntry) => boolean) {
    this.timeline = this.makeTimeline();
    let end = 0;
    for (const entry of this.timeline) {
      let scene: Scene | undefined;
      try {
        const SceneModule = (await entry.load()).default;
        scene = new SceneModule({ g: this.g, start: 0, end: 0, params: entry.params ?? {} });
        await scene.init();
      } catch (error: any) {
        // a scene that failed to load (a clip not recorded yet) holds a one-second gap
        scene = undefined;
        this.errors.push(`${entry.id}: ${error?.stack ?? error}`);
      }
      entry.start = Math.max(0, end - (entry.overlap ?? 0));
      entry.end = entry.start + (entry.dur ?? scene?.duration() ?? 1);
      end = entry.end;
      if (scene && (!only || only(entry))) {
        Object.assign((scene as any).ctx, { start: entry.start, end: entry.end });
        this.scenes.set(entry.id, scene);
      }
    }
  }

  /** Decode what the frame at t (and its sub-frames) needs; render(t) after this resolves. */
  async prepare(t: number, samples = 1, shutter = 0.5, fps = 60, ambient = t) {
    const span = samples > 1 ? shutter / fps / 2 : 0;
    const active = this.timeline.filter((e) => t + span >= e.start && t - span < e.end && this.scenes.has(e.id));
    await Promise.all(active.map((entry) => {
      const dur = entry.end - entry.start;
      const frame = (at: number): Frame => ({ t: at, ambient: ambient + (at - t), lt: at - entry.start, p: (at - entry.start) / dur, dur });
      const scene = this.scenes.get(entry.id)!;
      return Promise.all([scene.prepare(frame(t)), span ? scene.prepare(frame(t - span)) : null, span ? scene.prepare(frame(t + span)) : null]);
    }));
  }

  /**
   * Draw the frame at t into the visible canvas. With samples > 1, average sub-frames over the shutter (motion blur).
   * `ambient` is the clock for motion that goes on while a deck holds a slide (Frame.ambient); it is t unless a player says otherwise.
   */
  render(t: number, samples = 1, shutter = 0.5, fps = 60, ambient = t) {
    if (samples <= 1) return this.composite(t, this.g, ambient);
    // Running average: sub-frame k goes over the previous k at 1/(k+1), which leaves each at 1/n.
    for (let k = 0; k < samples; k++) {
      const ts = t + ((k + 0.5) / samples - 0.5) * (shutter / fps);
      this.composite(ts, this.sub.g, ambient + (ts - t));
      this.g.setTransform(1, 0, 0, 1, 0, 0);
      this.g.globalAlpha = 1 / (k + 1);
      this.g.drawImage(this.sub.canvas, 0, 0);
    }
    this.g.globalAlpha = 1;
  }

  /** Overlapping entries crossfade: the earlier one underneath, the later one over it by its fade-in. */
  private composite(t: number, target: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, ambient: number) {
    const active = this.timeline.filter((e) => t >= e.start && t < e.end && this.scenes.has(e.id));
    if (active.length === 0) {
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.fillStyle = '#fff';
      target.fillRect(0, 0, PW, PH);
      return;
    }
    if (active.length === 1) return this.draw(active[0]!, t, ambient, target);
    const [a, b] = active.slice(-2) as [TimelineEntry, TimelineEntry];
    this.draw(a, t, ambient, this.under.g);
    this.draw(b, t, ambient, this.over.g);
    const fade = (t - b.start) / Math.max(1e-3, a.end - b.start);
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalAlpha = 1;
    target.drawImage(this.under.canvas, 0, 0);
    target.globalAlpha = Math.min(1, Math.max(0, fade));
    target.drawImage(this.over.canvas, 0, 0);
    target.globalAlpha = 1;
  }

  private draw(entry: TimelineEntry, t: number, ambient: number, target: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) {
    const scene = this.scenes.get(entry.id)!;
    (scene as any).ctx.g = target;
    target.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    target.globalAlpha = 1;
    target.globalCompositeOperation = 'source-over';
    target.imageSmoothingEnabled = true;
    target.imageSmoothingQuality = 'high';
    target.fillStyle = '#fff';
    target.fillRect(0, 0, W, H);
    const dur = entry.end - entry.start;
    const frame: Frame = { t, ambient, lt: t - entry.start, p: (t - entry.start) / dur, dur };
    try {
      target.save();
      scene.render(frame);
      target.restore();
    } catch (error: any) {
      target.restore();
      const message = `${entry.id}: ${error?.stack ?? error}`;
      if (!this.errors.includes(message)) this.errors.push(message);
    }
  }

  /** Every scene's sound cues, in video time. */
  cues(): (Cue & { scene: string })[] {
    return this.timeline.flatMap((entry) => (this.scenes.get(entry.id)?.cues() ?? []).map((cue) => ({ ...cue, t: cue.t + entry.start, scene: entry.id })))
      .sort((a, b) => a.t - b.t);
  }

  /** Every scene's narration, in video time. */
  narration(): (Line & { scene: string })[] {
    return this.timeline.flatMap((entry) => (this.scenes.get(entry.id)?.narration() ?? []).map((line) => ({ ...line, at: line.at + entry.start, until: line.until + entry.start, scene: entry.id })))
      .sort((a, b) => a.at - b.at);
  }

  /** Every scene's authored speaker notes, in video time, moved clear of crossfades as its stops are (so a note at a stop stays with it). */
  notes(): (Note & { scene: string })[] {
    return this.timeline.flatMap((entry, i) => (this.scenes.get(entry.id)?.notes() ?? []).map((note) => ({ ...note, at: placeInScene(this.timeline, i, note.at), scene: entry.id })))
      .sort((a, b) => a.at - b.at);
  }

  /** Where a deck pauses, in video time (engine/stops.ts): only the loaded scenes'. */
  stops(): Stop[] {
    return placeStops(this.timeline, new Map([...this.scenes].map(([id, scene]) => [id, scene.stops()])));
  }

  /** The visible canvas as tightly packed RGBA, top row first. */
  pixels(): Uint8ClampedArray {
    return this.g.getImageData(0, 0, PW, PH).data;
  }
}
