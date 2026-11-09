// One iteration as the supervisor runs it (handbook: 02-agent/01-iteration-loop.md): stop file, pace
// check, pull and render, codex exec (≤75 min), classify from the CLI's event stream, revert owner
// files, push, health check, record usage; then the result decides the wait. A token walks the path.
import { backdrop } from '@engine/draw';
import { C } from '@engine/palette';
import type { Cue, Frame } from '@engine/scene';
import { applyCam, camAt, type Cam } from '@engine/slide';
import { clamp, ease, keys, prog } from '@engine/util';
import { camCues, edge, flushLabels, heading, measure, Narrated, node, pops, tag, ticks, type Pt } from '../kit';

const X = 520, W0 = 440;
const ROWS = { stop: 210, pace: 330, pull: 450, codex: 580, classify: 720, after: 850 };
const RESULTS: [string, string, 'ok' | 'bad' | 'owner' | 'infra'][] = [
  ['ok, with commits', 'next iteration, now', 'ok'],
  ['crash or timeout', 'wait 5 min, retry', 'bad'],
  ['weekly quota hit', 'wait for the reset (≤ 12 h)', 'owner'],
  ['login expired', 'retry every 15 min', 'infra'],
];
const AFTER = ['revert owner files', 'push', 'health check', 'record usage'];

export default class Loop extends Narrated {
  protected ids = ['f3a', 'f3e', 'f3f', 'f3g'];
  protected hold = { f3a: 0.6, f3g: 1.4 };

  private stops() {
    const a = this.T('f3a'), la = this.E('f3a') - a;
    return { stop: a + 0.5, pace: a + la * 0.22, pull: a + la * 0.42, codex: a + la * 0.62, classify: this.T('f3e') + 0.3, after: this.T('f3f') + 0.2, results: this.T('f3g') + 0.3 };
  }

  private cams(): [number, Cam, ((t: number) => number)?][] {
    const s = this.stops();
    const wide: Cam = { x: 960, y: 540, zoom: 1 };
    return [
      [0, wide],
      [s.classify - 0.6, wide],
      [s.classify + 0.4, { x: 860, y: 600, zoom: 1.12 }, ease.inOutQuart],
      [s.results - 0.4, { x: 860, y: 600, zoom: 1.12 }],
      [s.results + 0.5, wide, ease.inOutQuart],
      [this.duration(), wide],
    ];
  }

  cues(): Cue[] {
    const s = this.stops();
    return [
      ...camCues(this.cams()),
      ...ticks([s.stop, s.pace, s.pull, s.codex, s.classify]),
      ...ticks(AFTER.map((_, i) => s.after + 0.4 + i * 0.9), 0.6, 1.1),
      ...pops(RESULTS.map((_, i) => s.results + i * 0.8)),
    ];
  }

