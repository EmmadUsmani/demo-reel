// Canvas2D primitives in the house style: the backdrop, a browser window for the footage, the
// cursor, and the callouts that label real UI. Every colour comes from the theme (palette.ts).
import type { Box } from './assets';
import { C, font, shadow, withAlpha } from './palette';
import { H, W } from './scene';
import { clamp, ease, lerp } from './util';

type G = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function roundRect(g: G, x: number, y: number, w: number, h: number, r: number | number[]) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/**
 * The house backdrop: a warm off-white under the theme's three washes (top left, top right, bottom).
 * The washes breathe very slowly so a held frame is never dead.
 */
export function backdrop(g: G, t: number) {
  g.fillStyle = C.backdropBase;
  g.fillRect(0, 0, W, H);
  const wash = (cx: number, cy: number, rx: number, ry: number, color: string) => {
    g.save();
    g.translate(cx, cy);
    g.scale(1, ry / rx);
    const gradient = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.7, withAlpha(color, 0));
    g.fillStyle = gradient;
    g.fillRect(-rx, -rx, rx * 2, rx * 2);
    g.restore();
  };
  const drift = Math.sin(t * 0.35);
  wash(W * (0.15 + 0.02 * drift), H * 0.0, W * 0.6, H * 0.62, C.wash1);
  wash(W * (0.95 - 0.02 * drift), H * 0.1, W * 0.5, H * 0.5, C.wash2);
  wash(W * 0.55, H * 1.08, W * 0.55, H * 0.42, C.wash3);
}

// ------------------------------------------------------------------ browser window

export const WINDOW_BAR = 46;

/** A plain browser window tinted by the theme: the frame the footage plays in. */
export function browserWindow(g: G, x: number, y: number, w: number, h: number, url: string, content: () => void) {
  const radius = 18;
  const total = h + WINDOW_BAR;
  g.save();
  g.shadowColor = shadow(0.16);
  g.shadowBlur = 70;
  g.shadowOffsetY = 28;
  roundRect(g, x, y, w, total, radius);
  g.fillStyle = C.white;
  g.fill();
  g.shadowColor = 'rgba(16, 24, 40, 0.10)';
  g.shadowBlur = 10;
  g.shadowOffsetY = 2;
  g.fill();
  g.restore();

  // title bar
  g.save();
  roundRect(g, x, y, w, WINDOW_BAR, [radius, radius, 0, 0]);
  g.fillStyle = C.chrome;
  g.fill();
  g.fillStyle = C.gray200;
  g.fillRect(x, y + WINDOW_BAR - 1, w, 1);
  ['#FF6159', '#FFBD2E', '#28C941'].forEach((color, i) => {
    g.beginPath();
    g.arc(x + 24 + i * 20, y + WINDOW_BAR / 2, 6, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
  });
  const pillW = Math.min(560, w * 0.42);
  roundRect(g, x + (w - pillW) / 2, y + 9, pillW, WINDOW_BAR - 18, 9);
  g.fillStyle = C.white;
  g.fill();
  g.strokeStyle = C.gray200;
  g.lineWidth = 1;
  g.stroke();
  g.font = font('text', 15, 500);
  g.fillStyle = C.gray600;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(url, x + w / 2 + 8, y + WINDOW_BAR / 2 + 1);
  lock(g, x + w / 2 - g.measureText(url).width / 2 - 8, y + WINDOW_BAR / 2);
  g.restore();

  // page
  g.save();
  roundRect(g, x, y + WINDOW_BAR, w, h, [0, 0, radius, radius]);
  g.clip();
  content();
  g.restore();
}

function lock(g: G, x: number, y: number) {
  g.save();
  g.strokeStyle = C.gray500;
  g.fillStyle = C.gray500;
  g.lineWidth = 1.6;
  g.beginPath();
  g.arc(x, y - 2.5, 3.2, Math.PI, 0);
  g.stroke();
  roundRect(g, x - 4.8, y - 2.5, 9.6, 7.5, 1.8);
  g.fill();
  g.restore();
}

// ------------------------------------------------------------------ cursor

/** A macOS-style arrow, tip at (x, y). `press` 0..1 squeezes it for a click. */
export function cursor(g: G, x: number, y: number, size = 1, press = 0) {
  const s = 1.5 * size * (1 - 0.14 * press);
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, 21);
  g.lineTo(5.1, 16.4);
  g.lineTo(8.6, 24.4);
  g.lineTo(12.2, 22.8);
  g.lineTo(8.8, 15.1);
  g.lineTo(15.4, 15.1);
  g.closePath();
  g.shadowColor = 'rgba(16, 24, 40, 0.35)';
  g.shadowBlur = 6 / s;
  g.shadowOffsetY = 2 / s;
  g.fillStyle = '#fff';
  g.lineJoin = 'round';
  g.lineWidth = 3.2;
  g.strokeStyle = '#fff';
  g.stroke();
  g.shadowColor = 'transparent';
  g.fillStyle = '#111';
  g.fill();
  g.restore();
}

