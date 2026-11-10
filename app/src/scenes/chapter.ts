// A chapter card between sections: the title in the display face, a line of what the
// section shows, and a polaroid of the section's own first frame, taped on.
//   params: { title, subtitle, notes?, still: { footage, clip, frame } }
//   notes: what a presenter says on this slide (deck speaker notes)
import { loadFootage } from '../engine/assets';
import { ClipPlayer } from '../engine/clip';
import { backdrop, roundRect } from '../engine/draw';
import { C, font, shadow } from '../engine/palette';
import { H, Scene, W, type Cue, type Frame, type Note } from '../engine/scene';
import { clamp, ease, lerp, prog } from '../engine/util';

const DUR = 2.6;

export default class Chapter extends Scene {
  private player?: ClipPlayer;

  async init() {
    const still = this.ctx.params.still;
    if (still) {
      this.player = new ClipPlayer(await loadFootage(still.footage), still.clip);
      this.player.hold(DUR, still.frame ?? 0);
    }
  }

  duration() { return DUR; }
  stops() { return [DUR - 0.45 - 1 / 60]; }
  /** The card is one slide: its note goes on that slide. */
  notes(): Note[] { return this.ctx.params.notes ? [{ at: 0, text: this.ctx.params.notes }] : []; }
  async prepare(f: Frame) { await this.player?.prepare(f.lt); }

  cues(): Cue[] {
    return [
      { kind: 'swish', t: 0.2, pan: 0.45, gain: 1.1 },
      { kind: 'tick', t: 0.42, pitch: 0.9 },
    ];
  }

  render(f: Frame) {
    const g = this.g;
    const { ambient, lt } = f;
    const { title, subtitle } = this.ctx.params;
    backdrop(g, ambient);
    const out = prog(lt, DUR - 0.45, DUR, ease.inCubic);

    // the polaroid of the section's first frame, landing on the right
    const bitmap = this.player?.bitmap(lt);
    if (bitmap) {
      const k = prog(lt, 0.15, 0.95, ease.spring);
      const w = 760, h = w * (bitmap.height / bitmap.width);
      g.save();
      g.globalAlpha = clamp(k * 2) * (1 - out);
      g.translate(lerp(W + 500, 1340, k), lerp(H / 2 + 120, H / 2 + 10, k) - 30 * out);
      g.rotate(lerp(0.35, 0.045, k));
      g.shadowColor = shadow(0.20);
      g.shadowBlur = 50;
      g.shadowOffsetY = 22;
      roundRect(g, -w / 2 - 18, -h / 2 - 18, w + 36, h + 92, 10);
      g.fillStyle = C.paper;
      g.fill();
      g.shadowColor = 'transparent';
      g.drawImage(bitmap, -w / 2, -h / 2, w, h);
      g.fillStyle = C.tape;
      g.translate(0, -h / 2 - 20);
      g.rotate(-0.07);
      g.fillRect(-70, -16, 140, 32);
      g.restore();
    }

    // title and line, left
    g.save();
    g.globalAlpha = 1 - out;
    g.translate(0, -40 * out);
    const x = 170;
    const head = prog(lt, 0.35, 1.0, ease.outExpo);
    g.globalAlpha = (1 - out) * clamp(head * 1.4);
    g.font = font('display', 132);
    g.fillStyle = C.ink;
    g.textBaseline = 'alphabetic';
    g.save();
    g.beginPath();
    g.rect(0, 390, W * 0.62, 190);
    g.clip();
    g.fillText(title, x, 540 + 90 * (1 - head));
    g.restore();

    const sub = prog(lt, 0.6, 1.2, ease.outCubic);
    g.globalAlpha = (1 - out) * sub;
    g.font = font('text', 34, 500);
    g.fillStyle = C.gray600;
    g.fillText(subtitle, x, 620 + 12 * (1 - sub));
    g.restore();
  }
}
