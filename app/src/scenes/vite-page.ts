// Vite's homepage from one full-page plate: a push into the hero's install command, then back out
// and a scroll down to the features. The page isn't sticky anywhere, so scrolling the plate is
// exactly how the real page scrolls.
import { loadFootage, type Shot } from '../engine/assets';
import { beat, grow, union } from '../engine/beats';
import { backdrop, highlight, label } from '../engine/draw';
import { Scene, type Cue, type Frame, type Line } from '../engine/scene';
import { ease, keys } from '../engine/util';
import { AppView, cameraAt, cameraCues, insideWindow, type Camera } from '../engine/view';

const DUR = 10.0;
const PUSH = [0.5, 1.6] as const; // wide → the hero
const PULL = [4.2, 5.2] as const; // back out
const SCROLL = [4.6, 6.6] as const; // down to the features
const SCROLL_TO = 1000;
const LABEL_HERO = [1.8, 4.0] as const;
const LABEL_FEATURES = [6.9, 9.4] as const;

export default class VitePage extends Scene {
  private view!: AppView;
  private shot!: Shot;

  async init() {
    const footage = await loadFootage('vite');
    this.view = new AppView(footage, 'vite.dev');
    this.shot = footage.shots.page!;
  }

  duration() { return DUR; }

  private scrollAt(lt: number) { return keys(lt, [[SCROLL[0], 0], [SCROLL[1], SCROLL_TO, ease.inOutCubic]]); }

  private cameraKeys(): [number, Camera, ((t: number) => number)?][] {
    const { view, shot } = this;
    view.scrollY = 0;
    const hero = insideWindow(view, view.aim(union(shot.boxes.headline!, shot.boxes.install!), 1.55, 60, 0));
    return [[0, view.wide], [PUSH[0], view.wide], [PUSH[1], hero, ease.inOutQuart], [PULL[0], hero], [PULL[1], view.wide, ease.inOutQuart]];
  }

  narration(): Line[] {
    return [
      { id: 'hero', at: 0.4, until: PULL[0] + 0.2, text: 'Vite’s homepage starts with the one command that makes a project.' },
      { id: 'features', at: SCROLL[1] - 0.6, until: DUR - 0.2, text: 'Further down: an instant dev server, and updates as you save.' },
    ];
  }

  cues(): Cue[] {
    // a wheel notch for every 100 px the page scrolls
    const notches: Cue[] = [];
    let last = 0;
    for (let t = SCROLL[0]; t <= SCROLL[1]; t += 1 / 60) {
      const y = this.scrollAt(t);
      if (y - last >= 100) { notches.push({ kind: 'wheel', t }); last = y; }
    }
    return [...cameraCues(this.cameraKeys()), ...notches, { kind: 'pop', t: LABEL_HERO[0] }, { kind: 'pop', t: LABEL_FEATURES[0] }];
  }

  render(f: Frame) {
    const { g, view, shot } = this;
    backdrop(g, f.t);
    view.scrollY = 0;
    view.camera = cameraAt(f.lt, this.cameraKeys());
    view.scrollY = this.scrollAt(f.lt);
    view.draw(g, (page) => view.plate(page, shot));

    const install = view.screenBox(grow(shot.boxes.install!, [18, 14]));
    const onHero = beat(f.lt, ...LABEL_HERO);
    highlight(g, install, onHero, 12);
    label(g, install, 'One command to start', onHero, 'right', 'npm, Yarn, pnpm, Bun or Deno');

    const title = view.screenBox(shot.boxes.devx!);
    const onFeatures = beat(f.lt, ...LABEL_FEATURES);
    highlight(g, grow(title, [12, 4]), onFeatures, 16);
    label(g, title, 'What it’s built for', onFeatures, 'right', 'Server start, HMR, builds');
  }
}
