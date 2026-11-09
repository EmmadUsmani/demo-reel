// The product's own AI budget (handbook: 01-app/06-ai-and-budgets.md), separate from the coding plan:
// Anthropic (Haiku triage, Sonnet editor) under a $15/month workspace limit, $14/month and ≤ $1/day in
// the app, Sonnet ≤ 80% of the day; xAI's x_search (grok-4.3) on $15 prepaid, $0.40/day and $12/month.
// Then the ledger: reserve worst case under a lock, refuse or call, settle. An edition ≈ 30¢ of AI
// (Nov 3: $0.34, 43 calls; Nov 6: $0.29, 37 calls; admin overview and STEERING acks).
import { backdrop, roundRect } from '@engine/draw';
import { C } from '@engine/palette';
import type { Cue, Frame } from '@engine/scene';
import { clamp, ease, prog } from '@engine/util';
import { edge, flushLabels, heading, Narrated, paper, pops, stat, tag, text, ticks } from '../kit';

export default class Budgets extends Narrated {
  protected ids = ['a4a', 'a4b', 'a4c', 'a4d', 'a4e', 'a4f'];
  protected hold = { a4d: 0.6, a4f: 2.0 };

  private phases() { return { cards: [0, this.T('a4e') - 0.1], ledger: [this.T('a4e') - 0.1, this.duration()] } as const; }
  private msgAt(i: number) { return this.at('a4e', [0.12, 0.42, 0.58, 0.72, 0.86][i]!); }

  cues(): Cue[] {
    return [
      { kind: 'land', t: 0.5, gain: 0.6 },
      { kind: 'pop', t: this.T('a4b') + 0.3 }, { kind: 'pop', t: this.T('a4d') + 0.3 },
      ...ticks([0.2, 0.5, 0.75].map((k) => this.at('a4c', k)), 0.6, 1.0),
      { kind: 'whoosh-across', t: this.T('a4e') - 0.3, dur: 0.6, gain: 0.6 },
      ...ticks([0, 1, 2, 3, 4].map((i) => this.msgAt(i)), 0.6, 0.9),
      ...pops([this.T('a4f') + 0.4, this.T('a4f') + 1.6]),
    ];
  }

  render(f: Frame) {
    const g = this.g;
    const lt = f.lt;
    backdrop(g, f.t);
    const ph = this.phases();
    const vis = (r: readonly [number, number]) => (r[0] === 0 ? prog(lt, 0.1, 0.5) : prog(lt, r[0], r[0] + 0.4)) * (1 - prog(lt, r[1] - 0.4, r[1]));
    heading(g, 'The product’s AI budget', 'Separate from the coding plan', vis(ph.cards), 110, 140, 64);
    heading(g, 'The spend ledger', 'Reserve first, then call', vis(ph.ledger), 110, 140, 64);
    const va = vis(ph.cards), vb = vis(ph.ledger);
    if (va > 0) { g.save(); g.globalAlpha = va; this.cards(lt); g.restore(); }
    if (vb > 0) { g.save(); g.globalAlpha = vb; this.ledger(lt); g.restore(); }
  }