  render(f: Frame) {
    const g = this.g;
    const lt = f.lt;
    const s = this.stops();
    backdrop(g, f.t);
    heading(g, 'The supervisor loop', 'One iteration', prog(lt, 0.1, 0.9) * (1 - prog(lt, s.pull, s.pull + 0.4)), 120, 140, 68);
    g.save();
    applyCam(g, camAt(lt, this.cams()));
    const p = (t: number) => prog(lt, t - 0.3, t + 0.3);
    const gray = '#8A93A8';
    const mid = X + W0 / 2;
    const v = (a: number, b: number): Pt[] => [[mid, a], [mid, b]];
    const widths = AFTER.map((step) => measure(g, step, 24, 600) + 24 * 1.6);
    const rowW = widths.reduce((a, b) => a + b + 16, -16);
    const rowX = mid - rowW / 2;

    edge(g, v(ROWS.stop + 42, ROWS.pace - 42), p(s.pace), { color: gray, label: 'no' });
    edge(g, v(ROWS.pace + 42, ROWS.pull - 42), p(s.pull), { color: gray, label: 'on pace' });
    edge(g, v(ROWS.pull + 42, ROWS.codex - 60), p(s.codex), { color: gray });
    edge(g, v(ROWS.codex + 60, ROWS.classify - 42), p(s.classify), { color: gray });
    edge(g, v(ROWS.classify + 42, ROWS.after - 36), p(s.after), { color: gray });
    edge(g, [[X + W0, ROWS.stop], [1080, ROWS.stop]], p(s.pace), { color: gray, label: 'yes', labelAt: 0.5 });
    edge(g, [[X + W0, ROWS.pace], [1080, ROWS.pace]], p(s.pull), { color: gray, label: 'ahead', labelAt: 0.5 });
    edge(g, [[rowX + rowW + 8, ROWS.after], [1240, ROWS.after], [1240, 480], [1300, 480]], prog(lt, s.results - 0.2, s.results + 0.6), { color: C.accent500, label: 'result', labelAt: 0.4 });
    // back to the top
    edge(g, [[rowX - 8, ROWS.after], [340, ROWS.after], [340, ROWS.stop], [X, ROWS.stop]], prog(lt, s.results + 3.2, s.results + 4.2), { color: C.accent600, width: 5, flow: lt, label: 'next iteration', labelAt: 0.5, labelTone: 'agent' });

    node(g, X, ROWS.stop - 42, W0, 84, 'STOP file?', p(s.stop), { tone: 'owner', glow: beatGlow(lt, s.stop, s.pace) });
    node(g, 1080, ROWS.stop - 36, 220, 72, 'Stopped', p(s.pace), { tone: 'muted' });
    node(g, X, ROWS.pace - 42, W0, 84, 'Ahead of weekly pace?', p(s.pace), { tone: 'owner', glow: beatGlow(lt, s.pace, s.pull) });
    node(g, 1080, ROWS.pace - 36, 300, 72, 'wait ≤ 60 min', p(s.pull), { tone: 'muted' });
    node(g, X, ROWS.pull - 42, W0, 84, 'Pull main · render prompt', p(s.pull), { glow: beatGlow(lt, s.pull, s.codex) });
    node(g, X - 20, ROWS.codex - 60, W0 + 40, 120, 'codex exec', p(s.codex), { tone: 'agent', sub: 'fresh session · 75 min timeout', px: 38, glow: beatGlow(lt, s.codex, s.classify) });
    node(g, X, ROWS.classify - 42, W0, 84, 'Classify the result', p(s.classify), { sub: 'from the CLI event stream', glow: beatGlow(lt, s.classify, s.after) });
    // after the run: four steps in a row
    let ax = rowX;
    AFTER.forEach((step, i) => {
      const t = s.after + 0.4 + i * 0.9;
      tag(g, ax, ROWS.after, step, p(t), lt > t + 0.3 && lt < s.results ? 'ink' : 'infra', { px: 24, align: 'left' });
      ax += widths[i]! + 16;
    });
    RESULTS.forEach(([what, then, tn], i) => {
      const t = s.results + i * 0.8;
      node(g, 1300, 430 + i * 120, 480, 100, what, p(t), { sub: then, tone: tn, px: 28 });
    });
    flushLabels();
    // the token walking the path
    const y = keys(lt, [[s.stop - 0.3, ROWS.stop], [s.pace, ROWS.pace, ease.inOutCubic], [s.pull, ROWS.pull, ease.inOutCubic], [s.codex, ROWS.codex, ease.inOutCubic], [s.classify, ROWS.classify, ease.inOutCubic], [s.after, ROWS.after, ease.inOutCubic]]);
    const on = prog(lt, s.stop - 0.3, s.stop) * (1 - prog(lt, s.after + 0.2, s.after + 0.5));
    if (on > 0) {
      g.save();
      g.globalAlpha = on;
      g.beginPath();
      g.arc(X - 44, Math.min(y, ROWS.classify + 60), 14 + 3 * Math.sin(lt * 6), 0, Math.PI * 2);
      g.fillStyle = C.accent600;
      g.shadowColor = C.accent500;
      g.shadowBlur = 20;
      g.fill();
      g.restore();
    }
    g.restore();
    const never = prog(lt, this.E('f3g') - 1.3, this.E('f3g') - 0.8, ease.outBack);
    tag(g, 960, 1010, 'It never gives up. Only a human stops it.', never * (1 - prog(lt, this.duration() - 0.6, this.duration())), 'ink', { px: 30 });
  }
}

function beatGlow(lt: number, a: number, b: number) {
  return clamp(prog(lt, a - 0.2, a + 0.2) - prog(lt, b - 0.2, b + 0.2));
}
