// The economics of the factory. The $100/month ChatGPT plan has a weekly limit; on day one the agent
// hit it (106 usage-limit results on Nov 1–2, supervisor log); the supervisor now paces each iteration
// against the week (control.py pace: used ≤ elapsed + 10 points, else wait ≤ 60 min, then run one).
// The chart is the real weekly quota after every iteration for the week Nov 2 13:52 → Nov 9 13:52 UTC
// (logs/usage.tsv), against that pace band. Then the token totals, and what they cost on a flat fee.
import { backdrop, roundRect } from '@engine/draw';
import { C, withAlpha } from '@engine/palette';
import type { Cue, Frame } from '@engine/scene';
import { clamp, ease, prog } from '@engine/util';
import { days, quota, seriesHours } from '../data';
import { footnote, heading, Narrated, paper, stat, tag, text, ticks } from '../kit';

const CH = { x: 250, y: 250, w: 1060, h: 620 };
const SLACK = 10;
const PLAN = 100;
const USAGE_FAILURES = 106; // result=usage in supervisor.log, Nov 1–2

export default class Pacing extends Narrated {
  protected ids = ['f9a', 'f9b', 'f9c', 'f9d', 'f9e', 'f9f', 'f9g', 'f9h'];
  protected hold = { f9b: 0.6, f9e: 2.2, f9f: 0.8, f9h: 2.0 };

  private phases() {
    return { gauge: [0, this.T('f9c') - 0.1], chart: [this.T('f9c') - 0.1, this.T('f9g') - 0.1], money: [this.T('f9g') - 0.1, this.duration()] } as const;
  }
  private drawSpan() { return [this.T('f9e') + 0.2, this.T('f9e') + 4.2] as const; }

  cues(): Cue[] {
    const [d0, d1] = this.drawSpan();
    return [
      { kind: 'land', t: 0.6, gain: 0.7 },
      { kind: 'drop', t: this.T('f9b') + 1.8, gain: 1.0 },
      { kind: 'whoosh-across', t: this.T('f9c') - 0.3, dur: 0.6, gain: 0.6 },
      { kind: 'pop', t: this.T('f9d') + 0.4 },
      ...ticks(Array.from({ length: 7 }, (_, i) => d0 + ((d1 - d0) * (i + 1)) / 7), 0.6, 0.9),
      { kind: 'drop', t: d1 + 1.0, gain: 0.7 },
      { kind: 'pop', t: this.T('f9f') + 0.4 },
      { kind: 'whoosh-across', t: this.T('f9g') - 0.3, dur: 0.6, gain: 0.6 },
      ...ticks([0, 1, 2].map((i) => this.T('f9g') + 0.3 + i * 0.7), 0.7, 1.0),
      ...ticks([0, 1, 2].map((i) => this.T('f9h') + 0.4 + i * 1.1), 0.7, 1.2),
    ];
  }

  render(f: Frame) {
    const g = this.g;
    const lt = f.lt;
    backdrop(g, f.t);
    const ph = this.phases();
    const vis = (r: readonly [number, number]) => (r[0] === 0 ? prog(lt, 0.1, 0.5) : prog(lt, r[0], r[0] + 0.4)) * (1 - prog(lt, r[1] - 0.4, r[1]));
    const head: [readonly [number, number], string][] = [[ph.gauge, 'A weekly limit, not unlimited tokens'], [ph.chart, 'Working down the week, gradually'], [ph.money, 'What it costs']];
    for (const [r, title] of head) heading(g, 'The economics', title, vis(r), 110, 140, 64);
    const va = vis(ph.gauge), vb = vis(ph.chart), vc = vis(ph.money);
    if (va > 0) { g.save(); g.globalAlpha = va; this.gauge(lt); g.restore(); }
    if (vb > 0) { g.save(); g.globalAlpha = vb; this.chart(lt); g.restore(); }
    if (vc > 0) { g.save(); g.globalAlpha = vc; this.money(lt); g.restore(); }
  }

