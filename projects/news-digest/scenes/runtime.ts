// Where the product runs (handbook: 01-app/01-stack-and-runtime.md): the exe.dev proxy, the API and
// worker processes, Postgres and Redis in Docker on loopback, the small systemd units, and every
// outside call through a port.
import { backdrop } from '@engine/draw';
import { C } from '@engine/palette';
import type { Cue, Frame } from '@engine/scene';
import { prog } from '@engine/util';
import { edge, flushLabels, frame, heading, Narrated, node, pops, tag } from '../kit';

const EXT: [string, string][] = [
  ['Feeds + Hacker News', 'RSS · HN API'],
  ['Anthropic', 'Haiku 5.5 · Sonnet 5.5'],
  ['xAI', 'x_search · grok-4.3'],
  ['X oEmbed', 'verifies every post'],
  ['Bluesky', 'post search'],
];

export default class Runtime extends Narrated {
  protected ids = ['a1b', 'a1c', 'a1d'];
  protected hold = { a1d: 1.4 };

  private times() {
    const b = this.T('a1b'), lb = this.E('a1b') - b, c = this.T('a1c'), lc = this.E('a1c') - c, d = this.T('a1d');
    return { badges: b + 0.6, vm: b + 0.2, proxy: b + lb * 0.3, api: b + lb * 0.4, worker: b + lb * 0.75, docker: c + 0.2, pg: c + 0.5, redis: c + lc * 0.3, units: c + lc * 0.65, bus: d + 0.4, ext: d + 0.8 };
  }

  cues(): Cue[] {
    const t = this.times();
    return [...pops([t.proxy, t.api, t.worker, t.pg, t.redis, t.units]), ...pops(EXT.map((_, i) => t.ext + i * 0.35), 0.7)];
  }

  render(f: Frame) {
    const g = this.g;
    const lt = f.lt;
    const t = this.times();
    const p = (at: number, d = 0.6) => prog(lt, at, at + d);
    backdrop(g, f.t);
    heading(g, 'Under the hood', 'One VM, two processes', p(0.1, 0.9), 110, 135, 64);
    let bx = 1040;
    for (const s of ['TypeScript', 'Node 22', 'pnpm monorepo']) bx += tag(g, bx, 120, s, p(t.badges + (bx - 1040) / 1200), 'agent', { px: 26, align: 'left' }) + 14;

    frame(g, 330, 220, 1050, 760, 'VM · systemd user units', p(t.vm, 0.8));
    frame(g, 370, 580, 970, 230, 'Docker · loopback only', p(t.docker, 0.7), 'infra');
    const gray = '#8A93A8', flow = lt;
    edge(g, [[300, 345], [400, 345]], p(t.api), { color: gray, flow, label: 'HTTPS' });
    edge(g, [[600, 420], [600, 640]], p(t.pg), { color: gray, flow, label: 'Drizzle', labelAt: 0.4 });
    edge(g, [[960, 420], [960, 520], [700, 520], [700, 640]], p(t.pg + 0.3), { color: gray, flow });
    edge(g, [[1150, 420], [1150, 640]], p(t.redis), { color: gray, flow, label: 'BullMQ', labelAt: 0.4 });
    edge(g, [[1310, 345], [1440, 345]], p(t.bus), { color: C.accent500, flow, head: false });
    edge(g, [[1440, 270], [1440, 810]], p(t.bus), { color: C.accent500, head: false });
    EXT.forEach((_, i) => edge(g, [[1440, 270 + i * 135], [1490, 270 + i * 135]], p(t.ext + i * 0.35), { color: C.accent500 }));
    flushLabels();
    tag(g, 1640, 935, 'every outside call goes through a port', p(t.ext + 1.8), 'ink', { px: 24 });

    node(g, 60, 285, 240, 120, 'exe.dev proxy', p(t.proxy), { sub: 'HTTPS + login', px: 28 });
    node(g, 400, 270, 420, 150, 'news-digest-api', p(t.api), { sub: 'NestJS API + React app · :8000', tone: 'agent', px: 32 });
    node(g, 890, 270, 420, 150, 'news-digest-worker', p(t.worker), { sub: 'BullMQ jobs + timers', tone: 'agent', px: 32 });
    node(g, 410, 640, 420, 130, 'Postgres 17', p(t.pg), { sub: 'editions, articles, the spend ledger', px: 32 });
    node(g, 890, 640, 420, 130, 'Redis 7', p(t.redis), { sub: 'queues and job state', px: 32 });
    let ux = 380;
    for (const s of ['docs', 'schema explorer', 'agent supervisor', 'observability']) ux += tag(g, ux, 900, s, p(t.units + (ux - 380) / 1500), 'infra', { px: 24, align: 'left' }) + 14;
    EXT.forEach(([title, sub], i) => node(g, 1490, 215 + i * 135, 380, 110, title, p(t.ext + i * 0.35), { sub, tone: 'ext', px: 28 }));
  }
}
