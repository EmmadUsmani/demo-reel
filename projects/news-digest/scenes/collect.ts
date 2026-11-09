// A normal day, Pacific time (handbook: 01-app/03-jobs-and-schedules.md): feeds and HN every 30 min,
// free X discovery hourly (each post verified through X oEmbed), the capped xAI search 5–30 min before
// the 07:00 edition, then the edition. A playhead sweeps the day; the camera then pushes into 06:00–07:30.
import { backdrop, roundRect } from '@engine/draw';
import { C, withAlpha } from '@engine/palette';
import type { Cue, Frame } from '@engine/scene';
import { applyCam, camAt, type Cam } from '@engine/slide';
import { clamp, ease, prog } from '@engine/util';
import { camCues, heading, Narrated, tag, text, ticks } from '../kit';

const X0 = 380, X1 = 1800;
const xOf = (hour: number) => X0 + (hour / 24) * (X1 - X0);
const LANES: [string, string, number][] = [
  ['Feeds + HN', 'every 30 min', 330],
  ['Free X discovery', 'hourly · oEmbed-verified', 470],
  ['Paid X search', 'capped xAI, before the edition', 610],
  ['Edition', 'daily, 07:00', 750],
];

export default class Collect extends Narrated {
  protected ids = ['a2a', 'a2c'];
  protected hold = { a2a: 0.6, a2c: 2.0 };

  private sweep() { return [this.T('a2a') + 0.6, this.E('a2a') - 0.2] as const; }
  private cams(): [number, Cam, ((t: number) => number)?][] {
    const wide: Cam = { x: 960, y: 560, zoom: 1 };
    const close: Cam = { x: xOf(6.75), y: 600, zoom: 2.0 };
    return [[0, wide], [this.T('a2c') - 0.2, wide], [this.T('a2c') + 0.8, close, ease.inOutQuart], [this.duration() - 0.9, close], [this.duration(), wide, ease.inOutQuart]];
  }

  cues(): Cue[] {
    const [s0, s1] = this.sweep();
    return [...camCues(this.cams()), ...ticks(Array.from({ length: 8 }, (_, i) => s0 + ((s1 - s0) * i) / 8), 0.45, 0.9), { kind: 'pop', t: this.T('a2c') + 1.2 }, { kind: 'chime', t: this.T('a2c') + 2.6, gain: 0.5 }];
  }

  render(f: Frame) {
    const g = this.g;
    const lt = f.lt;
    backdrop(g, f.t);
    heading(g, 'Collection', 'All day, every day', prog(lt, 0.1, 0.9) * (1 - prog(lt, this.T('a2c') - 0.2, this.T('a2c') + 0.2)), 110, 135, 64);
    const [s0, s1] = this.sweep();
    const now = 24 * prog(lt, s0, s1, ease.inOutCubic);
    g.save();
    applyCam(g, camAt(lt, this.cams()));
    const axes = prog(lt, 0.3, 0.9);
    g.save();
    g.globalAlpha = axes;
    for (let h = 0; h <= 24; h += 3) {
      g.strokeStyle = C.gray200;
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(xOf(h), 260); g.lineTo(xOf(h), 820); g.stroke();
      text(g, h === 0 || h === 24 ? '12 am' : h === 12 ? '12 pm' : h < 12 ? `${h} am` : `${h - 12} pm`, xOf(h), 860, { px: 22, weight: 600, color: C.gray500, align: 'center' });
    }
    g.globalAlpha *= 1 - prog(lt, this.T('a2c') - 0.2, this.T('a2c') + 0.4);
    LANES.forEach(([name, sub, y]) => {
      text(g, name, X0 - 30, y + 2, { px: 28, weight: 700, align: 'right' });
      text(g, sub, X0 - 30, y + 34, { px: 20, weight: 500, color: C.gray500, align: 'right' });
    });
    g.restore();
    // the marks each lane makes as the day passes
    const mark = (hour: number, y: number, r: number, color: string) => {
      const k = clamp((now - hour) * 4);
      if (k <= 0) return;
      g.beginPath();
      g.arc(xOf(hour), y, r * ease.outBack(k), 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
    };
    for (let h = 0; h < 24; h += 0.5) mark(h, LANES[0]![2], 7, C.accent400);
    for (let h = 0; h < 24; h += 1) mark(h + 0.25, LANES[1]![2], 9, C.accent600);
    const paid = clamp((now - 6.5) * 3);
    if (paid > 0) {
      roundRect(g, xOf(6.5), LANES[2]![2] - 16, (xOf(6.92) - xOf(6.5)) * paid, 32, 10);
      g.fillStyle = '#E59E2D';
      g.fill();
    }
    const ed = clamp((now - 7) * 4);
    if (ed > 0) {
      g.save();
      g.translate(xOf(7), LANES[3]![2]);
      g.rotate(Math.PI / 4);
      g.scale(ease.outBack(ed), ease.outBack(ed));
      g.fillStyle = C.labelInk;
      g.fillRect(-16, -16, 32, 32);
      g.restore();
    }
    // the playhead
    if (lt > s0 - 0.2 && lt < s1 + 0.4) {
      g.save();
      g.globalAlpha = prog(lt, s0 - 0.2, s0) * (1 - prog(lt, s1, s1 + 0.4));
      g.strokeStyle = withAlpha(C.accent600, 0.8);
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(xOf(now), 250); g.lineTo(xOf(now), 830); g.stroke();
      g.restore();
    }
    // up close: the paid search, then the edition
    const close = prog(lt, this.T('a2c') + 1.0, this.T('a2c') + 1.5);
    tag(g, xOf(6.71), LANES[2]![2] - 50, 'x_search · $0.40/day cap', close, 'owner', { px: 14 });
    tag(g, xOf(7), LANES[3]![2] - 46, '07:00 · edition job', prog(lt, this.T('a2c') + 2.4, this.T('a2c') + 2.9), 'ink', { px: 14 });
    tag(g, xOf(6.71), LANES[1]![2] - 44, 'X links → oEmbed → verified', prog(lt, this.T('a2c') + 0.9, this.T('a2c') + 1.4), 'agent', { px: 14 });
    g.restore();
  }
}