  // ---------------------------------------------------------------- the plan, and day one
  private gauge(lt: number) {
    const g = this.g;
    paper(g, 160, 300, 640, 520, prog(lt, 0.3, 0.9), () => {
      text(g, 'ChatGPT plan', 210, 380, { px: 30, weight: 600, color: C.gray600 });
      text(g, '$100', 210, 520, { px: 150, weight: 700, family: 'sans' });
      text(g, 'a month, flat', 210, 580, { px: 34, weight: 600, color: C.gray700 });
      text(g, 'one weekly allowance', 210, 680, { px: 30, weight: 600, color: C.accent700 });
      text(g, 'shared by every iteration', 210, 722, { px: 28, color: C.gray600 });
    });
    const burn = prog(lt, this.T('f9b') + 0.3, this.T('f9b') + 1.8, ease.inCubic);
    const level = 1 - burn;
    const x = 960, y = 360, w = 760, h = 150;
    const p = prog(lt, this.T('f9a') + 1.0, this.T('f9a') + 1.6);
    g.save();
    g.globalAlpha *= p;
    text(g, 'Weekly allowance', x, y - 30, { px: 30, weight: 700 });
    roundRect(g, x, y, w, h, 28);
    g.fillStyle = C.paper;
    g.fill();
    g.strokeStyle = C.gray300;
    g.lineWidth = 4;
    g.stroke();
    roundRect(g, x + w + 6, y + 45, 22, 60, 8);
    g.fillStyle = C.gray300;
    g.fill();
    if (level > 0.01) {
      roundRect(g, x + 12, y + 12, (w - 24) * level, h - 24, 18);
      g.fillStyle = C.accent500;
      g.fill();
      g.save();
      g.globalAlpha *= clamp((0.5 - level) / 0.25);
      g.fillStyle = '#E5485F';
      g.fill();
      g.restore();
    }
    text(g, `${Math.round(level * 100)}%`, x + w - 40, y - 30, { px: 40, weight: 700, color: C.ink, align: 'right', family: 'sans' });
    g.restore();
    const wall = prog(lt, this.T('f9b') + 1.8, this.T('f9b') + 2.4, ease.outBack);
    if (wall > 0) {
      stat(g, x, 700, Math.round(USAGE_FAILURES * prog(lt, this.T('f9b') + 1.8, this.E('f9b') - 0.3)), 'times it hit the quota wall', wall, { px: 120, color: '#9F1239' });
      tag(g, x + 8, 830, 'Nov 1–2, before pacing', wall, 'bad', { px: 24, align: 'left' });
    }
  }

