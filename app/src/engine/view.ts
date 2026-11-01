// The app on screen: captured footage inside a browser window, a page scroll, and a camera over the
// whole composition. Three spaces:
//   page   — the app's document CSS px (where the captured element boxes live)
//   world  — the 1920x1080 composition the window sits in
//   screen — world through the camera (focus + zoom), what the viewer sees
import type { Box, Footage, Shot } from './assets';
import { browserWindow, WINDOW_BAR } from './draw';
import { H, W, type Cue } from './scene';
import { clamp, ease, lerp, type Ease } from './util';

type G = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type Camera = { fx: number; fy: number; zoom: number };

export class AppView {
  /** Window position in world px, and page px → world px. */
  x: number;
  y: number;
  s = 1;
  scrollY = 0;
  camera: Camera = { fx: W / 2, fy: H / 2, zoom: 1 };

  constructor(readonly footage: Footage, public url: string) {
    const { width, height } = footage.viewport;
    this.x = (W - width * this.s) / 2;
    this.y = (H - (height * this.s + WINDOW_BAR)) / 2;
  }

  get viewportW() { return this.footage.viewport.width; }
  get viewportH() { return this.footage.viewport.height; }

  worldOfPage(px: number, py: number): [number, number] {
    return [this.x + px * this.s, this.y + WINDOW_BAR + (py - this.scrollY) * this.s];
  }

  screenOfWorld(wx: number, wy: number): [number, number] {
    const { fx, fy, zoom } = this.camera;
    return [(wx - fx) * zoom + W / 2, (wy - fy) * zoom + H / 2];
  }

  screenOfPage(px: number, py: number) { return this.screenOfWorld(...this.worldOfPage(px, py)); }

  /** A page box as the viewer sees it. */
  screenBox(box: Box): Box {
    const [x0, y0] = this.screenOfPage(box.x, box.y);
    const [x1, y1] = this.screenOfPage(box.x + box.w, box.y + box.h);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /** Screen px per page px: how big the app reads right now. */
  get magnification() { return this.s * this.camera.zoom; }

  /** The camera that centres a page box at `zoom`, at the current scroll. */
  aim(box: Box, zoom: number, dx = 0, dy = 0): Camera {
    const [fx, fy] = this.worldOfPage(box.x + box.w / 2 + dx, box.y + box.h / 2 + dy);
    return { fx, fy, zoom };
  }

  /** The zoomed-out camera: the whole window centred. */
  get wide(): Camera { return { fx: W / 2, fy: H / 2, zoom: 1 }; }

  /**
   * Draw the window with `layers` painting the page (in page px, already scrolled and clipped).
   * Everything is drawn through the camera.
   */
  draw(g: G, layers: (g: G) => void) {
    const { fx, fy, zoom } = this.camera;
    g.save();
    g.translate(W / 2, H / 2);
    g.scale(zoom, zoom);
    g.translate(-fx, -fy);
    browserWindow(g, this.x, this.y, this.viewportW * this.s, this.viewportH * this.s, this.url, () => {
      g.translate(this.x, this.y + WINDOW_BAR);
      g.scale(this.s, this.s);
      g.translate(0, -this.scrollY);
      layers(g);
    });
    g.restore();
  }

  /** Paint the part of a shot that is inside the viewport at the current scroll. */
  plate(g: G, shot: Shot, alpha = 1) {
    if (alpha <= 0) return;
    const dpr = this.footage.dpr;
    const top = Math.max(this.scrollY, shot.scrollY);
    const bottom = Math.min(this.scrollY + this.viewportH, shot.scrollY + shot.h);
    if (bottom <= top) return;
    g.save();
    g.globalAlpha *= alpha;
    g.drawImage(shot.image, 0, (top - shot.scrollY) * dpr, shot.w * dpr, (bottom - top) * dpr, 0, top, shot.w, bottom - top);
    g.restore();
  }

  /** Paint a viewport-sized frame (a clip's) taken at page offset `scrollY`. */
  image(g: G, bitmap: ImageBitmap, scrollY: number, alpha = 1) {
    if (alpha <= 0) return;
    g.save();
    g.globalAlpha *= alpha;
    g.drawImage(bitmap, 0, scrollY, this.viewportW, this.viewportH);
    g.restore();
  }

  /**
   * Replay a CSS marquee (a scrolling logo or testimonial rail) on a plate shot with its track hidden:
   * the track lifted out by capture/lib.ts liftMarquee() slides left one copy per loop, under a
   * 12% / 88% fade mask. `key` is the extra the capture stored it under.
   */
  marquee(g: G, rail: Box, t: number, key = 'marquee') {
    const track = this.footage.extras[key];
    if (!track) throw new Error(`footage/${this.footage.name} has no marquee extra '${key}'`);
    const image = this.footage.images[track.file];
    if (!image) return;
    const dpr = this.footage.dpr;
    const offset = ((t % track.loopSeconds) / track.loopSeconds) * track.copyWidth;
    const buffer = this.railBuffer(rail, track.height, dpr);
    const b = buffer.g;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'source-over';
    b.clearRect(0, 0, buffer.canvas.width, buffer.canvas.height);
    b.drawImage(image, -offset * dpr, 0);
    b.globalCompositeOperation = 'destination-in';
    const mask = b.createLinearGradient(0, 0, buffer.canvas.width, 0);
    mask.addColorStop(0, 'rgba(0,0,0,0)');
    mask.addColorStop(0.12, '#000');
    mask.addColorStop(0.88, '#000');
    mask.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = mask;
    b.fillRect(0, 0, buffer.canvas.width, buffer.canvas.height);
    g.drawImage(buffer.canvas, rail.x, rail.y, rail.w, track.height);
  }

  private buffers = new Map<string, { canvas: OffscreenCanvas; g: OffscreenCanvasRenderingContext2D }>();
  private railBuffer(rail: Box, height: number, dpr: number) {
    const key = `${rail.w}x${height}`;
    if (!this.buffers.has(key)) {
      const canvas = new OffscreenCanvas(Math.ceil(rail.w * dpr), Math.ceil(height * dpr));
      this.buffers.set(key, { canvas, g: canvas.getContext('2d')! });
    }
    return this.buffers.get(key)!;
  }
}

/**
 * Keep a close-up inside the browser window: a camera aimed at something near the window's edge is
 * moved just enough that the frame never shows past it.
 */
export function insideWindow(view: AppView, camera: Camera): Camera {
  const halfW = W / 2 / camera.zoom, halfH = H / 2 / camera.zoom;
  const left = view.x + halfW, top = view.y + halfH;
  const right = view.x + view.viewportW * view.s - halfW, bottom = view.y + WINDOW_BAR + view.viewportH * view.s - halfH;
  // zoomed out past the window's own size on an axis, centre on it instead
  const fit = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : clamp(v, lo, hi));
  return { ...camera, fx: fit(camera.fx, left, right), fy: fit(camera.fy, top, bottom) };
}

