// The factory at a glance (handbook: 02-agent/README.md): a systemd unit, the supervisor loop, a
// fresh `codex exec` per pass, the working copy and the live app on one VM; GitHub and the humans
// outside; model calls through the exe.dev gateway onto the ChatGPT plan. The closed loop lights up.
import { backdrop } from '@engine/draw';
import { C } from '@engine/palette';
import type { Cue, Frame } from '@engine/scene';
import { applyCam, camAt, type Cam } from '@engine/slide';
import { ease, prog } from '@engine/util';
import { camCues, edge, flushLabels, frame, heading, Narrated, node, pops, tag } from '../kit';

const N = {
  systemd: [125, 255, 310, 104],
  sup: [125, 425, 310, 132],
  status: [125, 700, 310, 120],
  codex: [575, 410, 320, 156],
  repo: [1075, 255, 330, 132],
  app: [1075, 600, 330, 160],
  github: [1565, 255, 310, 132],
  humans: [1565, 600, 310, 160],
  gateway: [540, 930, 400, 110],
} as const;

export default class Overview extends Narrated {
  protected ids = ['f1a', 'f1c', 'f1d', 'f1e', 'f1f', 'f1g'];
  protected hold = { f1f: 0.8, f1g: 0.6 };

  private cams(): [number, Cam, ((t: number) => number)?][] {
    const at = (x: number, y: number, zoom: number): Cam => ({ x, y, zoom });
    return [
      [0, at(960, 560, 1)],
      [this.T('f1c') - 0.2, at(960, 560, 1)],
      [this.T('f1c') + 0.8, at(520, 520, 1.4), ease.inOutQuart],
      [this.T('f1d') - 0.1, at(520, 520, 1.4)],
      [this.T('f1d') + 0.8, at(1000, 520, 1.38), ease.inOutQuart],
      [this.T('f1e') - 0.1, at(1000, 520, 1.38)],
      [this.T('f1e') + 0.8, at(760, 790, 1.4), ease.inOutQuart],
      [this.T('f1f') - 0.1, at(760, 790, 1.4)],
      [this.T('f1f') + 0.9, at(900, 560, 1.12), ease.inOutQuart],
      [this.T('f1g') - 0.1, at(900, 560, 1.12)],
      [this.T('f1g') + 0.8, at(1440, 500, 1.4), ease.inOutQuart],
      [this.E('f1g') - 0.3, at(1440, 500, 1.4)],
      [this.duration(), at(960, 540, 1), ease.inOutQuart],
    ];
  }

  private times() {
    const a = this.T('f1a'), c = this.T('f1c'), d = this.T('f1d'), e = this.T('f1e'), f = this.T('f1f'), gg = this.T('f1g');
    return {
      vm: a + 0.1, app: a + 0.9, codex: a + 1.7,
      systemd: c + 0.6, e1: c + 1.2, sup: c + 1.0, e2: c + 2.4, status: c + 3.6, e5: c + 3.9,
      repo: d + 0.5, e3: d + 1.2, e4: d + 2.6,
      gateway: e + 0.7, e8: e + 1.2,
      loop: f + 0.6,
      github: gg + 0.4, e6: gg + 0.9, humans: gg + 1.8, e7: gg + 2.3,
    };
  }

  cues(): Cue[] {
    const t = this.times();
    return [...camCues(this.cams()), ...pops([t.app, t.codex, t.sup, t.status, t.repo, t.gateway, t.github, t.humans]), { kind: 'land', t: t.loop + 0.6, gain: 0.6 }];
  }

  render(f: Frame) {
    const g = this.g;
    const lt = f.lt;
    const t = this.times();
    const p = (at: number, d = 0.7) => prog(lt, at, at + d);
    backdrop(g, f.t);
    heading(g, 'The agent factory', 'One VM, one loop', p(0.1, 0.9) * (1 - prog(lt, this.T('f1c') - 0.2, this.T('f1c') + 0.3)), 120, 128, 64);
    g.save();
    applyCam(g, camAt(lt, this.cams()));
    frame(g, 90, 200, 1340, 690, 'exe.dev VM · news-digest.exe.xyz', p(t.vm, 0.8));

    const flow = lt;
    const loopOn = prog(lt, t.loop, t.loop + 0.8);
    const blue = C.accent500, gray = '#8A93A8';
    const loopColor = (on: number) => (on > 0.5 ? C.accent600 : gray);
    edge(g, [[280, 359], [280, 425]], p(t.e1), { color: gray, flow });
    edge(g, [[435, 490], [575, 490]], p(t.e2), { color: blue, flow, label: 'prompt', labelAt: 0.5 });
    edge(g, [[280, 557], [280, 700]], p(t.e5), { color: gray, flow, label: 'classify · health · usage' });
    edge(g, [[895, 450], [985, 450], [985, 321], [1075, 321]], p(t.e3), { color: loopColor(loopOn), width: 3 + loopOn * 2, flow, label: 'commit', labelAt: 0.5 });
    edge(g, [[895, 530], [985, 530], [985, 690], [1075, 690]], p(t.e4), { color: loopColor(loopOn), width: 3 + loopOn * 2, flow, label: 'restart', labelAt: 0.5 });
    edge(g, [[1075, 740], [660, 740], [660, 566]], p(t.loop, 1.0), { color: C.accent600, width: 5, flow, label: 'observe · next task', labelAt: 0.22, labelTone: 'agent' });
    edge(g, [[740, 566], [740, 930]], p(t.e8), { color: '#2BA58B', dash: true, flow, label: 'model calls', labelAt: 0.72, labelTone: 'ext' });
    edge(g, [[1405, 321], [1565, 321]], p(t.e6), { color: gray, both: true, flow, label: 'push · pull' });
    edge(g, [[1720, 600], [1720, 387]], p(t.e7), { color: '#E59E2D', flow, label: 'STEERING.md', labelTone: 'owner' });

    const n = (k: keyof typeof N, title: string, at: number, o: Parameters<typeof node>[7] = {}) => {
      const [x, y, w, h] = N[k];
      node(g, x, y, w, h, title, p(at), o);
    };
    n('systemd', 'systemd unit', t.systemd, { sub: 'news-digest-agent.service' });
    n('sup', 'Supervisor', t.sup, { sub: 'run.sh + control.py', glow: prog(lt, this.T('f1c'), this.T('f1c') + 0.5) * (1 - prog(lt, this.T('f1d'), this.T('f1d') + 0.5)) });
    n('status', 'status/ + logs/', t.status, { sub: 'heartbeat · usage · summaries', tone: 'muted' });
    n('codex', 'codex exec', t.codex, { sub: 'a fresh session each pass', tone: 'agent', px: 34, glow: loopOn });
    n('repo', 'Working copy', t.repo, { sub: '~/news-digest on main' });
    n('app', 'Live app', t.app, { sub: 'API · worker · Postgres · Redis', tone: 'ok' });
    n('github', 'GitHub · main', t.github, { sub: 'the code, and STEERING.md' });
    n('humans', 'Owner + lead sessions', t.humans, { sub: 'the only way in: the repo', tone: 'owner' });
    n('gateway', 'exe.dev LLM gateway', t.gateway, { sub: '→ the $100/month ChatGPT plan', tone: 'ext' });
    flushLabels();
    tag(g, 1240, 830, 'Build · ship · observe · repeat', prog(lt, t.loop + 0.8, t.loop + 1.3), 'ink', { px: 26 });
    g.restore();
  }
}
