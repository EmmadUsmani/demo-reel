// The news-digest edit's own toolkit: a narrated slide base (each beat held for its measured line) and
// the diagram vocabulary its slides share: nodes, edges with flowing packets, frames, code cards,
// stat tiles and charts. Everything is a pure function of time, in slide space (1920×1080).
import { roundRect } from '@engine/draw';
import { C, font, shadow, withAlpha } from '@engine/palette';
import { Scene, W, type Cue, type Line } from '@engine/scene';
import type { Cam } from '@engine/slide';
import { clamp, ease, lerp, prog } from '@engine/util';
import { SCRIPT, written } from './script';
import VO from './vo-lengths.json';

export type G = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Pt = [number, number];

export const mono = (px: number, weight = 500) => `${weight} ${px}px "JetBrains Mono"`;

// ------------------------------------------------------------------ narrated slides

/** How much of each scene's extra hold to keep: one dial for the edit's overall pace. */
const HOLD = 0.75;

/**
 * A scene told as a list of narration lines (ids into script.ts). Each line gets its measured spoken
 * length (vo-lengths.json) plus a breath, and `hold[id]` adds time after it for the picture to land.
 * Visuals key off T(id) (when a line starts) and E(id) (when its beat ends), so re-voicing a line
 * moves everything that depends on it.
 */
export abstract class Narrated extends Scene {
  protected abstract readonly ids: string[];
  protected lead = 0.5;
  protected tail = 0.8;
  protected gap = 0.3;
  protected hold: Record<string, number> = {};
  private starts: Record<string, number> = {};
  private ends: Record<string, number> = {};
  private total = 1;

  async init() {
    let t = this.lead;
    for (const id of this.ids) {
      const text = SCRIPT[id];
      if (!text) throw new Error(`no narration line '${id}' in script.ts`);
      const speech = (VO as Record<string, number>)[id] ?? text.split(' ').length / 2.4;
      this.starts[id] = t;
      t += speech + this.gap + (this.hold[id] ?? 0) * HOLD;
      this.ends[id] = t;
    }
    this.total = t + this.tail;
    await this.setup();
  }

  protected async setup() {}
  /** When line `id` starts, s (scene time). */
  protected T(id: string) { return this.starts[id] ?? 0; }
  /** When line `id`'s beat ends. */
  protected E(id: string) { return this.ends[id] ?? 0; }
  /** A point `k` (0..1) through line `id`'s beat. */
  protected at(id: string, k: number) { return lerp(this.T(id), this.E(id), k); }
  duration() { return this.total; }
  narration(): Line[] { return this.ids.map((id) => ({ id, at: this.T(id) + 0.05, until: this.E(id), text: SCRIPT[id]!, caption: written(SCRIPT[id]!) })); }
}

/** A whoosh per move between slide camera keys, by how the zoom changes. */
export function camCues(frames: [number, Cam, ...unknown[]][], gain = 0.8): Cue[] {
  const cues: Cue[] = [];
  for (let i = 1; i < frames.length; i++) {
    const [t0, a] = frames[i - 1]!;
    const [t1, b] = frames[i]!;
    const moved = Math.hypot(b.x - a.x, b.y - a.y) > 8 || Math.abs(Math.log(b.zoom / a.zoom)) > 0.02;
    if (!moved) continue;
    const r = b.zoom / a.zoom;
    cues.push({ kind: r > 1.15 ? 'whoosh-in' : r < 0.87 ? 'whoosh-out' : 'whoosh-across', t: t0, dur: t1 - t0, gain });
  }
  return cues;
}

// ------------------------------------------------------------------ colour

export type Tone = 'agent' | 'owner' | 'infra' | 'ext' | 'bad' | 'ok' | 'ink' | 'muted';

