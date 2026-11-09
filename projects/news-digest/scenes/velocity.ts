// How fast the factory goes, from the real logs (stats.json): iterations and commits per day, commits
// per hour across every hour of nine days (Pacific time), and the lines changed adding up. Nov 1 began
// at 09:00 and Nov 9 is the day of filming, so both are partial and drawn lighter.
import { backdrop, roundRect } from '@engine/draw';
import { C, withAlpha } from '@engine/palette';
import type { Cue, Frame } from '@engine/scene';
import { clamp, ease, prog } from '@engine/util';
import { cumulative, days, hourly } from '../data';
import { footnote, heading, Narrated, ring, stat, tag, text, ticks } from '../kit';

const BARS = { x: 760, y: 270, w: 1060, h: 560 };
const HEAT = { x: 330, y: 250, cw: 60, ch: 62 };
const CURVE = { x: 200, y: 300, w: 1560, h: 560 };
const MAX_BAR = 280;

export default class Velocity extends Narrated {
  protected ids = ['v1', 'v2', 'v3', 'v4'];
  protected hold = { v2: 2.4, v3: 2.6, v4: 2.4 };

  private panels() {
    return { a: [0, this.T('v3') - 0.2], b: [this.T('v3') - 0.2, this.T('v4') - 0.2], c: [this.T('v4') - 0.2, this.duration()] } as const;
  }
  private barAt(i: number) { return this.T('v2') + 0.2 + i * 0.28; }
  private rowAt(i: number) { return this.T('v3') + 0.3 + i * 0.32; }

  cues(): Cue[] {
    const n = days.list.length;
    return [
      ...ticks(days.list.map((_, i) => this.barAt(i)), 0.7, 0.85),
      { kind: 'whoosh-across', t: this.T('v3') - 0.3, dur: 0.6, gain: 0.6 },
      ...ticks(days.list.map((_, i) => this.rowAt(i)), 0.55, 1.0),
      { kind: 'pop', t: this.rowAt(n) + 0.2 },
      { kind: 'whoosh-across', t: this.T('v4') - 0.3, dur: 0.6, gain: 0.6 },
      { kind: 'land', t: this.T('v4') + 3.6, gain: 0.8 },
    ];
  }

  render(f: Frame) {
    const g = this.g;
    const lt = f.lt;
    backdrop(g, f.t);
    const { a, b, c } = this.panels();
    const vis = (r: readonly [number, number]) => prog(lt, r[0], r[0] + 0.4) * (1 - prog(lt, r[1] - 0.4, r[1]));
    const titles: [readonly [number, number], string][] = [[a, 'About two hundred a day'], [b, 'Every hour, every day'], [c, 'It adds up']];
    for (const [r, title] of titles) heading(g, 'Velocity · real numbers', title, vis(r), 110, 140, 68);
    footnote(g, 'Source: git history and the supervisor’s logs, Nov 1–9 (Pacific days)', prog(lt, 0.5, 1.2));

    const va = a[0] === 0 ? Math.min(prog(lt, 0.2, 0.6), 1 - prog(lt, a[1] - 0.4, a[1])) : vis(a);
    if (va > 0) { g.save(); g.globalAlpha = va; this.panelBars(lt); g.restore(); }
    const vb = vis(b);
    if (vb > 0) { g.save(); g.globalAlpha = vb; this.panelHeat(lt); g.restore(); }
    const vc = vis(c);
    if (vc > 0) { g.save(); g.globalAlpha = vc; this.panelCurve(lt); g.restore(); }
  }

