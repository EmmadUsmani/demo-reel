// The edition pipeline (handbook: 01-app/04-edition-pipeline.md), per topic, in parallel: candidates →
// rules (no AI) → Haiku triage (batches of 50, 4 at a time, cached) → top 40 grouped into stories by AI →
// 10 to the Sonnet editor (schema-checked, every story backed by a real candidate) → one immutable
// snapshot. Out of budget, a topic falls back to non-AI ranking and still publishes. The particles are
// illustrative of the narrowing, not counts.
import { backdrop, roundRect } from '@engine/draw';
import { C, withAlpha } from '@engine/palette';
import type { Cue, Frame } from '@engine/scene';
import { clamp, ease, mulberry32, prog } from '@engine/util';
import { edge, heading, Narrated, node, pops, tag, text } from '../kit';

const STAGES: [string, string, string][] = [
  ['Candidates', 'hundreds per topic', 'infra'],
  ['Rules', 'quality filters · no AI', 'infra'],
  ['Haiku triage', 'batches of 50 · 4 at a time', 'agent'],
  ['Group stories', 'top 40 · by AI · 10 go on', 'agent'],
  ['Sonnet editor', 'brief + summaries · validated', 'agent'],
  ['Snapshot', 'one immutable record', 'ok'],
];
const SX = [110, 405, 700, 995, 1290, 1585], SW = 260, SY = 250, SH = 150;
const TOPICS = ['Tech & AI', 'NBA', 'Gaming', 'World'];
const LY = [500, 580, 660, 740];
const SURVIVE = [1, 0.7, 0.32, 0.16, 0.1, 0.1];
const FALLBACK_LANE = 3;

export default class Pipeline extends Narrated {
  protected ids = ['a3b', 'a3c', 'a3d', 'a3e', 'a3g'];
  protected hold = { a3g: 1.6 };

  private stageAt(i: number) { return [this.at('a3b', 0.05), this.at('a3b', 0.55), this.T('a3c') + 0.2, this.T('a3d') + 0.2, this.T('a3e') + 0.2, this.T('a3g') + 0.2][i]!; }

  cues(): Cue[] {
    return [...pops(STAGES.map((_, i) => this.stageAt(i))), { kind: 'drop', t: this.T('a3g') + 0.8, gain: 0.8 }, { kind: 'drop', t: this.at('a3g', 0.45), gain: 0.7 }, { kind: 'pop', t: this.at('a3g', 0.8) }];
  }

  render(f: Frame) {
    const g = this.g;
    const lt = f.lt;
    backdrop(g, f.t);
    heading(g, 'The edition pipeline', 'Cheap first, expensive last', prog(lt, 0.1, 0.9), 110, 140, 64);

    STAGES.forEach(([title, sub, tn], i) => {
      const p = prog(lt, this.stageAt(i) - 0.2, this.stageAt(i) + 0.5);
      node(g, SX[i]!, SY, SW, SH, title, p, { sub, tone: tn as any, px: 30, subPx: 20, glow: clamp(prog(lt, this.stageAt(i), this.stageAt(i) + 0.3) - prog(lt, this.stageAt(i + 1) - 0.1, this.stageAt(i + 1) + 0.2)) });
      if (i < STAGES.length - 1) edge(g, [[SX[i]! + SW + 6, SY + SH / 2], [SX[i + 1]! - 6, SY + SH / 2]], p, { color: '#8A93A8' });
    });

    // topic lanes with work flowing through them
    const lanes = prog(lt, this.at('a3b', 0.1), this.at('a3b', 0.4));
    const fallback = prog(lt, this.at('a3g', 0.4), this.at('a3g', 0.55));
    TOPICS.forEach((topic, li) => {
      const y = LY[li]!;
      g.save();
      g.globalAlpha = lanes;
      text(g, topic, SX[0]! - 4, y + 9, { px: 24, weight: 700, color: C.gray700 });
      g.strokeStyle = C.gray200;
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(SX[0]! + 150, y); g.lineTo(SX[5]! + SW, y); g.stroke();
      g.restore();
      const rand = mulberry32(17 + li * 101);
      const x0 = SX[0]! + 150, len = SX[5]! + SW - x0, speed = 240, n = 60;
      const run = lt - this.at('a3b', 0.15);
      for (let k = 0; k < n; k++) {
        const offset = (k + rand() * 0.6) / n;
        const fate = rand();
        if (run < offset * (len / speed)) continue; // not yet released
        const x = x0 + (((run * speed) / len + 1 - offset) % 1) * len;
        // which stage it reached
        let stage = 0;
        for (let s = 1; s < SX.length; s++) if (x > SX[s]!) stage = s;
        const unlocked = lt > this.stageAt(stage);
        if (!unlocked && stage > 0) continue;
        if (fate > SURVIVE[stage]!) continue;
        const onFallback = li === FALLBACK_LANE && fallback > 0 && stage >= 2 && stage <= 4;
        const py = onFallback ? y + (872 - y) * clamp(fallback) : y;
        g.beginPath();
        g.arc(x, py, stage >= 5 ? 9 : 6, 0, Math.PI * 2);
        g.fillStyle = onFallback ? '#E59E2D' : stage >= 5 ? '#33A55A' : stage >= 2 ? C.accent600 : '#8A93A8';
        g.globalAlpha = lanes;
        g.fill();
        g.globalAlpha = 1;
      }
    });

    // validation and the snapshot lock
    const lock = prog(lt, this.T('a3g') + 0.6, this.T('a3g') + 1.1, ease.outBack);
    tag(g, SX[5]! + SW / 2, SY - 34, 'DB trigger: no edits', lock, 'ok', { px: 20 });
    tag(g, SX[4]! + SW / 2, SY - 34, 'no source → rejected', prog(lt, this.at('a3e', 0.6), this.at('a3e', 0.8)), 'bad', { px: 20 });
    tag(g, SX[2]! + SW / 2, SY - 34, 'cached per item', prog(lt, this.at('a3c', 0.6), this.at('a3c', 0.8)), 'agent', { px: 20 });
    tag(g, SX[3]! + SW / 2, SY - 34, 'never keyword rules', prog(lt, this.at('a3d', 0.5), this.at('a3d', 0.7)), 'agent', { px: 20 });

    // out of budget: the fallback path
    if (fallback > 0) {
      g.save();
      g.globalAlpha = fallback;
      roundRect(g, SX[2]! - 20, 846, SX[4]! + SW - SX[2]! + 40, 104, 20);
      g.fillStyle = withAlpha('#E59E2D', 0.1);
      g.fill();
      g.strokeStyle = '#E59E2D';
      g.setLineDash([8, 8]);
      g.lineWidth = 2;
      g.stroke();
      g.setLineDash([]);
      text(g, 'AI budget spent → non-AI ranking, saved article text', SX[2]!, 930, { px: 26, weight: 600, color: '#8A4B07' });
      g.restore();
      tag(g, SX[5]! + SW / 2, 900, 'the edition still ships', prog(lt, this.at('a3g', 0.8), this.at('a3g', 0.9)), 'ok', { px: 26 });
    }
  }
}