export function tone(t: Tone) {
  switch (t) {
    case 'agent': return { bg: '#F1F3FF', line: C.accent500, ink: C.accent800, dot: C.accent500 };
    case 'owner': return { bg: '#FFF7EB', line: '#E59E2D', ink: '#8A4B07', dot: '#E59E2D' };
    case 'ext': return { bg: '#EEFAF7', line: '#2BA58B', ink: '#0B5E4D', dot: '#2BA58B' };
    case 'bad': return { bg: '#FFF1F2', line: '#E5485F', ink: '#9F1239', dot: '#E5485F' };
    case 'ok': return { bg: '#F0FBF3', line: '#33A55A', ink: '#166534', dot: '#33A55A' };
    case 'ink': return { bg: C.labelInk, line: C.labelInk, ink: C.white, dot: C.accent400 };
    case 'muted': return { bg: '#F7F7F9', line: C.gray300, ink: C.gray500, dot: C.gray300 };
    default: return { bg: C.paper, line: C.gray300, ink: C.ink, dot: C.gray500 };
  }
}

// ------------------------------------------------------------------ text

type TextOpts = { px?: number; weight?: number; color?: string; align?: CanvasTextAlign; family?: 'text' | 'sans' | 'display' | 'mono'; base?: CanvasTextBaseline; spacing?: number };

export function text(g: G, s: string, x: number, y: number, o: TextOpts = {}) {
  const { px = 28, weight = 500, color = C.ink, align = 'left', family = 'text', base = 'alphabetic', spacing = 0 } = o;
  g.save();
  g.font = family === 'mono' ? mono(px, weight) : font(family, px, family === 'display' ? 400 : weight);
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = base;
  if (spacing) (g as any).letterSpacing = `${spacing}px`;
  g.fillText(s, x, y);
  g.restore();
}

export function measure(g: G, s: string, px: number, weight = 500, family: 'text' | 'mono' | 'display' | 'sans' = 'text') {
  g.save();
  g.font = family === 'mono' ? mono(px, weight) : font(family, px, weight);
  const w = g.measureText(s).width;
  g.restore();
  return w;
}

/** The slide's kicker and headline, top left: the kicker in small caps, the title rising in the display face. */
export function heading(g: G, kicker: string, title: string, p: number, x = 120, y = 150, px = 76) {
  if (p <= 0) return;
  const k = ease.outExpo(clamp(p));
  g.save();
  g.globalAlpha *= clamp(p * 2);
  text(g, kicker.toUpperCase(), x, y - px - 4 + 10 * (1 - k), { px: 24, weight: 700, color: C.accent600, spacing: 3 });
  g.beginPath();
  g.rect(0, y - px * 1.1, W, px * 1.45);
  g.clip();
  text(g, title, x, y + px * 0.6 * (1 - k), { px, family: 'display', color: C.ink });
  g.restore();
}

/** A small footnote at the bottom right: where the footage or the numbers come from. */
export function footnote(g: G, s: string, p: number) {
  if (p <= 0) return;
  g.save();
  g.globalAlpha *= clamp(p);
  const w = measure(g, s, 22, 500) + 32;
  roundRect(g, W - 44 - w, 1022, w, 36, 18);
  g.fillStyle = withAlpha(C.backdropBase, 0.92);
  g.fill();
  text(g, s, W - 60, 1046, { px: 22, weight: 500, color: C.gray600, align: 'right' });
  g.restore();
}

// ------------------------------------------------------------------ nodes, frames, tags

export type NodeOpts = { sub?: string; tone?: Tone; glyph?: string; glow?: number; px?: number; subPx?: number; dim?: number; radius?: number };