export function mixCamera(a: Camera, b: Camera, k: number): Camera {
  // Zoom interpolates geometrically so a push feels even; the focus follows linearly.
  return { fx: lerp(a.fx, b.fx, k), fy: lerp(a.fy, b.fy, k), zoom: a.zoom * (b.zoom / a.zoom) ** k };
}

/**
 * Keyframed camera: [[time, camera, easeInto, hop], ...]. `hop` pulls the zoom back by that fraction
 * mid-move, so a pan between two close-ups reads as "out, across, in" instead of a flat slide.
 */
export function cameraAt(t: number, frames: [number, Camera, Ease?, number?][]): Camera {
  if (t <= frames[0]![0]) return frames[0]![1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, c1, e = ease.inOutCubic, hop = 0] = frames[i]!;
    const [t0, c0] = frames[i - 1]!;
    if (t <= t1) {
      const k = e(Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
      const mixed = mixCamera(c0, c1, k);
      return { ...mixed, zoom: mixed.zoom * (1 - hop * Math.sin(Math.PI * k)) };
    }
  }
  return frames[frames.length - 1]![1];
}

/** A whoosh for every move between two camera keys: in, out, or across by how the zoom changes. */
export function cameraCues(frames: [number, Camera, Ease?, number?][], gain = 1): Cue[] {
  const cues: Cue[] = [];
  for (let i = 1; i < frames.length; i++) {
    const [t0, a] = frames[i - 1]!;
    const [t1, b] = frames[i]!;
    const moved = Math.hypot(b.fx - a.fx, b.fy - a.fy) > 8 || Math.abs(Math.log(b.zoom / a.zoom)) > 0.02;
    if (!moved) continue;
    const ratio = b.zoom / a.zoom;
    const kind = ratio > 1.15 ? 'whoosh-in' : ratio < 0.87 ? 'whoosh-out' : 'whoosh-across';
    cues.push({ kind, t: t0, dur: t1 - t0, gain });
  }
  return cues;
}
