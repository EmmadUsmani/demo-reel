// Guardrails that live outside the model (AGENTS.md, README "Run locally", the supervisor, the AI
// budgets): four fences around the agent.
import { backdrop } from '@engine/draw';
import { C, withAlpha } from '@engine/palette';
import type { Cue, Frame } from '@engine/scene';
import { ease, prog } from '@engine/util';
import { heading, Narrated, node, pops, text } from '../kit';

const FENCES: [number, number, string, string][] = [
  [160, 300, 'Tests never call paid APIs', 'recorded fixtures · Testcontainers'],
  [1180, 300, 'pnpm check gates every commit', 'format · lint · types · boundaries · tests'],
  [160, 720, 'Owner files are reverted', 'by the supervisor, after every run'],
  [1180, 720, 'Spend caps the providers enforce', 'Anthropic $15/month · xAI $15 prepaid'],
];

export default class Guardrails extends Narrated {
  protected ids = ['f10a'];
  protected lead = 0.6;
  protected hold = { f10a: 2.6 };

  private fenceAt(i: number) { return this.at('f10a', [0.3, 0.62, 0.8, 0.95][i]!); }
  /** When fence `i` has fully landed. */
  private fenceUp(i: number) { return this.fenceAt(i) + 0.5; }
  /** The last fence lands later in its beat than kit's usual stop (STOP_LEAD before the end): stop once it is up. */
  stops() { return [this.fenceUp(FENCES.length - 1)]; }
  cues(): Cue[] { return [{ kind: 'land', t: 0.5, gain: 0.6 }, ...pops(FENCES.map((_, i) => this.fenceAt(i)))]; }

  render(f: Frame) {
    const g = this.g;
    const lt = f.lt;
    backdrop(g, f.ambient);
    heading(g, 'Guardrails', 'Enforced outside the model', prog(lt, 0.1, 0.9), 110, 140, 66);
    const core = prog(lt, 0.3, 1.0, ease.outCubic);
    g.save();
    g.globalAlpha = core;
    for (let r = 0; r < 3; r++) {
      g.beginPath();
      g.arc(960, 600, 150 + r * 46 + Math.sin(f.ambient * 1.5 + r) * 3, 0, Math.PI * 2);
      g.strokeStyle = withAlpha(C.accent400, 0.35 - r * 0.1);
      g.lineWidth = 3;
      g.stroke();
    }
    g.beginPath();
    g.arc(960, 600, 130, 0, Math.PI * 2);
    g.fillStyle = C.labelInk;
    g.fill();
    text(g, 'Codex', 960, 612, { px: 48, weight: 700, color: C.white, align: 'center', family: 'sans' });
    g.restore();
    FENCES.forEach(([x, y, title, sub], i) => node(g, x, y, 580, 140, title, prog(lt, this.fenceAt(i) - 0.2, this.fenceUp(i)), { sub, tone: i === 3 ? 'owner' : i === 2 ? 'bad' : 'ok', px: 32, subPx: 24 }));
  }
}