/** A diagram box at (x, y, w, h): springs in as p goes 0 → 1; `glow` 0..1 rings it in the accent. */
export function node(g: G, x: number, y: number, w: number, h: number, title: string, p: number, o: NodeOpts = {}) {
  if (p <= 0) return;
  const tn = tone(o.tone ?? 'infra');
  const k = ease.spring(clamp(p));
  const glow = o.glow ?? 0;
  const r = o.radius ?? 20;
  g.save();
  g.globalAlpha *= clamp(p * 2.5) * (1 - 0.6 * (o.dim ?? 0));
  g.translate(x + w / 2, y + h / 2 + 16 * (1 - k));
  g.scale(lerp(0.86, 1, k), lerp(0.86, 1, k));
  g.translate(-w / 2, -h / 2);
  g.shadowColor = shadow(0.12);
  g.shadowBlur = 30;
  g.shadowOffsetY = 10;
  roundRect(g, 0, 0, w, h, r);
  g.fillStyle = tn.bg;
  g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = 2;
  g.strokeStyle = tn.line;
  g.stroke();
  if (glow > 0) {
    g.save();
    g.globalAlpha *= clamp(glow);
    g.shadowColor = withAlpha(C.accent600, 0.55);
    g.shadowBlur = 28;
    g.lineWidth = 4;
    g.strokeStyle = C.accent600;
    roundRect(g, -5, -5, w + 10, h + 10, r + 5);
    g.stroke();
    g.restore();
  }
  const px = o.px ?? 28;
  let tx = 22, align: CanvasTextAlign = 'left';
  if (o.glyph) {
    const d = Math.min(h - 28, Math.max(54, h * 0.42));
    g.beginPath();
    g.arc(22 + d / 2, h / 2, d / 2, 0, Math.PI * 2);
    g.fillStyle = withAlpha(tn.line, 0.16);
    g.fill();
    g.font = /\p{Extended_Pictographic}/u.test(o.glyph) ? `${d * 0.52}px "Apple Color Emoji"` : font('text', d * 0.42, 700);
    g.fillStyle = tn.ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(o.glyph, 22 + d / 2, h / 2 + 2);
    tx = 22 + d + 16;
  } else if (!o.sub || w < 260) { tx = w / 2; align = 'center'; }
  const ink = o.tone === 'ink' ? C.white : C.ink;
  const room = align === 'center' ? w - 32 : w - tx - 16;
  const fit = (s: string, size: number, weight: number) => Math.min(size, size * (room / Math.max(1, measure(g, s, size, weight))));
  if (o.sub) {
    const sp = fit(o.sub, o.subPx ?? 24, 500);
    const px = fit(title, o.px ?? 28, 600);
    text(g, title, tx, h / 2 - sp * 0.15, { px, weight: 600, color: ink, align });
    text(g, o.sub, tx, h / 2 + sp * 1.25, { px: sp, weight: 500, color: o.tone === 'ink' ? C.accent200 : tn.ink, align });
  } else text(g, title, tx, h / 2, { px: fit(title, px, 600), weight: 600, color: ink, align, base: 'middle' });
  g.restore();
}

/** A dashed frame around a group, with a tab label at its top left. */
export function frame(g: G, x: number, y: number, w: number, h: number, label: string, p: number, t: Tone = 'infra') {
  if (p <= 0) return;
  const tn = tone(t);
  g.save();
  g.globalAlpha *= clamp(p * 1.5);
  roundRect(g, x, y, w, h, 28);
  g.fillStyle = withAlpha(tn.line === C.gray300 ? '#8A93A8' : tn.line, 0.05);
  g.fill();
  g.setLineDash([10, 9]);
  g.lineDashOffset = -p * 40;
  g.lineWidth = 2.5;
  g.strokeStyle = withAlpha(tn.line === C.gray300 ? '#8A93A8' : tn.line, 0.75);
  g.stroke();
  g.setLineDash([]);
  const lw = measure(g, label, 22, 700) + 36;
  roundRect(g, x + 28, y - 19, lw, 38, 19);
  g.fillStyle = C.paper;
  g.fill();
  g.strokeStyle = withAlpha(tn.line === C.gray300 ? '#8A93A8' : tn.line, 0.75);
  g.lineWidth = 2;
  g.stroke();
  text(g, label, x + 28 + 18, y + 1, { px: 22, weight: 700, color: tn.ink === C.ink ? C.gray700 : tn.ink, base: 'middle' });
  g.restore();
}