  // ---------------------------------------------------------------- A: the iteration clock and daily bars
  private panelBars(lt: number) {
    const g = this.g;
    const k = prog(lt, this.T('v1') + 0.2, this.E('v1'), ease.inOutCubic);
    ring(g, 380, 560, 190, k, { width: 22 });
    text(g, '≈ 8 min', 380, 585, { px: 84, weight: 700, family: 'sans', align: 'center' });
    text(g, 'a typical iteration,', 380, 820, { px: 30, weight: 600, color: C.gray700, align: 'center' });
    text(g, 'end to end', 380, 860, { px: 30, weight: 600, color: C.gray700, align: 'center' });

    const { x, y, w, h } = BARS;
    const n = days.list.length;
    const gw = w / n;
    const yOf = (v: number) => y + h - (v / MAX_BAR) * h;
    const axis = prog(lt, this.T('v2') - 0.2, this.T('v2') + 0.4);
    g.save();
    g.globalAlpha *= axis;
    g.strokeStyle = C.gray300;
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w, y + h); g.stroke();
    // the 200-a-day line
    g.setLineDash([10, 10]);
    g.strokeStyle = C.accent400;
    g.beginPath(); g.moveTo(x, yOf(200)); g.lineTo(x + w, yOf(200)); g.stroke();
    g.setLineDash([]);
    text(g, '200 a day', x + w, yOf(200) - 14, { px: 24, weight: 700, color: C.accent600, align: 'right' });
    g.restore();
    days.list.forEach((day, i) => {
      const p = prog(lt, this.barAt(i), this.barAt(i) + 0.7, ease.outCubic);
      const cx = x + gw * i + gw / 2;
      const bw = gw * 0.32;
      const alpha = day.full ? 1 : 0.4;
      const bar = (bx: number, v: number, color: string) => {
        const top = yOf(v * p);
        roundRect(g, bx, top, bw, y + h - top, [8, 8, 0, 0]);
        g.fillStyle = color;
        g.fill();
      };
      g.save();
      g.globalAlpha *= alpha * clamp(p * 3);
      bar(cx - bw - 3, days.iterations[i]!, C.accent300);
      bar(cx + 3, days.commits[i]!, C.accent700);
      g.restore();
      g.save();
      g.globalAlpha *= axis;
      text(g, day.weekday, cx, y + h + 40, { px: 24, weight: 600, color: day.full ? C.gray700 : C.gray500, align: 'center' });
      text(g, day.label.replace('Nov ', ''), cx, y + h + 72, { px: 22, color: C.gray500, align: 'center' });
      g.restore();
      if (p > 0.6 && day.full && i === 1) {
        g.save();
        g.globalAlpha *= prog(lt, this.barAt(i) + 0.5, this.barAt(i) + 0.9);
        text(g, String(days.commits[i]), cx + 3 + bw / 2, yOf(days.commits[i]!) - 14, { px: 24, weight: 700, color: C.accent800, align: 'center' });
        g.restore();
      }
    });
    const legend = prog(lt, this.T('v2') + 0.4, this.T('v2') + 1.0);
    tag(g, x + 10, y - 20, 'iterations', legend, 'agent', { px: 24, align: 'left' });
    tag(g, x + 180, y - 20, 'commits', legend, 'ink', { px: 24, align: 'left' });
    const avg = prog(lt, this.barAt(n) + 0.2, this.barAt(n) + 0.8, ease.outBack);
    tag(g, x + w / 2 + 160, y - 20, `${days.fullDayAverage.iterations} iterations · ${days.fullDayAverage.commits} commits a day, Nov 2–8`, avg, 'owner', { px: 24 });
  }

  // ---------------------------------------------------------------- B: commits per hour, every hour
  private panelHeat(lt: number) {
    const g = this.g;
    const { x, y, cw, ch } = HEAT;
    const max = Math.max(...days.list.flatMap((d) => d.commits));
    const firstHour = 9; // the series begins at 09:00 on day one
    const lastDay = days.list.length - 1;
    const lastHourToday = days.list[lastDay]!.iterations.reduce((h, v, i) => (v > 0 ? i : h), 0);
    ['12 am', '3 am', '6 am', '9 am', '12 pm', '3 pm', '6 pm', '9 pm'].forEach((s, i) =>
      text(g, s, x + i * 3 * cw + 2, y - 14, { px: 22, weight: 600, color: C.gray500 }));
    days.list.forEach((day, r) => {
      const ry = y + r * ch;
      const weekend = day.weekday === 'Sat' || day.weekday === 'Sun';
      text(g, `${day.weekday} ${day.label.replace('Nov ', '')}`, x - 24, ry + ch / 2 + 9, { px: 24, weight: weekend ? 700 : 600, color: weekend ? '#8A4B07' : C.gray700, align: 'right' });
      const rowP = prog(lt, this.rowAt(r), this.rowAt(r) + 0.6);
      for (let hcol = 0; hcol < 24; hcol++) {
        const recorded = !(r === 0 && hcol < firstHour) && !(r === lastDay && hcol > lastHourToday);
        const v = day.commits[hcol] ?? 0;
        const k = clamp(rowP * 24 - hcol * 0.7);
        const cx = x + hcol * cw, cy = ry;
        roundRect(g, cx + 3, cy + 3, cw - 6, ch - 6, 8);
        if (!recorded) { g.strokeStyle = C.gray200; g.lineWidth = 1.5; g.stroke(); continue; }
        g.fillStyle = withAlpha(C.accent600, 0.06);
        g.fill();
        if (k > 0) {
          const level = v === 0 ? 0 : 0.18 + 0.82 * Math.sqrt(v / max);
          roundRect(g, cx + 3, cy + 3, cw - 6, ch - 6, 8);
          g.fillStyle = withAlpha(C.accent600, level * k);
          g.fill();
        }
      }
      if (weekend) tag(g, x + 24 * cw + 30, ry + ch / 2, 'weekend', rowP, 'owner', { px: 22, align: 'left' });
    });
    const total = days.list.length;
    const done = prog(lt, this.rowAt(total) + 0.1, this.rowAt(total) + 0.7, ease.outBack);
    tag(g, 960, y + total * ch + 60, 'Commits per hour · darker = more · no gaps overnight', done, 'ink', { px: 26 });
  }

  // ---------------------------------------------------------------- C: it adds up
  private panelCurve(lt: number) {
    const g = this.g;
    const { x, y, w, h } = CURVE;
    const lines = cumulative(hourly.lines), commits = cumulative(hourly.commits);
    const H = lines.length, maxL = lines[H - 1]!, maxC = commits[H - 1]!;
    const draw = prog(lt, this.T('v4') + 0.3, this.T('v4') + 3.6, ease.inOutCubic);
    const upto = Math.max(1, Math.floor(draw * (H - 1)));
    const pt = (i: number, series: number[], max: number): [number, number] => [x + (i / (H - 1)) * w, y + h - (series[i]! / max) * h];
    // day gridlines
    g.save();
    g.strokeStyle = C.gray200;
    g.lineWidth = 1.5;
    for (let d = 0; d < days.list.length; d++) {
      const hour = d * 24 - 9;
      if (hour < 0) continue;
      const gx = x + (hour / (H - 1)) * w;
      g.beginPath(); g.moveTo(gx, y); g.lineTo(gx, y + h); g.stroke();
      text(g, days.list[d]!.label, gx + 8, y + h + 34, { px: 22, color: C.gray500 });
    }
    g.restore();
    // lines changed: area + line
    g.save();
    g.beginPath();
    g.moveTo(x, y + h);
    for (let i = 0; i <= upto; i++) g.lineTo(...pt(i, lines, maxL));
    g.lineTo(pt(upto, lines, maxL)[0], y + h);
    g.closePath();
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, withAlpha(C.accent500, 0.35));
    grad.addColorStop(1, withAlpha(C.accent500, 0.02));
    g.fillStyle = grad;
    g.fill();
    g.beginPath();
    for (let i = 0; i <= upto; i++) i ? g.lineTo(...pt(i, lines, maxL)) : g.moveTo(...pt(i, lines, maxL));
    g.strokeStyle = C.accent600;
    g.lineWidth = 5;
    g.lineJoin = 'round';
    g.stroke();
    // commits: a second line on its own scale
    g.beginPath();
    for (let i = 0; i <= upto; i++) i ? g.lineTo(...pt(i, commits, maxC)) : g.moveTo(...pt(i, commits, maxC));
    g.strokeStyle = '#E59E2D';
    g.lineWidth = 4;
    g.setLineDash([2, 10]);
    g.lineCap = 'round';
    g.stroke();
    g.setLineDash([]);
    const [hx, hy] = pt(upto, lines, maxL);
    g.beginPath();
    g.arc(hx, hy, 12, 0, Math.PI * 2);
    g.fillStyle = C.accent600;
    g.shadowColor = C.accent500;
    g.shadowBlur = 20;
    g.fill();
    g.restore();
    const counter = draw;
    stat(g, x + 20, y + 40, lines[upto]!, 'lines changed (added + removed)', counter > 0 ? 1 : 0, { px: 96, color: C.accent700 });
    stat(g, x + 20, y + 230, commits[upto]!, 'commits', counter > 0 ? 1 : 0, { px: 64, color: '#B4690E' });
    const perDay = prog(lt, this.T('v4') + 3.8, this.T('v4') + 4.4, ease.outBack);
    tag(g, x + w - 20, y + h - 40, `≈ ${Math.round(days.fullDayAverage.lines / 1000)}k lines a day, each iteration deployed live`, perDay, 'ink', { px: 26, align: 'right' });
  }
}
