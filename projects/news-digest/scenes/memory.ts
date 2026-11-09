// The repo files as a chain of command (handbook: 02-agent/02-steering-and-memory.md): the owner's
// MISSION and STEERING, the shared AGENTS and NEEDS_FROM_HUMAN, the agent's TASKS, PROGRESS and archive.
// The supervisor reverts an agent edit to an owner file; in STEERING the agent may only ack and tidy.
import { backdrop, roundRect } from '@engine/draw';
import { C, withAlpha } from '@engine/palette';
import type { Cue, Frame } from '@engine/scene';
import { clamp, ease, prog } from '@engine/util';
import { edge, flushLabels, frame, heading, Narrated, node, paper, pops, tag, text } from '../kit';

export default class Memory extends Narrated {
  protected ids = ['f5b', 'f5d', 'f5e'];
  protected lead = 0.7;
  protected hold = { f5d: 1.0, f5e: 2.2 };

  private times() {
    const b = this.T('f5b'), lb = this.E('f5b') - b, d = this.T('f5d'), ld = this.E('f5d') - d, e = this.T('f5e');
    return { owner: b + 0.2, mission: b + lb * 0.3, steering: b + lb * 0.55, shared: b + lb * 0.85, agent: d + 0.1, tasks: d + 0.3, progress: d + 0.8, archive: d + 1.3, edit: d + ld * 0.55, revert: d + ld * 0.75, detail: e + 0.2 };
  }

  cues(): Cue[] {
    const t = this.times();
    return [...pops([t.mission, t.steering, t.shared, t.tasks, t.progress, t.archive]), { kind: 'key', t: t.edit }, { kind: 'key', t: t.edit + 0.15 }, { kind: 'drop', t: t.revert, gain: 1.1 }, { kind: 'swish', t: t.detail }, { kind: 'pop', t: t.detail + 1.6 }];
  }

  render(f: Frame) {
    const g = this.g;
    const lt = f.lt;
    const t = this.times();
    const p = (at: number, d = 0.6) => prog(lt, at, at + d);
    backdrop(g, f.t);
    heading(g, 'Memory and steering', 'A chain of command, in files', p(0.1, 0.9), 110, 135, 66);

    const detail = prog(lt, t.detail, t.detail + 0.6, ease.inOutCubic);
    g.save();
    g.globalAlpha = 1 - 0.75 * detail;
    frame(g, 110, 250, 470, 470, 'Owner writes', p(t.owner), 'owner');
    frame(g, 1340, 250, 470, 640, 'Agent writes', p(t.agent), 'agent');
    frame(g, 725, 630, 470, 380, 'Both read', p(t.shared), 'infra');

    edge(g, [[345, 422], [345, 500]], p(t.steering), { color: '#E59E2D' });
    edge(g, [[580, 560], [960, 560], [960, 360], [1340 + 30, 360]], p(t.tasks, 0.9), { color: '#E59E2D', label: 'sets the order', labelAt: 0.3, labelTone: 'owner' });
    edge(g, [[1575, 422], [1575, 500]], p(t.progress), { color: C.accent500 });
    edge(g, [[1575, 622], [1575, 690]], p(t.archive), { color: C.accent500 });
    flushLabels();

    node(g, 150, 300, 390, 122, 'MISSION.md', p(t.mission), { sub: 'product vision and hard rules', tone: 'owner', px: 30 });
    node(g, 150, 500, 390, 122, 'STEERING.md', p(t.steering), { sub: 'current priorities · overrides it', tone: 'owner', px: 30 });
    node(g, 765, 680, 390, 122, 'AGENTS.md', p(t.shared), { sub: 'how to work, loaded every run', px: 30 });
    node(g, 765, 850, 390, 122, 'NEEDS_FROM_HUMAN.md', p(t.shared + 0.3), { sub: 'the agent’s blockers', px: 28 });
    node(g, 1380, 300, 390, 122, 'TASKS.md', p(t.tasks), { sub: 'open work · under 8 KB', tone: 'agent', px: 30 });
    node(g, 1380, 500, 390, 122, 'PROGRESS.md', p(t.progress), { sub: 'the log · under 25 KB', tone: 'agent', px: 30 });
    node(g, 1380, 690, 390, 122, 'progress-archive/', p(t.archive), { sub: 'older entries', tone: 'agent', px: 30 });

    // the agent edits the mission; the supervisor puts it back
    const editIn = prog(lt, t.edit, t.edit + 0.3), editOut = prog(lt, t.revert, t.revert + 0.35);
    if (editIn > 0 && editOut < 1) {
      g.save();
      g.globalAlpha *= editIn * (1 - editOut);
      roundRect(g, 170, 392, 350 * editIn, 22, 6);
      g.fillStyle = withAlpha('#E5485F', 0.25);
      g.fill();
      text(g, '+ edit by the agent', 180, 409, { px: 18, family: 'mono', color: '#9F1239' });
      g.restore();
    }
    const stamp = prog(lt, t.revert, t.revert + 0.4, ease.outBack) * (1 - prog(lt, this.T('f5e') - 0.2, this.T('f5e') + 0.3));
    if (stamp > 0) {
      g.save();
      g.translate(470, 300);
      g.rotate(-0.08);
      tag(g, 0, 0, '↺ reverted by the supervisor', stamp, 'bad', { px: 24 });
      g.restore();
    }
    g.restore();

    // the steering file up close: one ranked list, acks only
    paper(g, 520, 250, 880, 690, detail, () => {
      text(g, 'STEERING.md', 570, 320, { px: 36, weight: 700, family: 'mono' });
      text(g, 'Current order', 570, 385, { px: 30, weight: 700, color: C.gray700 });
      const items = ['Breakages, and protecting the morning edition', 'Public access and reader accounts', 'X search and Bluesky acceptance', 'The Nov 6 edition review', 'Then the list of meaningful work'];
      items.forEach((s, i) => text(g, `${i + 1}.  ${s}`, 590, 440 + i * 50, { px: 26, color: C.ink }));
      const ack = prog(lt, t.detail + 1.6, t.detail + 2.2, ease.outCubic);
      g.save();
      g.globalAlpha *= ack;
      roundRect(g, 570, 712, 780 * clamp(ack * 1.2), 54, 12);
      g.fillStyle = withAlpha(C.accent500, 0.14);
      g.fill();
      text(g, 'ack: 2026-11-03 item 7 — iteration 425 observed…', 590, 748, { px: 23, family: 'mono', color: C.accent800 });
      g.restore();
      tag(g, 570, 840, 'agent may: append acks, drop finished lines', prog(lt, t.detail + 2.6, t.detail + 3.1), 'agent', { px: 24, align: 'left' });
      tag(g, 570, 895, 'never: reorder, add or reword', prog(lt, t.detail + 3.2, t.detail + 3.7), 'bad', { px: 24, align: 'left' });
    });
  }
}
