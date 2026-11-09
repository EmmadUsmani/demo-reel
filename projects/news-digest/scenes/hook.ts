// The cold open: the name, the claim (every line written by an agent), what the factory runs on, the
// closed loop it runs, and how fast: real per-day numbers from stats.json.
import { backdrop } from '@engine/draw';
import { C, withAlpha } from '@engine/palette';
import type { Cue, Frame } from '@engine/scene';
import { clamp, ease, lerp, prog } from '@engine/util';
import { measure, Narrated, node, pops, stat, tag, text, ticks } from '../kit';
import { days } from '../data';

const STATIONS = ['Pick a task', 'Write code', 'Test', 'Ship', 'Observe'];

export default class Hook extends Narrated {
  protected ids = ['h1', 'h3', 'h4', 'h5', 'h6'];
  protected hold = { h1: 0.4, h4: 0.6, h6: 1.0 };

  cues(): Cue[] {
    const len = (id: string) => this.E(id) - this.T(id);
    return [
      { kind: 'chime', t: 0.35 },
      ...pops([0, 1, 2].map((i) => this.T('h3') + 0.2 + i * len('h3') * 0.3)),
      ...ticks(STATIONS.map((_, i) => this.T('h4') + 0.4 + i * (len('h4') - 1.2) / STATIONS.length), 0.6),
      { kind: 'whoosh-across', t: this.T('h5') - 0.2, dur: 0.8, gain: 0.7 },
      { kind: 'land', t: this.T('h5') + 0.9, gain: 0.7 },
      ...pops([0, 1, 2].map((i) => this.T('h6') + 0.2 + i * 0.5)),
    ];
  }