/** A pill tag centred on (x, y) (or left-aligned with align 'left'); pops in with p. Returns its width. */
export function tag(g: G, x: number, y: number, s: string, p: number, t: Tone = 'ink', o: { px?: number; align?: 'center' | 'left' | 'right'; glyph?: string } = {}) {
  const px = o.px ?? 24;
  const w = measure(g, s, px, 600) + px * 1.6 + (o.glyph ? px * 1.2 : 0);
  if (p <= 0) return w;
  const h = px * 1.85;
  const tn = tone(t);
  const k = ease.outBack(clamp(p));
  const left = o.align === 'left' ? x : o.align === 'right' ? x - w : x - w / 2;
  g.save();
  g.globalAlpha *= clamp(p * 2);
  g.translate(left + w / 2, y);
  g.scale(lerp(0.8, 1, k), lerp(0.8, 1, k));
  g.shadowColor = shadow(t === 'ink' ? 0.25 : 0.1);
  g.shadowBlur = 18;
  g.shadowOffsetY = 6;
  roundRect(g, -w / 2, -h / 2, w, h, h / 2);
  g.fillStyle = tn.bg;
  g.fill();
  g.shadowColor = 'transparent';
  if (t !== 'ink') { g.strokeStyle = tn.line; g.lineWidth = 1.8; g.stroke(); }
  let tx = -w / 2 + px * 0.8;
  if (o.glyph) { text(g, o.glyph, tx + px * 0.45, 1, { px: px * 0.9, color: tn.ink, align: 'center', base: 'middle' }); tx += px * 1.2; }
  text(g, s, tx, 1, { px, weight: 600, color: t === 'ink' ? C.white : tn.ink, base: 'middle' });
  g.restore();
  return w;
}

// ------------------------------------------------------------------ edges

function polyLength(pts: Pt[]) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  return total;
}

/** The point `d` px along a polyline, and the direction there. */
export function along(pts: Pt[], d: number): [number, number, number] {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i]!;
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (d <= seg || i === pts.length - 1) {
      const k = seg ? clamp(d / seg) : 0;
      return [lerp(x0, x1, k), lerp(y0, y1, k), Math.atan2(y1 - y0, x1 - x0)];
    }
    d -= seg;
  }
  const last = pts[pts.length - 1]!;
  return [last[0], last[1], 0];
}

export type EdgeOpts = { color?: string; width?: number; dash?: boolean; head?: boolean; flow?: number; packets?: number; label?: string; labelAt?: number; labelTone?: Tone; speed?: number; both?: boolean };

/**
 * A connector along `pts`, drawn on as p goes 0 → 1, with an arrowhead. With `flow` (a time, s) set,
 * packets travel along it once it is drawn: the motion that says "this is live".
 */
export function edge(g: G, pts: Pt[], p: number, o: EdgeOpts = {}) {
  if (p <= 0) return;
  const color = o.color ?? C.gray500;
  const width = o.width ?? 3;
  const len = polyLength(pts);
  const shown = len * ease.inOutCubic(clamp(p));
  g.save();
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (o.dash) g.setLineDash([10, 10]);
  g.beginPath();
  g.moveTo(pts[0]![0], pts[0]![1]);
  let left = shown;
  for (let i = 1; i < pts.length && left > 0; i++) {
    const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i]!;
    const seg = Math.hypot(x1 - x0, y1 - y0);
    const k = Math.min(1, left / seg);
    g.lineTo(lerp(x0, x1, k), lerp(y0, y1, k));
    left -= seg;
  }
  g.stroke();
  g.setLineDash([]);
  const arrowhead = (d: number, flip: boolean) => {
    const [hx, hy, a] = along(pts, d);
    const s = 11 + width * 1.6;
    g.save();
    g.translate(hx, hy);
    g.rotate(a + (flip ? Math.PI : 0));
    g.beginPath();
    g.moveTo(2, 0);
    g.lineTo(-s, -s * 0.62);
    g.lineTo(-s * 0.72, 0);
    g.lineTo(-s, s * 0.62);
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.restore();
  };
  if (o.head !== false) arrowhead(shown, false);
  if (o.both && p >= 1) arrowhead(0, true);
  if (o.flow !== undefined && p >= 1) {
    const n = o.packets ?? Math.max(1, Math.round(len / 170));
    const speed = o.speed ?? 170;
    for (let i = 0; i < n; i++) {
      const d = (((o.flow * speed + (i * len) / n) % len) + len) % len;
      const [px, py] = along(pts, d);
      const fade = Math.min(1, d / 40, (len - d) / 40);
      g.beginPath();
      g.arc(px, py, width + 3.5, 0, Math.PI * 2);
      g.fillStyle = withAlpha(color.startsWith('#') ? color : C.accent500, 0.9 * fade);
      g.shadowColor = color;
      g.shadowBlur = 12;
      g.fill();
    }
  }
  g.restore();
  if (o.label) {
    const [lx, ly] = along(pts, len * (o.labelAt ?? 0.5));
    const { label } = o, lp = prog(p, 0.6, 1), lt = o.labelTone ?? 'infra';
    const m = g.getTransform(), alpha = g.globalAlpha;
    pendingLabels.push(() => { g.save(); g.setTransform(m); g.globalAlpha = alpha; tag(g, lx, ly, label, lp, lt, { px: 22 }); g.restore(); });
  }
}

