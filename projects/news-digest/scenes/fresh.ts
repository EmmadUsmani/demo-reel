// No long-running chat: every iteration is a fresh Codex session whose context fills and is thrown
// away; memory is the repo; one ≤10-line summary is handed forward. Iteration numbers are real ones
// from the supervisor's log (Nov 9).
import { backdrop, roundRect } from '@engine/draw';
import { C, withAlpha } from '@engine/palette';
import type { Cue, Frame } from '@engine/scene';
import { clamp, ease, lerp, prog } from '@engine/util';
import { heading, Narrated, node, paper, pops, tag, text } from '../kit';

const CARDS = [230, 760, 1290];
const CW = 400, CY = 300, CH = 270;
const PERIOD = 2.4;

export default class Fresh extends Narrated {
  protected ids = ['f2a', 'f2b', 'f2d', 'f2e'];
  protected hold = { f2a: 0.4, f2b: 1.2, f2d: 1.2, f2e: 1.0 };

  cues(): Cue[] {
    const bubbles = Array.from({ length: 6 }, (_, i): Cue => ({ kind: 'pop', t: 0.4 + i * 0.32, gain: 0.5, pitch: 0.9 + i * 0.04 }));
    const batons = [0, 1].map((i): Cue => ({ kind: 'swish', t: this.batonAt(i), gain: 0.6 }));
    return [
      ...bubbles, { kind: 'drop', t: this.strike() },
      ...pops(CARDS.map((_, i) => this.T('f2b') + 0.2 + i * 0.25)),
      ...batons,
      ...pops([0, 1, 2].map((i) => this.T('f2e') + 0.3 + i * 0.9)),
    ];
  }

  private strike() { return Math.max(2.4, this.E('f2a') - 1.0); }
  private batonAt(i: number) { return this.T('f2d') + 0.6 + i * 1.6; }

  render(f: Frame) {
    const g = this.g;
    const lt = f.lt;
    backdrop(g, f.t);
    heading(g, 'Fresh sessions', 'No long-running chat', prog(lt, 0.1, 1.0), 120, 150, 72);

    // the anti-pattern: a chat that keeps growing, struck out
    const chatOut = prog(lt, this.T('f2b') - 0.3, this.T('f2b') + 0.2);
    if (chatOut < 1) {
      g.save();
      g.globalAlpha = 1 - chatOut;
      for (let i = 0; i < 6; i++) {
        const k = prog(lt, 0.4 + i * 0.32, 0.8 + i * 0.32, ease.outBack);
        if (k <= 0) continue;
        const right = i % 2 === 1, w = 320 + ((i * 97) % 180), y = 300 + i * 100;
        g.save();
        g.globalAlpha *= clamp(k * 2);
        roundRect(g, right ? 1100 - w : 820, y, w, 70, 26);
        g.fillStyle = right ? withAlpha(C.accent500, 0.16) : C.paper;
        g.fill();
        g.strokeStyle = right ? C.accent300 : C.gray300;
        g.lineWidth = 2;
        g.stroke();
        g.restore();
      }
      const s = prog(lt, this.strike(), this.strike() + 0.4, ease.outCubic);
      if (s > 0) {
        g.strokeStyle = '#E5485F';
        g.lineWidth = 14;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(760, 270);
        g.lineTo(lerp(760, 1160, s), lerp(270, 900, s));
        g.stroke();
        tag(g, 1340, 560, 'One endless context', s, 'bad', { px: 30 });
      }
      g.restore();
    }

    // three iterations, each a fresh context that fills, then is thrown away
    const t0 = this.T('f2b');
    const active = (lt - t0 - 0.6) / PERIOD;
    CARDS.forEach((x, i) => {
      const p = prog(lt, t0 + 0.2 + i * 0.25, t0 + 0.9 + i * 0.25);
      const phase = ((active - i) % 3 + 3) % 3; // 0..1 while this card works
      const working = active >= i && phase < 1;
      const fill = active < i ? 0 : phase < 1 ? ease.inOutCubic(phase) : Math.max(0, 1 - (phase - 1) * 4);
      paper(g, x, CY, CW, CH, p, () => {
        text(g, `Iteration ${1556 + i}`, x + 30, CY + 62, { px: 36, weight: 700 });
        text(g, 'codex exec · fresh session', x + 30, CY + 104, { px: 24, color: C.gray600 });
        text(g, 'context window', x + 30, CY + 170, { px: 22, weight: 600, color: C.gray500 });
        roundRect(g, x + 30, CY + 186, CW - 60, 30, 15);
        g.fillStyle = C.gray200;
        g.fill();
        if (fill > 0) {
          roundRect(g, x + 30, CY + 186, (CW - 60) * fill, 30, 15);
          g.fillStyle = working ? C.accent500 : C.gray300;
          g.fill();
        }
        text(g, working ? 'working…' : active >= i ? 'done · context wiped' : 'next', x + 30, CY + 250, { px: 22, weight: 600, color: working ? C.accent600 : C.gray500 });
      }, { line: working ? C.accent400 : undefined });
    });

    // memory: the repo, read and written by every iteration
    const rail = prog(lt, t0 + 1.4, t0 + 2.2);
    node(g, 230, 700, 1460, 110, '', rail, { tone: 'owner' });
    if (rail > 0) {
      g.save();
      g.globalAlpha = clamp(rail * 2);
      text(g, 'Memory = the repo', 270, 765, { px: 32, weight: 700, color: '#8A4B07' });
      let x = 620;
      for (const file of ['MISSION.md', 'STEERING.md', 'TASKS.md', 'PROGRESS.md', 'git log']) x += tag(g, x, 755, file, prog(lt, t0 + 1.8 + (x - 620) / 1500, t0 + 2.4 + (x - 620) / 1500), 'owner', { px: 24, align: 'left' }) + 16;
      CARDS.forEach((cx) => {
        g.strokeStyle = withAlpha('#E59E2D', 0.6);
        g.lineWidth = 3;
        g.setLineDash([6, 8]);
        g.beginPath();
        g.moveTo(cx + CW / 2, CY + CH + 6);
        g.lineTo(cx + CW / 2, 700);
        g.stroke();
        g.setLineDash([]);
      });
      g.restore();
    }

    // the baton: a ≤10-line summary handed forward
    for (let i = 0; i < 2; i++) {
      const b = prog(lt, this.batonAt(i), this.batonAt(i) + 1.1, ease.inOutCubic);
      if (lt < this.T('f2d')) continue;
      const x0 = CARDS[i]! + CW - 70, x1 = CARDS[i + 1]! + 70;
      const x = lerp(x0, x1, b), y = CY - 40 - Math.sin(b * Math.PI) * 90;
      g.save();
      g.globalAlpha = prog(lt, this.batonAt(i) - 0.3, this.batonAt(i));
      g.translate(x, y);
      g.rotate(lerp(-0.08, 0.06, b));
      tag(g, 0, 0, 'summary ≤ 10 lines', 1, 'owner', { px: 24 });
      g.restore();
    }

    // why
    const why = ['No context rot', 'A crash costs one step', 'Every prompt replayable'];
    why.forEach((w, i) => tag(g, 480 + i * 480, 920, w, prog(lt, this.T('f2e') + 0.3 + i * 0.9, this.T('f2e') + 0.8 + i * 0.9), 'ink', { px: 32 }));
  }
}
