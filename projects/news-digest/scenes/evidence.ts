// The agent checks its own work: a wall of its committed Playwright screenshots (an atlas of 96 of the
// desktop ones, in the order git added them), then its Grafana dashboard for the agent itself (its own
// screenshot, Nov 6). The camera only moves over these; nothing is redrawn.
import { loadFootage, type Box, type Footage, type Shot } from '@engine/assets';
import { backdrop } from '@engine/draw';
import type { Cue, Frame } from '@engine/scene';
import { applyCam, camAt, type Cam } from '@engine/slide';
import { ease, prog } from '@engine/util';
import { AppView, cameraAt, cameraCues, insideWindow, type Camera } from '@engine/view';
import { camCues, footnote, heading, Narrated, tag } from '../kit';

const TILES: Box = { x: 0, y: 40, w: 1440, h: 420 }; // the dashboard's first two rows of stat tiles

export default class Evidence extends Narrated {
  protected ids = ['f11a', 'f12a'];
  protected lead = 0.6;
  protected hold = { f11a: 1.6, f12a: 1.8 };
  private footage!: Footage;
  private view!: AppView;
  private grafana!: Shot;

  protected async setup() {
    this.footage = await loadFootage('news-digest');
    this.view = new AppView(this.footage, 'news-digest.exe.xyz/grafana');
    this.grafana = this.footage.shots['grafana-agent']!;
  }

  private swap() { return [this.T('f12a') - 0.5, this.T('f12a') + 0.1] as const; }
  private wallCams(): [number, Cam, ((t: number) => number)?][] {
    return [[0, { x: 700, y: 420, zoom: 3.2 }], [0.8, { x: 700, y: 420, zoom: 3.2 }], [this.at('f11a', 0.6), { x: 960, y: 560, zoom: 1 }, ease.inOutQuart]];
  }
  private grafanaKeys(): [number, Camera, ((t: number) => number)?][] {
    const v = this.view;
    const aim = insideWindow(v, v.aim(TILES, 1.3));
    const [, s1] = this.swap();
    return [[0, v.wide], [s1 + 0.3, v.wide], [s1 + 1.3, aim, ease.inOutQuart], [this.duration(), aim]];
  }

  cues(): Cue[] {
    return [...camCues(this.wallCams()), { kind: 'pop', t: this.at('f11a', 0.65) }, { kind: 'swish', t: this.swap()[0], gain: 0.7 }, ...cameraCues(this.grafanaKeys()).filter((c) => c.t > this.swap()[1])];
  }

  render(f: Frame) {
    const g = this.g;
    const lt = f.lt;
    backdrop(g, f.t);
    const [s0, s1] = this.swap();
    const wallOut = prog(lt, s0, s1);
    if (wallOut < 1) {
      const wall = this.footage.extras.wall as { file: string; cols: number; rows: number; cellW: number; cellH: number; total: number };
      const image = this.footage.images[wall.file]!;
      const w = 1840, h = (w * image.height) / image.width;
      g.save();
      g.globalAlpha = 1 - wallOut;
      applyCam(g, camAt(lt, this.wallCams()));
      g.drawImage(image, 960 - w / 2, 560 - h / 2, w, h);
      g.restore();
      g.save();
      g.globalAlpha = 1 - wallOut;
      heading(g, 'It checks its own UI', 'Playwright screenshots, committed', prog(lt, this.at('f11a', 0.55), this.at('f11a', 0.75)), 60, 110, 56);
      tag(g, 1860, 70, `${wall.total.toLocaleString('en-US')} screenshots in the repo`, prog(lt, this.at('f11a', 0.65), this.at('f11a', 0.8)), 'ink', { px: 30, align: 'right' });
      g.restore();
    }
    if (wallOut > 0) {
      const v = this.view;
      v.camera = cameraAt(lt, this.grafanaKeys());
      g.save();
      g.globalAlpha = wallOut;
      v.draw(g, (page) => v.plate(page, this.grafana));
      g.restore();
      footnote(g, 'Grafana’s Agent supervisor dashboard, from the agent’s own screenshot, Nov 6', prog(lt, s1, s1 + 0.6));
    }
  }
}
