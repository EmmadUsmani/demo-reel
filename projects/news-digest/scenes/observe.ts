// Observability on the same VM (handbook: 01-app/09-observability.md): JSON logs via Fluent Bit to
// VictoriaLogs, metrics to VictoriaMetrics, vmalert, and Grafana's ten dashboards; then three of the
// agent's own screenshots of those UIs, as polaroids.
import { backdrop, polaroid } from '@engine/draw';
import { loadCard, type Card } from '../../../app/src/scenes/cards';
import type { Cue, Frame } from '@engine/scene';
import { clamp, ease, lerp, prog } from '@engine/util';
import { C } from '@engine/palette';
import { edge, footnote, heading, Narrated, node, pops } from '../kit';

export default class Observe extends Narrated {
  protected ids = ['a6a'];
  protected lead = 0.6;
  protected hold = { a6a: 3.6 };
  private cards: Card[] = [];

  protected async setup() {
    this.cards = await Promise.all(['grafana-product', 'grafana-jobs', 'logs'].map((shot) => loadCard({ footage: 'news-digest', shot, key: 'screen', pad: 0 })));
  }

  private at0(k: number) { return this.at('a6a', k); }
  cues(): Cue[] {
    return [...pops([0.2, 0.35, 0.5, 0.65, 0.8].map((k) => this.at0(k))), ...this.cards.map((_, i): Cue => ({ kind: 'swish', t: this.E('a6a') - 2.8 + i * 0.35, pan: 0.4 }))];
  }

  render(f: Frame) {
    const g = this.g;
    const lt = f.lt;
    backdrop(g, f.ambient);
    heading(g, 'Observability', 'Self-hosted, on the same VM', prog(lt, 0.1, 0.9), 110, 140, 64);
    const p = (k: number) => prog(lt, this.at0(k), this.at0(k) + 0.5);
    const out = prog(lt, this.E('a6a') - 3.0, this.E('a6a') - 2.4);
    g.save();
    g.globalAlpha = 1 - 0.7 * out;
    const flow = f.ambient - (f.t - f.lt), gray = '#8A93A8';
    node(g, 110, 400, 330, 130, 'API · worker · agent', p(0.15), { sub: 'JSON logs and metrics', px: 28 });
    node(g, 110, 640, 330, 130, 'Host · Postgres · Redis', p(0.15), { sub: 'exporters', px: 28 });
    node(g, 560, 400, 330, 130, 'Fluent Bit → VictoriaLogs', p(0.3), { sub: '14 days · 2 GB', tone: 'agent', px: 26 });
    node(g, 560, 640, 330, 130, 'VictoriaMetrics', p(0.45), { sub: '30 days · 700 MB', tone: 'agent', px: 28 });
    node(g, 1010, 760, 300, 110, 'vmalert', p(0.6), { sub: 'every 30 s', tone: 'bad', px: 28 });
    node(g, 1010, 450, 300, 150, 'Grafana', p(0.7), { sub: '10 dashboards', tone: 'ok', px: 36 });
    edge(g, [[440, 465], [560, 465]], p(0.3), { color: gray, flow });
    edge(g, [[440, 705], [560, 705]], p(0.45), { color: gray, flow });
    edge(g, [[275, 530], [275, 580], [600, 580], [600, 640]], p(0.45), { color: gray, flow, head: true });
    edge(g, [[890, 465], [1010, 500]], p(0.7), { color: C.accent500, flow });
    edge(g, [[890, 705], [950, 705], [950, 560], [1010, 560]], p(0.7), { color: C.accent500, flow });
    edge(g, [[890, 740], [950, 740], [950, 815], [1010, 815]], p(0.6), { color: '#E5485F', flow });
    g.restore();
    // the dashboards themselves
    this.cards.forEach((card, i) => {
      const k = prog(lt, this.E('a6a') - 2.8 + i * 0.35, this.E('a6a') - 1.8 + i * 0.35, ease.spring);
      if (k <= 0) return;
      g.save();
      g.globalAlpha = clamp(k * 2);
      polaroid(g, card.image, card.crop, lerp(2300, 1500 + (i - 1) * 60, k), 330 + i * 230 + 40 * (1 - k), 640, (i - 1) * 0.05);
      g.restore();
    });
    footnote(g, 'Dashboards: the agent’s own screenshots, Nov 3–4', prog(lt, this.E('a6a') - 2.2, this.E('a6a') - 1.6));
  }
}