  // ---------------------------------------------------------------- the pace band and the real week
  private chart(lt: number) {
    const g = this.g;
    const { x, y, w, h } = CH;
    const X = (pct: number) => x + (pct / 100) * w;
    const Y = (pct: number) => y + h - (pct / 100) * h;
    const axes = prog(lt, this.T('f9c'), this.T('f9c') + 0.6);
    const band = prog(lt, this.T('f9d') + 0.2, this.T('f9d') + 1.0);
    const [d0, d1] = this.drawSpan();
    const draw = prog(lt, d0, d1, ease.inOutCubic);
    const ghost = prog(lt, d1 + 0.2, d1 + 1.4, ease.inOutCubic);

    g.save();
    g.globalAlpha *= axes;
    // ahead of pace: wait
    g.save();
    g.globalAlpha *= band;
    g.beginPath();
    g.moveTo(X(0), Y(SLACK)); g.lineTo(X(90), Y(100)); g.lineTo(X(0), Y(100)); g.closePath();
    g.fillStyle = withAlpha('#E5485F', 0.08);
    g.fill();
    g.beginPath();
    g.moveTo(X(0), Y(0)); g.lineTo(X(100), Y(100)); g.lineTo(X(90), Y(100)); g.lineTo(X(0), Y(SLACK)); g.closePath();
    g.fillStyle = withAlpha('#33A55A', 0.14);
    g.fill();
    g.restore();
    g.strokeStyle = C.gray300;
    g.lineWidth = 2;
    g.strokeRect(x, y, w, h);
    for (let d = 1; d < 7; d++) { g.beginPath(); g.moveTo(X((d / 7) * 100), y); g.lineTo(X((d / 7) * 100), y + h); g.strokeStyle = C.gray200; g.stroke(); }
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon'].forEach((d, i) => text(g, d, X((i / 7) * 100), y + h + 36, { px: 22, weight: 600, color: C.gray500, align: 'center' }));
    text(g, 'week elapsed →', x + w, y + h + 74, { px: 24, weight: 600, color: C.gray600, align: 'right' });
    ['0%', '50%', '100%'].forEach((s, i) => text(g, s, x - 16, Y(i * 50) + 8, { px: 22, weight: 600, color: C.gray500, align: 'right' }));
    text(g, 'weekly quota used', x, y - 18, { px: 24, weight: 600, color: C.gray600 });
    // the pace line
    g.setLineDash([12, 10]);
    g.strokeStyle = C.gray500;
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(100), Y(100)); g.stroke();
    g.setLineDash([]);
    g.restore();
    g.save();
    g.globalAlpha *= band;
    text(g, 'ahead of pace: wait ≤ 60 min, then run one', X(4), Y(80), { px: 24, weight: 700, color: '#9F1239' });
    g.restore();

    // the unpaced alternative: burn it in a day, idle for six
    if (ghost > 0) {
      g.save();
      g.globalAlpha *= ghost;
      g.setLineDash([4, 10]);
      g.lineCap = 'round';
      g.strokeStyle = '#E5485F';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(X(0), Y(0)); g.lineTo(X(100 / 7 * 0.8), Y(100)); g.lineTo(X(100), Y(100));
      g.stroke();
      g.setLineDash([]);
      text(g, 'unpaced: gone in a day, then idle for six', X(22), Y(100) + 40, { px: 24, weight: 700, color: '#9F1239' });
      g.restore();
    }

    // the real week
    const { start, end } = quota.week;
    const pts = quota.points.filter(([hr]) => hr >= start - 0.5 && hr <= end).map(([hr, used]): [number, number] => [clamp(((hr - start) / (end - start)) * 100, 0, 100), used]);
    const upto = Math.floor(draw * (pts.length - 1));
    if (draw > 0) {
      g.save();
      g.beginPath();
      for (let i = 0; i <= upto; i++) { const [px, py] = pts[i]!; i ? g.lineTo(X(px), Y(py)) : g.moveTo(X(px), Y(py)); }
      g.strokeStyle = C.accent700;
      g.lineWidth = 6;
      g.lineJoin = 'round';
      g.stroke();
      const [hx, hy] = pts[upto]!;
      g.beginPath();
      g.arc(X(hx), Y(hy), 13, 0, Math.PI * 2);
      g.fillStyle = C.accent700;
      g.shadowColor = C.accent500;
      g.shadowBlur = 22;
      g.fill();
      g.restore();
      tag(g, X(98), Y(6), `${Math.round(hy)}% used · ${Math.round(hx)}% of the week`, prog(lt, d0, d0 + 0.4) * (1 - prog(lt, d1 + 0.6, d1 + 0.9)), 'ink', { px: 24, align: 'right' });
    }
    const reset = prog(lt, d1 + 0.9, d1 + 1.5, ease.outBack);
    if (reset > 0) {
      const [, last] = pts[pts.length - 1]!;
      g.save();
      g.setLineDash([6, 8]);
      g.strokeStyle = '#33A55A';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(X(100), Y(last)); g.lineTo(X(100), Y(last + (1 - last) * Math.min(1, reset))); g.stroke();
      g.restore();
    }
    tag(g, X(100) - 16, Y(8), 'Monday’s reset → 1%', reset, 'ok', { px: 24, align: 'right' });

