// The real thing on the public GitHub repo, filmed by capture.ts: STEERING.md's ranked list, an ack
// the agent wrote under an item, then the commit list (a new commit every few minutes, some from the
// agent, some from lead sessions, marked "and claude").
import { loadFootage, type Shot } from '@engine/assets';
import { beat } from '@engine/beats';
import { backdrop, highlight, label } from '@engine/draw';
import type { Cue, Frame } from '@engine/scene';
import { ease, prog } from '@engine/util';
import { AppView, cameraAt, cameraCues, insideWindow, type Camera } from '@engine/view';
import { Narrated } from '../kit';

const COMMITS_SCROLL = 1250;

export default class GitHub extends Narrated {
  protected ids = ['f7a', 'f7b', 'f7c'];
  protected lead = 0.8;
  protected hold = { f7a: 0.6, f7b: 1.0, f7c: 1.6 };
  private view!: AppView;
  private order!: Shot;
  private ack!: Shot;
  private commits!: Shot;

  protected async setup() {
    const footage = await loadFootage('news-digest');
    this.view = new AppView(footage, 'github.com/EmmadUsmani/news-digest');
    this.order = footage.shots['gh-order']!;
    this.ack = footage.shots['gh-ack']!;
    this.commits = footage.shots['gh-commits']!;
  }

  private aim(shot: Shot, key: string, zoom: number, scroll = shot.scrollY, dy = 0): Camera {
    const v = this.view, before = v.scrollY;
    v.scrollY = scroll;
    const cam = insideWindow(v, v.aim(shot.boxes[key]!, zoom, 0, dy));
    v.scrollY = before;
    return cam;
  }

  private cuts() { return { ack: this.T('f7b') - 0.3, commits: this.T('f7c') - 0.3 }; }
  private scroll() { return [this.at('f7c', 0.3), this.E('f7c') - 0.2] as const; }

  private keys(): [number, Camera, ((t: number) => number)?, number?][] {
    const v = this.view, c = this.cuts();
    return [
      [0, v.wide],
      [0.5, v.wide],
      [1.4, this.aim(this.order, 'list', 1.35), ease.inOutQuart],
      [c.ack - 0.5, this.aim(this.order, 'list', 1.35)],
      [c.ack + 0.2, v.wide, ease.inOutQuart],
      [c.ack + 0.5, v.wide],
      [c.ack + 1.3, this.aim(this.ack, 'ack', 1.45, this.ack.scrollY, 40), ease.inOutQuart],
      [c.commits - 0.5, this.aim(this.ack, 'ack', 1.45, this.ack.scrollY, 40)],
      [c.commits + 0.2, v.wide, ease.inOutQuart],
      [this.duration(), v.wide],
    ];
  }

  cues(): Cue[] {
    const [s0, s1] = this.scroll();
    const c = this.cuts();
    return [
      ...cameraCues(this.keys()),
      ...Array.from({ length: 14 }, (_, i): Cue => ({ kind: 'wheel', t: s0 + ((s1 - s0) * (i + 0.5)) / 14, gain: 0.55 })),
      { kind: 'pop', t: 1.7 }, { kind: 'pop', t: c.ack + 1.6 }, { kind: 'pop', t: c.commits + 0.6 },
    ];
  }

  render(f: Frame) {
    const { g, view } = this;
    const lt = f.lt;
    const c = this.cuts();
    backdrop(g, f.t);
    view.camera = cameraAt(lt, this.keys());
    const toAck = prog(lt, c.ack - 0.1, c.ack + 0.4);
    const toCommits = prog(lt, c.commits - 0.1, c.commits + 0.4);
    const [s0, s1] = this.scroll();
    const layer = (shot: Shot, alpha: number, url: string, scroll = shot.scrollY) => {
      if (alpha <= 0) return;
      view.scrollY = scroll;
      view.url = url;
      g.save();
      g.globalAlpha = alpha;
      view.draw(g, (page) => view.plate(page, shot));
      g.restore();
    };
    const steeringUrl = 'github.com/EmmadUsmani/news-digest/blob/main/STEERING.md';
    layer(this.order, 1, steeringUrl);
    layer(this.ack, toAck, steeringUrl);
    layer(this.commits, toCommits, 'github.com/EmmadUsmani/news-digest/commits/main', COMMITS_SCROLL * prog(lt, s0, s1, ease.inOutCubic));

    // callouts on the real elements
    view.scrollY = this.order.scrollY;
    const list = view.screenBox(this.order.boxes.list!);
    const onList = beat(lt, 1.6, c.ack - 0.5);
    highlight(g, list, onList, 14);
    label(g, list, 'Current order', onList, 'below', 'one ranked list; only the owner reorders it', 'start');
    view.scrollY = this.ack.scrollY;
    const ack = view.screenBox(this.ack.boxes.ack!);
    const onAck = beat(lt, c.ack + 1.5, c.commits - 0.5);
    highlight(g, ack, onAck, 12);
    label(g, ack, 'The agent’s ack', onAck, 'above', 'dated, with its iteration number', 'start');
    view.scrollY = 0;
    const group = view.screenBox(this.commits.boxes.group!);
    const onGroup = beat(lt, c.commits + 0.5, s0 - 0.1);
    label(g, group, 'Minutes apart, all day and all night', onGroup, 'below', 'commits on main, Nov 9', 'start');
  }
}