/** The ring a click leaves: `k` is time since the click, s. */
export function clickRipple(g: G, x: number, y: number, k: number, size = 1) {
  if (k < 0 || k > 0.6) return;
  const p = k / 0.6;
  g.save();
  g.beginPath();
  g.arc(x, y, (10 + 34 * ease.outCubic(p)) * size, 0, Math.PI * 2);
  g.strokeStyle = withAlpha(C.accent600, 0.55 * (1 - p));
  g.lineWidth = 3 * size;
  g.stroke();
  g.beginPath();
  g.arc(x, y, 12 * size * (1 - p), 0, Math.PI * 2);
  g.fillStyle = withAlpha(C.accent500, 0.3 * (1 - p));
  g.fill();
  g.restore();
}

// ------------------------------------------------------------------ callouts

/**
 * A soft accent ring around a real UI element (screen px). `p` 0..1 draws it in (a settle from
 * slightly larger); `radius` defaults to a pill for short boxes.
 */
export function highlight(g: G, box: Box, p: number, radius?: number) {
  if (p <= 0) return;
  const pad = 8 + 10 * (1 - ease.outCubic(p));
  const r = radius ?? Math.min(22, box.h / 2 + pad);
  g.save();
  g.globalAlpha = clamp(p * 1.6);
  roundRect(g, box.x - pad, box.y - pad, box.w + pad * 2, box.h + pad * 2, r + pad * 0.3);
  g.shadowColor = withAlpha(C.accent600, 0.45);
  g.shadowBlur = 24;
  g.strokeStyle = C.accent600;
  g.lineWidth = 3.5;
  g.stroke();
  g.shadowBlur = 0;
  g.fillStyle = withAlpha(C.accent400, 0.06);
  g.fill();
  g.restore();
}

export type Side = 'above' | 'below' | 'left' | 'right';

/**
 * A label pill beside a screen-px box, in the theme's label ink with an accent dot. `p` 0..1
 * pops it in; a second, smaller line is optional. Above or below, `align` lines it up with the
 * box's start or end edge, to keep it off a neighbouring control.
 */
export type Align = 'center' | 'start' | 'end';