    // the legend and the prompt's budget line
    const right = 1370;
    g.save();
    g.globalAlpha *= band;
    tag(g, right, 300, 'within 10 points of pace: run', 1, 'ok', { px: 24, align: 'left' });
    tag(g, right, 360, 'more than 10 ahead: wait', 1, 'bad', { px: 24, align: 'left' });
    tag(g, right, 420, 'the real week, Nov 2–9', prog(lt, d0, d0 + 0.5), 'agent', { px: 24, align: 'left' });
    g.restore();
    paper(g, right, 500, 470, 360, prog(lt, this.T('f9f') + 0.2, this.T('f9f') + 0.8), () => {
      text(g, 'In every prompt', right + 30, 550, { px: 22, weight: 700, color: C.accent600 });
      text(g, 'Budget: weekly 58% used', right + 30, 600, { px: 22, family: 'mono' });
      text(g, 'vs 57% of the week elapsed.', right + 30, 634, { px: 22, family: 'mono' });
      text(g, 'Status: on pace.', right + 30, 668, { px: 22, family: 'mono', weight: 700, color: '#166534' });
      text(g, 'Ahead, it economizes:', right + 30, 730, { px: 24, weight: 700 });
      text(g, 'capped output · narrow reads', right + 30, 770, { px: 24, color: C.gray700 });
      text(g, '· smaller steps', right + 30, 806, { px: 24, color: C.gray700 });
    });
    footnote(g, 'Weekly quota after every iteration, from the supervisor’s usage log', prog(lt, d0, d0 + 0.6));
  }

  // ---------------------------------------------------------------- tokens, and the bill
  private money(lt: number) {
    const g = this.g;
    const tot = days.totals;
    const t = (i: number) => prog(lt, this.T('f9g') + 0.3 + i * 0.7, this.T('f9g') + 1.6 + i * 0.7);
    stat(g, 200, 420, tot.tokensIn / 1e9, 'billion input tokens', t(0), { px: 130, decimals: 2 });
    stat(g, 820, 420, (tot.tokensCached / tot.tokensIn) * 100, 'served from cache', t(1), { px: 130, suffix: '%', color: C.accent700 });
    stat(g, 1400, 420, tot.tokensOut / 1e6, 'million output tokens', t(2), { px: 130, decimals: 1 });
    const fee = feeForPeriod();
    const perM = (fee / ((tot.tokensIn + tot.tokensOut) / 1e6)) * 100;
    const perCommit = (fee / tot.commits) * 100;
    const m = (i: number) => prog(lt, this.T('f9h') + 0.4 + i * 1.1, this.T('f9h') + 1.4 + i * 1.1);
    paper(g, 160, 640, 1600, 300, m(0), () => {
      stat(g, 230, 780, fee, 'the plan’s fee for these eight days', 1, { px: 110, prefix: '≈ $', decimals: 0 });
      g.save();
      g.globalAlpha *= m(1);
      stat(g, 900, 780, perM, 'per million tokens', 1, { px: 110, prefix: '≈ ', suffix: '¢', decimals: 1, color: C.accent700 });
      g.restore();
      g.save();
      g.globalAlpha *= m(2);
      stat(g, 1360, 780, perCommit, 'per commit', 1, { px: 110, prefix: '≈ ', suffix: '¢', decimals: 1, color: '#B4690E' });
      g.restore();
    });
    footnote(g, `Tokens: ${tot.measured.toLocaleString('en-US')} measured iterations (usage log). Fee: $${PLAN}/month × elapsed days ÷ 30.4.`, m(0));
  }
}

/** The plan's fee, pro rata, for the hours the series covers. */
function feeForPeriod() {
  return (PLAN * (seriesHours / 24)) / 30.4;
}