  private cards(lt: number) {
    const g = this.g;
    const p = (a: number, d = 0.5) => prog(lt, a, a + d);
    // Anthropic
    paper(g, 110, 230, 900, 780, p(this.T('a4b')), () => {
      text(g, 'Anthropic · the edition', 160, 300, { px: 36, weight: 700 });
      tag(g, 160, 360, 'Haiku 5.5 · triage', 1, 'agent', { px: 26, align: 'left' });
      tag(g, 450, 360, 'Sonnet 5.5 · editor', 1, 'ink', { px: 26, align: 'left' });
      text(g, 'Hard limit: $15 / month, enforced by the workspace', 160, 445, { px: 26, weight: 600, color: '#9F1239' });
      g.save();
      g.globalAlpha *= p(this.at('a4c', 0.15));
      text(g, 'In the app: $14 / month, spread per day', 160, 520, { px: 28, weight: 600 });
      text(g, 'today’s cap = what’s left ÷ days left, at most $1', 160, 560, { px: 24, color: C.gray600 });
      g.restore();
      // today's cap, split
      const bar = { x: 160, y: 620, w: 800, h: 70 };
      const k = p(this.at('a4c', 0.35), 0.8);
      g.save();
      g.globalAlpha *= clamp(k * 2);
      roundRect(g, bar.x, bar.y, bar.w, bar.h, 16);
      g.fillStyle = C.gray200;
      g.fill();
      roundRect(g, bar.x, bar.y, bar.w * 0.8 * ease.outCubic(k), bar.h, [16, 0, 0, 16]);
      g.fillStyle = C.labelInk;
      g.fill();
      text(g, 'Sonnet ≤ 80% of the day', bar.x + 24, bar.y + 45, { px: 24, weight: 600, color: C.white });
      text(g, 'Haiku', bar.x + bar.w * 0.9, bar.y + 45, { px: 24, weight: 600, color: C.gray700, align: 'center' });
      text(g, '$0', bar.x, bar.y + bar.h + 34, { px: 22, color: C.gray500 });
      text(g, '≤ $1 a day', bar.x + bar.w, bar.y + bar.h + 34, { px: 22, color: C.gray500, align: 'right' });
      g.restore();
      g.save();
      g.globalAlpha *= p(this.at('a4c', 0.75));
      text(g, 'Unspent money rolls forward to later days.', 160, 850, { px: 24, color: C.gray600 });
      text(g, 'Until the morning edition runs, its share is held back.', 160, 890, { px: 24, color: C.gray600 });
      g.restore();
    });
    // xAI
    paper(g, 1060, 230, 750, 560, p(this.T('a4d')), () => {
      text(g, 'xAI · X search', 1110, 300, { px: 36, weight: 700 });
      tag(g, 1110, 360, 'x_search · grok-4.3', 1, 'owner', { px: 26, align: 'left' });
      text(g, 'Prepaid $15 · auto top-up off', 1110, 445, { px: 26, weight: 600, color: '#9F1239' });
      g.save();
      g.globalAlpha *= p(this.at('a4d', 0.5));
      stat(g, 1110, 590, 0.4, 'a day', 1, { px: 92, prefix: '$', decimals: 2 });
      stat(g, 1470, 590, 12, 'a month', 1, { px: 92, prefix: '$' });
      g.restore();
      g.save();
      g.globalAlpha *= p(this.at('a4d', 0.75));
      text(g, 'Weakest topic searched first.', 1110, 735, { px: 24, color: C.gray600 });
      g.restore();
    });
  }

  private ledger(lt: number) {
    const g = this.g;
    const cols = [{ x: 330, name: 'Pipeline' }, { x: 960, name: 'Ledger · Postgres' }, { x: 1590, name: 'Anthropic / xAI' }];
    const top = 260, bottom = 900;
    cols.forEach((c, i) => {
      const p = prog(lt, this.T('a4e') + i * 0.15, this.T('a4e') + 0.5 + i * 0.15);
      tag(g, c.x, top, c.name, p, i === 1 ? 'owner' : i === 2 ? 'ext' : 'agent', { px: 28 });
      g.save();
      g.globalAlpha *= p;
      g.setLineDash([6, 10]);
      g.strokeStyle = C.gray300;
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(c.x, top + 30); g.lineTo(c.x, bottom); g.stroke();
      g.setLineDash([]);
      g.restore();
    });
    const msgs: [number, number, number, string, string, boolean?][] = [
      [0, 1, 360, '1 · reserve the worst-case cost, under a lock', '#B4690E'],
      [1, 0, 450, '2 · over a cap? refused → fallback ranking', '#9F1239'],
      [0, 2, 540, '3 · otherwise, call', C.accent600],
      [2, 0, 630, '4 · response + token usage', '#8A93A8', true],
      [0, 1, 720, '5 · settle the actual cost', '#B4690E'],
    ];
    msgs.forEach(([a, b, y, label, color, dash], i) => {
      const from = cols[a]!.x, to = cols[b]!.x;
      const dir = Math.sign(to - from);
      edge(g, [[from + dir * 10, y], [to - dir * 10, y]], prog(lt, this.msgAt(i), this.msgAt(i) + 0.5), { color, width: 4, dash });
      const lp = prog(lt, this.msgAt(i) + 0.2, this.msgAt(i) + 0.6);
      g.save();
      g.globalAlpha *= lp;
      text(g, label, (from + to) / 2, y - 18, { px: 25, weight: 600, color: C.ink, align: 'center' });
      g.restore();
    });
    flushLabels();
    const lock = prog(lt, this.msgAt(0) + 0.4, this.msgAt(0) + 0.8, ease.outBack);
    tag(g, 960, 395, 'concurrent jobs can’t race a cap', lock, 'owner', { px: 20 });
    const cost = prog(lt, this.T('a4f') + 0.3, this.T('a4f') + 1.2);
    paper(g, 330, 800, 1260, 200, cost, () => {
      stat(g, 400, 900, 30, 'of AI per morning edition, about', 1, { px: 92, suffix: '¢' });
      g.save();
      g.globalAlpha *= prog(lt, this.T('a4f') + 1.5, this.T('a4f') + 2.0);
      text(g, 'Nov 3: $0.34 in 43 calls', 1020, 880, { px: 26, weight: 600, color: C.gray700 });
      text(g, 'Nov 6: $0.29 in 37 calls', 1020, 924, { px: 26, weight: 600, color: C.gray700 });
      g.restore();
    });
  }
}