export function label(g: G, box: Box, text: string, p: number, side: Side = 'below', sub?: string, align: Align = 'center') {
  if (p <= 0) return;
  const k = ease.outBack(clamp(p));
  g.save();
  g.font = font('text', 26, 600);
  const textW = g.measureText(text).width;
  g.font = font('text', 20, 500);
  const subW = sub ? g.measureText(sub).width : 0;
  const padX = 24;
  const w = Math.max(textW + 30, subW) + padX * 2;
  const h = sub ? 86 : 56;
  const gap = 26;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  let x = align === 'start' ? box.x : align === 'end' ? box.x + box.w - w : cx - w / 2;
  let y = box.y + box.h + gap;
  if (side === 'above') y = box.y - gap - h;
  if (side === 'left') { x = box.x - gap - w; y = cy - h / 2; }
  if (side === 'right') { x = box.x + box.w + gap; y = cy - h / 2; }
  x = clamp(x, 40, W - 40 - w);
  y = clamp(y, 40, H - 40 - h);

  g.globalAlpha = clamp(p * 2);
  g.translate(x + w / 2, y + h / 2);
  g.scale(lerp(0.86, 1, k), lerp(0.86, 1, k));
  g.translate(-w / 2, -h / 2);
  g.shadowColor = 'rgba(16, 24, 40, 0.28)';
  g.shadowBlur = 30;
  g.shadowOffsetY = 12;
  roundRect(g, 0, 0, w, h, 18);
  g.fillStyle = C.labelInk;
  g.fill();
  g.shadowColor = 'transparent';
  // a faint hairline, so the pill still reads over a dark app
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.lineWidth = 1.5;
  g.stroke();
  g.beginPath();
  g.arc(padX + 7, sub ? 30 : h / 2, 7, 0, Math.PI * 2);
  g.fillStyle = C.accent400;
  g.fill();
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.font = font('text', 26, 600);
  g.fillStyle = C.white;
  g.fillText(text, padX + 26, sub ? 30 : h / 2 + 1);
  if (sub) {
    g.font = font('text', 20, 500);
    g.fillStyle = C.accent200;
    g.fillText(sub, padX, 62);
  }
  g.restore();
}

/** The app's occasion chip: a white pill with a hairline border (or ink when selected). */
export function chip(g: G, x: number, y: number, text: string, { selected = false, size = 24 } = {}) {
  g.save();
  g.font = font('text', size, 500);
  const w = g.measureText(text).width + size * 1.5;
  const h = size * 1.9;
  roundRect(g, x, y, w, h, h / 2);
  g.fillStyle = selected ? C.ink : withAlpha(C.white, 0.85);
  g.fill();
  if (!selected) {
    g.strokeStyle = C.gray200;
    g.lineWidth = 1.5;
    g.stroke();
  }
  g.fillStyle = selected ? C.white : C.ink;
  g.textBaseline = 'middle';
  g.fillText(text, x + size * 0.75, y + h / 2 + 1);
  g.restore();
  return w;
}

/** Draw an image (or a crop of it) as a card on polaroid paper with a soft shadow. */
export function polaroid(g: G, image: CanvasImageSource, crop: Box, x: number, y: number, w: number, rotation: number) {
  const h = (w * crop.h) / crop.w;
  g.save();
  g.translate(x, y);
  g.rotate(rotation);
  g.shadowColor = shadow(0.18);
  g.shadowBlur = 40;
  g.shadowOffsetY = 18;
  roundRect(g, -w / 2, -h / 2, w, h, 10);
  g.fillStyle = C.paper;
  g.fill();
  g.shadowColor = 'transparent';
  g.save();
  roundRect(g, -w / 2, -h / 2, w, h, 10);
  g.clip();
  g.drawImage(image, crop.x, crop.y, crop.w, crop.h, -w / 2, -h / 2, w, h);
  g.restore();
  g.restore();
}

/** A section tag that slides in at the top left over footage: "The editor". */
export function chapterTag(g: G, title: string, p: number) {
  if (p <= 0) return;
  const k = ease.outBack(clamp(p));
  g.save();
  g.globalAlpha = clamp(p * 2);
  g.font = font('display', 34);
  const titleW = g.measureText(title).width;
  const w = 30 + titleW + 30, h = 62;
  g.translate(lerp(-w, 54, k), 54);
  g.shadowColor = shadow(0.22);
  g.shadowBlur = 30;
  g.shadowOffsetY = 12;
  roundRect(g, 0, 0, w, h, h / 2);
  g.fillStyle = C.paper;
  g.fill();
  g.shadowColor = 'transparent';
  g.textBaseline = 'middle';
  g.font = font('display', 34);
  g.fillStyle = C.ink;
  g.fillText(title, 30, h / 2 + 2);
  g.restore();
}