const pendingLabels: (() => void)[] = [];
/** Draw the edge labels queued since the last call, over the nodes (call once the nodes are drawn). */
export function flushLabels() {
  for (const draw of pendingLabels.splice(0)) draw();
}

/** Points for an orthogonal route: from a to b, turning once at `turnX` (horizontal first) or `turnY`. */
export const route = {
  hv: (a: Pt, b: Pt): Pt[] => [a, [b[0], a[1]], b],
  vh: (a: Pt, b: Pt): Pt[] => [a, [a[0], b[1]], b],
  hvh: (a: Pt, b: Pt, midX = (a[0] + b[0]) / 2): Pt[] => [a, [midX, a[1]], [midX, b[1]], b],
  vhv: (a: Pt, b: Pt, midY = (a[1] + b[1]) / 2): Pt[] => [a, [a[0], midY], [b[0], midY], b],
};

// ------------------------------------------------------------------ cards

/** A dark code card: a title bar, then lines of monospace text revealed as p goes 0 → 1. `hl` lights line ranges. */
export function codeCard(g: G, x: number, y: number, w: number, lines: string[], p: number, o: { title?: string; px?: number; lineH?: number; hl?: [number, number, number][]; dimOthers?: number } = {}) {
  if (p <= 0) return 0;
  const px = o.px ?? 24, lh = o.lineH ?? px * 1.5, bar = 52;
  const h = bar + 26 + lines.length * lh + 20;
  const k = ease.outCubic(clamp(p * 1.6));
  g.save();
  g.globalAlpha *= clamp(p * 3);
  g.translate(0, 24 * (1 - k));
  g.shadowColor = shadow(0.3);
  g.shadowBlur = 60;
  g.shadowOffsetY = 24;
  roundRect(g, x, y, w, h, 22);
  g.fillStyle = '#14152B';
  g.fill();
  g.shadowColor = 'transparent';
  roundRect(g, x, y, w, bar, [22, 22, 0, 0]);
  g.fillStyle = '#1D1F3B';
  g.fill();
  ['#FF6159', '#FFBD2E', '#28C941'].forEach((c, i) => { g.beginPath(); g.arc(x + 28 + i * 22, y + bar / 2, 7, 0, Math.PI * 2); g.fillStyle = c; g.fill(); });
  if (o.title) text(g, o.title, x + w / 2, y + bar / 2 + 1, { px: 22, family: 'mono', color: '#A3A8C9', align: 'center', base: 'middle' });
  const top = y + bar + 26;
  const lit = (i: number) => Math.max(0, ...(o.hl ?? []).filter(([a, b]) => i >= a && i <= b).map(([, , v]) => v));
  (o.hl ?? []).forEach(([a, b, v]) => {
    if (v <= 0) return;
    g.save();
    g.globalAlpha *= clamp(v);
    roundRect(g, x + 14, top + a * lh - 6, (w - 28) * ease.outCubic(clamp(v * 1.5)), (b - a + 1) * lh + 4, 10);
    g.fillStyle = withAlpha(C.accent500, 0.28);
    g.fill();
    g.fillStyle = C.accent400;
    g.fillRect(x + 14, top + a * lh - 6, 5, (b - a + 1) * lh + 4);
    g.restore();
  });
  const reveal = clamp((p - 0.15) / 0.85) * lines.length;
  lines.forEach((line, i) => {
    const a = clamp(reveal - i);
    if (a <= 0) return;
    const dim = 1 - (o.dimOthers ?? 0) * (1 - lit(i));
    g.save();
    g.globalAlpha *= a * lerp(0.35, 1, dim);
    drawCode(g, line, x + 40, top + i * lh + px * 0.8, px);
    g.restore();
  });
  g.restore();
  return h;
}

