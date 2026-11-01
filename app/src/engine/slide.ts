// Primitives for slide-style scenes (a title sequence, a pitch, a recap), in the same language as
// the footage scenes: paper cards, the theme's accent, the display face for headlines, and a camera
// that pushes into what's being said.
import { roundRect } from './draw';
import { C, font, shadow, withAlpha } from './palette';
import { H, W } from './scene';
import { clamp, ease, keys, lerp, type Ease } from './util';

type G = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** An emoji, drawn with the system's colour emoji face, centred on (x, y). */
export function emoji(g: G, char: string, x: number, y: number, size: number) {
  g.save();
  g.font = `${size}px "Apple Color Emoji"`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(char, x, y + size * 0.06);
  g.restore();
}

/** A card on polaroid paper with the page's soft shadow. */
export function card(g: G, x: number, y: number, w: number, h: number, { fill = C.paper as string, radius = 26 } = {}) {
  g.save();
  g.shadowColor = shadow(0.14);
  g.shadowBlur = 50;
  g.shadowOffsetY = 20;
  roundRect(g, x, y, w, h, radius);
  g.fillStyle = fill;
  g.fill();
  g.restore();
}

/** The app's primary button: an accent pill with white text, centred on (x, y). Returns its width. */
export function button(g: G, x: number, y: number, text: string, { size = 40, padX = 56, height = 104, italic = false } = {}) {
  g.save();
  g.font = `${italic ? 'italic ' : ''}${font('sans', size, 700)}`;
  const w = g.measureText(text).width + padX * 2;
  g.shadowColor = withAlpha(C.accent700, 0.35);
  g.shadowBlur = 40;
  g.shadowOffsetY = 16;
  roundRect(g, x - w / 2, y - height / 2, w, height, height / 2);
  g.fillStyle = C.accent600;
  g.fill();
  g.shadowColor = 'transparent';
  g.fillStyle = C.white;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y + 2);
  g.restore();
  return w;
}

/** Break text into lines no wider than maxW in the context's current font. */
export function wrap(g: G, text: string, maxW: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > maxW) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Lines of body copy that rise in one after another as p goes 0 → 1. */
export function copy(g: G, lines: string[], x: number, y: number, lineH: number, p: number, align: CanvasTextAlign = 'left') {
  g.save();
  const base = g.globalAlpha;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  lines.forEach((line, i) => {
    const k = ease.outCubic(clamp(p * (1 + lines.length * 0.25) - i * 0.25));
    g.globalAlpha = base * k;
    g.fillText(line, x, y + i * lineH + 18 * (1 - k));
  });
  g.restore();
}

/** A headline rising out of a mask under its baseline. */
export function rise(g: G, text: string, x: number, baseline: number, px: number, p: number, { align = 'left' as CanvasTextAlign, color = C.ink as string, family = 'display' as 'display' | 'sans' } = {}) {
  if (p <= 0) return;
  g.save();
  g.font = font(family, px, family === 'display' ? 400 : 700);
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.beginPath();
  g.rect(0, baseline - px * 1.15, W, px * 1.5);
  g.clip();
  g.globalAlpha *= clamp(p * 1.5);
  g.fillText(text, x, baseline + px * 0.75 * (1 - p));
  g.restore();
}

export type Cam = { x: number; y: number; zoom: number };
export const WIDE: Cam = { x: W / 2, y: H / 2, zoom: 1 };

/** Keyframed camera: [[time, cam, ease]]. The zoom eases in log space so pushes feel even. */
export function camAt(t: number, frames: [number, Cam, Ease?][]): Cam {
  return {
    x: keys(t, frames.map(([time, cam, e]) => [time, cam.x, e])),
    y: keys(t, frames.map(([time, cam, e]) => [time, cam.y, e])),
    zoom: Math.exp(keys(t, frames.map(([time, cam, e]) => [time, Math.log(cam.zoom), e]))),
  };
}

/**
 * Look at (x, y) at the given zoom: everything drawn after this is in slide space. The view is
 * kept inside the slide, so a push onto an edge element never shows past the slide's edge.
 */
export function applyCam(g: G, cam: Cam) {
  const halfW = W / 2 / cam.zoom, halfH = H / 2 / cam.zoom;
  g.translate(W / 2, H / 2);
  g.scale(cam.zoom, cam.zoom);
  g.translate(-clamp(cam.x, halfW, W - halfW), -clamp(cam.y, halfH, H - halfH));
}

/** A loose hand-drawn arrow along a cubic, drawn on as p goes 0 → 1 (the head lands last). */
export function arrow(g: G, from: [number, number], c1: [number, number], c2: [number, number], to: [number, number], p: number, color: string = C.accent300) {
  if (p <= 0) return;
  const point = (t: number): [number, number] => {
    const u = 1 - t;
    return [
      u * u * u * from[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * to[0],
      u * u * u * from[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * to[1],
    ];
  };
  const body = clamp(p / 0.8);
  g.save();
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // a brush: thick in the middle, thinner at the ends
  const steps = 60;
  for (let i = 0; i < steps * body; i++) {
    const a = point(i / steps), b = point(Math.min(body, (i + 1) / steps));
    g.lineWidth = lerp(16, 38, Math.sin((i / steps) * Math.PI));
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
  }
  const head = ease.outBack(clamp((p - 0.75) / 0.25));
  if (head > 0) {
    const [ex, ey] = point(1), [px, py] = point(0.96);
    const angle = Math.atan2(ey - py, ex - px);
    g.translate(ex, ey);
    g.rotate(angle);
    g.scale(head, head);
    g.lineWidth = 22;
    g.beginPath();
    g.moveTo(-70, -58);
    g.lineTo(0, 0);
    g.lineTo(-74, 50);
    g.stroke();
  }
  g.restore();
}
