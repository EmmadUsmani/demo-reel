// How the humans steer (CLAUDE.md, docs/lead/playbook.md, the status-check / edition-review / steer
// skills): a lead session diagnoses, proposes; the owner approves; STEERING.md is pushed; the next
// iteration pulls it and works; the agent acks. Around and around.
import { backdrop } from '@engine/draw';
import { C } from '@engine/palette';
import type { Cue, Frame } from '@engine/scene';
import { clamp, ease, prog } from '@engine/util';
import { along, edge, heading, Narrated, node, pops, text, type Pt, type Tone } from '../kit';

type Station = { x: number; y: number; title: string; sub: string; tone: Tone; line: string; k: number };
const W0 = 420, H0 = 124;

export default class Steering extends Narrated {
  protected ids = ['f6a', 'f6b', 'f6c', 'f6d', 'f6f'];
  protected hold = { f6f: 1.6 };

  private stations(): Station[] {
    return [
      { x: 170, y: 255, title: 'Lead session', sub: 'Claude Code, on a laptop', tone: 'owner', line: 'f6a', k: 0.3 },
      { x: 750, y: 205, title: 'Diagnose', sub: 'agent logs · the morning edition', tone: 'owner', line: 'f6b', k: 0.25 },
      { x: 1330, y: 255, title: 'Owner approves', sub: 'a proposal, then an explicit yes', tone: 'owner', line: 'f6c', k: 0.25 },
      { x: 1330, y: 740, title: 'STEERING.md, pushed', sub: 'to main on GitHub', tone: 'infra', line: 'f6c', k: 0.65 },
      { x: 750, y: 790, title: 'Next iteration pulls it', sub: 're-ranks TASKS.md, starts work', tone: 'agent', line: 'f6d', k: 0.1 },
      { x: 170, y: 740, title: 'ack: appended', sub: 'iteration number, what it did', tone: 'agent', line: 'f6d', k: 0.62 },
    ];
  }
  private at0(s: Station) { return this.at(s.line, s.k); }

  private path(): Pt[] {
    const c = this.stations().map((s): Pt => [s.x + W0 / 2, s.y + H0 / 2]);
    return [...c, c[0]!];
  }

  cues(): Cue[] {
    return [...pops(this.stations().map((s) => this.at0(s))), { kind: 'chime', t: this.T('f6f') + 0.3, gain: 0.6 }];
  }

  render(f: Frame) {
    const g = this.g;
    const lt = f.lt;
    backdrop(g, f.t);
    heading(g, 'Steering', 'The humans’ half of the loop', prog(lt, 0.1, 0.9) * (1 - prog(lt, this.T('f6b') - 0.3, this.T('f6b'))), 110, 135, 62);
    const st = this.stations();
    const c = this.path();
    const full = prog(lt, this.T('f6f'), this.T('f6f') + 0.6);
    // edges between consecutive stations, each drawn as the next station arrives
    for (let i = 0; i < st.length; i++) {
      const a = c[i]!, b = c[i + 1]!;
      const from: Pt = shrink(a, b, i % 3 === 2 ? H0 / 2 + 6 : W0 / 2 + 6, i % 3 === 2);
      const to: Pt = shrink(b, a, i % 3 === 2 ? H0 / 2 + 6 : W0 / 2 + 6, i % 3 === 2);
      const next = i + 1 < st.length ? this.at0(st[i + 1]!) : this.T('f6f');
      edge(g, [from, to], prog(lt, next - 0.4, next + 0.2), { color: full > 0 ? C.accent600 : C.gray500, width: 3 + full * 2, flow: lt });
    }
    // the work going round
    if (full > 0) {
      const len = c.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - c[i - 1]![0], p[1] - c[i - 1]![1]) : 0), 0);
      for (let k = 0; k < 3; k++) {
        const [x, y] = along(c, ((lt - this.T('f6f')) * 700 + (k * len) / 3) % len);
        g.save();
        g.globalAlpha = full;
        g.beginPath();
        g.arc(x, y, 16, 0, Math.PI * 2);
        g.fillStyle = C.accent600;
        g.shadowColor = C.accent500;
        g.shadowBlur = 24;
        g.fill();
        g.restore();
      }
    }
    st.forEach((s, i) => {
      const t = this.at0(s);
      const nextT = i + 1 < st.length ? this.at0(st[i + 1]!) : this.T('f6f');
      const glow = clamp(prog(lt, t, t + 0.3) - prog(lt, nextT - 0.2, nextT + 0.2)) + full * 0.6;
      node(g, s.x, s.y, W0, H0, s.title, prog(lt, t - 0.2, t + 0.5), { sub: s.sub, tone: s.tone, px: 32, glow });
    });
    const centre = prog(lt, this.T('f6a') + 0.6, this.T('f6a') + 1.4, ease.outCubic);
    g.save();
    g.globalAlpha = centre;
    text(g, 'closed loop', 960, 555, { px: 88, family: 'display', align: 'center' });
    g.restore();
    const close = prog(lt, this.T('f6f') + 0.4, this.T('f6f') + 1.1, ease.outCubic);
    g.save();
    g.globalAlpha = close;
    text(g, 'Humans set direction. The factory builds.', 960, 620, { px: 32, weight: 600, color: C.accent700, align: 'center' });
    g.restore();
  }
}

/** Move `p` toward `q` by `d` along one axis (horizontal unless `vertical`), to start an edge at a box's side. */
function shrink(p: Pt, q: Pt, d: number, vertical: boolean): Pt {
  if (vertical) return [p[0], p[1] + Math.sign(q[1] - p[1]) * d];
  return [p[0] + Math.sign(q[0] - p[0]) * d, p[1] + (q[1] - p[1]) * (d / Math.max(1, Math.abs(q[0] - p[0])))];
}