/** One line of code, lightly coloured: {{SLOTS}} amber, list numbers and comments in the accent. */
function drawCode(g: G, line: string, x: number, y: number, px: number) {
  g.save();
  g.font = mono(px, 500);
  g.textBaseline = 'alphabetic';
  const parts = line.split(/(\{\{\w+\}\}|^\s*\d+\.|^#.*$|`[^`]+`)/).filter(Boolean);
  let cx = x;
  for (const part of parts) {
    g.fillStyle = /^\{\{/.test(part) ? '#FBBF5B' : /^\s*\d+\.$/.test(part) ? C.accent300 : /^#/.test(part) ? '#8C92B8' : /^`/.test(part) ? '#7EE0C3' : '#E6E8F6';
    g.fillText(part, cx, y);
    cx += g.measureText(part).width;
  }
  g.restore();
}

/** A paper card with a soft shadow, sliding up in as p goes 0 → 1. */
export function paper(g: G, x: number, y: number, w: number, h: number, p: number, draw: () => void, o: { fill?: string; line?: string; radius?: number } = {}) {
  if (p <= 0) return;
  const k = ease.outCubic(clamp(p));
  g.save();
  g.globalAlpha *= clamp(p * 2);
  g.translate(0, 26 * (1 - k));
  g.shadowColor = shadow(0.13);
  g.shadowBlur = 44;
  g.shadowOffsetY = 16;
  roundRect(g, x, y, w, h, o.radius ?? 24);
  g.fillStyle = o.fill ?? C.paper;
  g.fill();
  g.shadowColor = 'transparent';
  if (o.line) { g.strokeStyle = o.line; g.lineWidth = 2; g.stroke(); }
  draw();
  g.restore();
}

/** A big number with a caption, counting up from zero as p goes 0 → 1. */
export function stat(g: G, x: number, y: number, value: number, label: string, p: number, o: { prefix?: string; suffix?: string; decimals?: number; px?: number; color?: string; align?: CanvasTextAlign; sub?: string } = {}) {
  if (p <= 0) return;
  const k = ease.outCubic(clamp(p));
  const shown = value * ease.outQuart(clamp(p * 1.15));
  const s = `${o.prefix ?? ''}${shown.toLocaleString('en-US', { minimumFractionDigits: o.decimals ?? 0, maximumFractionDigits: o.decimals ?? 0 })}${o.suffix ?? ''}`;
  const px = o.px ?? 120;
  g.save();
  g.globalAlpha *= clamp(p * 2);
  text(g, s, x, y + 20 * (1 - k), { px, weight: 700, family: 'sans', color: o.color ?? C.ink, align: o.align ?? 'left' });
  text(g, label, x, y + px * 0.3 + 26, { px: 34, weight: 600, color: C.gray700, align: o.align ?? 'left' });
  if (o.sub) text(g, o.sub, x, y + px * 0.3 + 66, { px: 24, weight: 500, color: C.gray500, align: o.align ?? 'left' });
  g.restore();
}

/** A ring that fills as p goes 0 → 1 (a gauge or a loop's progress). */
export function ring(g: G, x: number, y: number, r: number, p: number, o: { width?: number; color?: string; track?: string; from?: number } = {}) {
  const from = o.from ?? -Math.PI / 2;
  g.save();
  g.lineWidth = o.width ?? 14;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.strokeStyle = o.track ?? withAlpha(C.accent300, 0.25);
  g.stroke();
  if (p > 0) {
    g.beginPath();
    g.arc(x, y, r, from, from + Math.PI * 2 * clamp(p));
    g.strokeStyle = o.color ?? C.accent600;
    g.stroke();
  }
  g.restore();
}

/** A tick cue per time, with the pitch rising through them. */
export const ticks = (times: number[], gain = 0.7, base = 0.9): Cue[] => times.map((t, i) => ({ kind: 'tick', t, gain, pitch: base + (i % 6) * 0.05 }));
export const pops = (times: number[], gain = 0.9): Cue[] => times.map((t, i) => ({ kind: 'pop', t, gain, pitch: 0.95 + (i % 4) * 0.05 }));
