// The product in thirty seconds: the reader (brief, a story, the posts), then the admin overview.
// Both plates are the build agent's own Playwright screenshots of production (Nov 6 edition), so the
// camera moves over them; the regions it aims at were read off the plates (there is no DOM to measure).
import { loadFootage, type Box, type Shot } from '@engine/assets';
import { backdrop } from '@engine/draw';
import type { Cue, Frame } from '@engine/scene';
import { ease, prog } from '@engine/util';
import { AppView, cameraAt, cameraCues, insideWindow, type Camera } from '@engine/view';
import { footnote, Narrated } from '../kit';

// regions on the plates, CSS px (read off the screenshots)
const BRIEF: Box = { x: 495, y: 95, w: 690, h: 260 };
const STORY: Box = { x: 500, y: 372, w: 680, h: 228 };
const POST: Box = { x: 500, y: 1500, w: 670, h: 430 };
const KPIS: Box = { x: 245, y: 145, w: 1170, h: 135 };
const EDITION: Box = { x: 245, y: 300, w: 1170, h: 300 };
const POSTS_SCROLL = 1380;

export default class Product extends Narrated {
  protected ids = ['p1', 'p3', 'p4'];
  protected lead = 1.0;
  protected hold = { p1: 1.4, p3: 1.0 };
  private view!: AppView;
  private reader!: Shot;
  private admin!: Shot;

  protected async setup() {
    const footage = await loadFootage('news-digest');
    this.view = new AppView(footage, 'news-digest.exe.xyz');
    this.reader = footage.shots.reader!;
    this.admin = footage.shots['admin-overview']!;
  }

  private aim(box: Box, zoom: number, scroll = 0): Camera {
    const v = this.view, before = v.scrollY;
    v.scrollY = scroll;
    const cam = insideWindow(v, v.aim(box, zoom));
    v.scrollY = before;
    return cam;
  }

  private get scroll() { return [this.at('p1', 0.62), this.at('p1', 0.8)] as const; }
  private get swap() { return [this.T('p3') - 0.6, this.T('p3') + 0.2] as const; }

  private keys(): [number, Camera, ((t: number) => number)?, number?][] {
    const v = this.view;
    const [s0, s1] = this.scroll;
    return [
      [0, v.wide],
      [this.lead - 0.2, v.wide],
      [this.at('p1', 0.12), this.aim(BRIEF, 1.55), ease.inOutQuart],
      [this.at('p1', 0.36), this.aim(BRIEF, 1.55)],
      [this.at('p1', 0.5), this.aim(STORY, 1.6), ease.inOutQuart, 0.12],
      [s0, this.aim(STORY, 1.6)],
      [s1, this.aim(POST, 1.3, POSTS_SCROLL), ease.inOutQuart],
      [this.E('p1') - 1.0, this.aim(POST, 1.3, POSTS_SCROLL)],
      [this.swap[0], v.wide, ease.inOutQuart],
      [this.swap[1] + 0.3, v.wide],
      [this.at('p3', 0.25), this.aim(KPIS, 1.45), ease.inOutQuart],
      [this.at('p3', 0.6), this.aim(KPIS, 1.45)],
      [this.at('p3', 0.85), this.aim(EDITION, 1.35), ease.inOutQuart, 0.1],
      [this.T('p4'), this.aim(EDITION, 1.35)],
      [this.T('p4') + 1.0, v.wide, ease.inOutQuart],
      [this.duration(), v.wide],
    ];
  }

  cues(): Cue[] {
    const [s0, s1] = this.scroll;
    const wheel = Array.from({ length: 8 }, (_, i): Cue => ({ kind: 'wheel', t: s0 + ((s1 - s0) * (i + 0.5)) / 8, gain: 0.6 }));
    return [...cameraCues(this.keys()), ...wheel, { kind: 'swish', t: this.swap[0] + 0.1, gain: 0.7 }];
  }

  render(f: Frame) {
    const { g, view } = this;
    const lt = f.lt;
    backdrop(g, f.ambient);
    view.camera = cameraAt(lt, this.keys());
    const [s0, s1] = this.scroll;
    const swap = prog(lt, this.swap[0] + 0.5, this.swap[1] + 0.5, ease.inOutCubic);
    const scroll = POSTS_SCROLL * prog(lt, s0, s1, ease.inOutCubic) * (1 - prog(lt, this.swap[0], this.swap[0] + 0.5));
    view.scrollY = scroll;
    view.url = 'news-digest.exe.xyz';
    if (swap < 1) view.draw(g, (page) => view.plate(page, this.reader));
    if (swap > 0) {
      view.scrollY = 0;
      view.url = 'news-digest.exe.xyz/admin';
      g.save();
      g.globalAlpha = swap;
      view.draw(g, (page) => view.plate(page, this.admin));
      g.restore();
    }
    footnote(g, 'Production screens from the agent’s own Playwright checks, Nov 6', prog(lt, 1, 1.6));
  }
}