  render(f: Frame) {
    const g = this.g;
    const lt = f.lt;
    backdrop(g, f.t);
    const cx = 960;

    // 1 · the name and the claim
    const nameIn = prog(lt, 0.2, 1.1, ease.outExpo);
    const up = prog(lt, this.T('h3') - 0.3, this.T('h3') + 0.5, ease.inOutQuart);
    const gone = prog(lt, this.T('h5') - 0.4, this.T('h5') + 0.2, ease.inCubic);
    g.save();
    g.globalAlpha = clamp(nameIn * 1.4) * (1 - gone);
    text(g, 'News Digest', cx, lerp(470, 200, up) + 40 * (1 - nameIn), { px: lerp(150, 92, up), weight: 700, family: 'sans', align: 'center' });
    g.restore();
    const claim = prog(lt, 1.0, 1.8, ease.outCubic) * (1 - up);
    if (claim > 0) {
      const a = 'Every line of its code was written by an ', b = 'AI agent.';
      const wa = measure(g, a, 50, 500), wb = measure(g, b, 50, 700);
      const x0 = cx - (wa + wb) / 2, y = 600 + 14 * (1 - claim);
      g.save();
      g.globalAlpha = claim;
      text(g, a, x0, y, { px: 50, weight: 500, color: C.gray700 });
      text(g, b, x0 + wa, y, { px: 50, weight: 700, color: C.accent600 });
      g.restore();
    }

    // 2 · what it runs on: three spec cards
    const len3 = this.E('h3') - this.T('h3');
    const cardsOut = prog(lt, this.T('h4') - 0.2, this.T('h4') + 0.4, ease.inCubic);
    const specs: [string, string, string][] = [
      ['AI', 'One Codex agent', 'OpenAI Codex CLI, headless'],
      ['VM', 'One exe.dev VM', 'the app and the factory'],
      ['$', '$100 a month', 'ChatGPT plan, weekly limit'],
    ];
    specs.forEach(([glyph, title, sub], i) => {
      const p = prog(lt, this.T('h3') + 0.2 + i * len3 * 0.3, this.T('h3') + 0.9 + i * len3 * 0.3) * (1 - cardsOut);
      g.save();
      g.globalAlpha = 1 - cardsOut;
      node(g, 105 + i * 580, 470, 550, 190, title, p, { sub, glyph, tone: i === 2 ? 'owner' : i === 0 ? 'agent' : 'infra', px: 44, subPx: 28 });
      g.restore();
    });

    // 3 · the closed loop
    const loopIn = prog(lt, this.T('h4') + 0.35, this.T('h4') + 1.1, ease.outCubic);
    const loopOut = gone;
    if (loopIn > 0 && loopOut < 1) {
      const len4 = this.E('h4') - this.T('h4') - 1.2;
      const R = 270, oy = 650;
      g.save();
      g.globalAlpha = loopIn * (1 - loopOut);
      g.beginPath();
      g.arc(cx, oy, R, 0, Math.PI * 2);
      g.strokeStyle = withAlpha(C.accent300, 0.6);
      g.lineWidth = 6;
      g.setLineDash([2, 16]);
      g.lineCap = 'round';
      g.stroke();
      g.setLineDash([]);
      // the work travelling round the loop
      const spin = (lt - this.T('h4')) / Math.max(1, len4);
      const a = -Math.PI / 2 + Math.PI * 2 * Math.max(0, spin);
      for (let k = 0; k < 14; k++) {
        const b = a - k * 0.045;
        g.beginPath();
        g.arc(cx + R * Math.cos(b), oy + R * Math.sin(b), 13 - k * 0.7, 0, Math.PI * 2);
        g.fillStyle = withAlpha(C.accent600, 0.9 * (1 - k / 14));
        g.fill();
      }
      text(g, 'closed loop', cx, oy + 22, { px: 84, family: 'display', color: C.ink, align: 'center' });
      STATIONS.forEach((s, i) => {
        const ang = -Math.PI / 2 + (i / STATIONS.length) * Math.PI * 2;
        const lit = prog(lt, this.T('h4') + 0.4 + (i * len4) / STATIONS.length, this.T('h4') + 0.7 + (i * len4) / STATIONS.length);
        const sx = cx + (R + 0) * Math.cos(ang), sy = oy + R * Math.sin(ang);
        tag(g, sx, sy, s, 1, 'agent', { px: 34 });
        g.save();
        g.globalAlpha *= lit;
        tag(g, sx, sy, s, 1, 'ink', { px: 34 });
        g.restore();
      });
      const steer = prog(lt, this.at('h4', 0.78), this.at('h4', 0.9), ease.outBack);
      tag(g, cx + 600, oy - 170, 'We only steer', steer, 'owner', { px: 36 });
      g.restore();
    }

    // 4 · velocity: real per-day numbers
    const v = prog(lt, this.T('h5') - 0.1, this.T('h5') + 0.9, ease.outCubic);
    const statsOut = prog(lt, this.E('h6') - 0.5, this.E('h6'), ease.inCubic);
    if (v > 0) {
      g.save();
      g.globalAlpha = 1 - statsOut;
      text(g, 'EVERY DAY, AROUND THE CLOCK', cx, 250, { px: 30, weight: 700, color: C.accent600, align: 'center', spacing: 3 });
      stat(g, 560, 500, days.fullDayAverage.iterations, 'iterations a day', prog(lt, this.T('h5') + 0.3, this.T('h5') + 2.2), { px: 220, align: 'center' });
      stat(g, 1360, 500, days.fullDayAverage.commits, 'commits a day', prog(lt, this.T('h5') + 1.2, this.T('h5') + 3.1), { px: 220, align: 'center', color: C.accent700 });
      const s6 = (i: number) => prog(lt, this.T('h6') + 0.2 + i * 0.5, this.T('h6') + 1.4 + i * 0.5);
      stat(g, 380, 880, days.totals.commits, 'commits in nine days', s6(0), { px: 96, align: 'center' });
      stat(g, 960, 880, 90, 'thousand lines of TypeScript', s6(1), { px: 96, align: 'center', suffix: 'k' });
      stat(g, 1540, 880, days.list.length, 'days since the first commit', s6(2), { px: 96, align: 'center' });
      g.restore();
    }
  }
}
