// The end card: a polaroid of the product, its name, one line, an optional status pill, and what it
// does as three or four chips. The narration names the product once more. It fades to the backdrop.
//   params: {
//     name: string,
//     subtitle?: string,            "open source, on GitHub"
//     pill?: string,                a status pill above the name ("Coming soon", "Beta")
//     chips?: string[],             3–4 short phrases
//     line?: string,                the narration (a deck has none)
//     caption?: string,             the narration as it reads on screen, when it is respelled
//     notes?: string,               what a presenter says on this slide (deck speaker notes)
//     card?: CardSpec,              see cards.ts
//     dur?: number                  seconds (default 5.4)
//   }
import { backdrop, chip, polaroid, roundRect } from '../engine/draw';
import { C, font, withAlpha } from '../engine/palette';
import { Scene, W, type Cue, type Frame, type Line, type Note } from '../engine/scene';
import { clamp, ease, lerp, prog } from '../engine/util';
import { loadCard, type Card } from './cards';

const CHIPS_IN = 1.3, CHIP_STAGGER = 0.13;

export default class EndCard extends Scene {
  private card?: Card;
  private get dur(): number { return this.ctx.params.dur ?? 5.4; }
  private get chips(): string[] { return this.ctx.params.chips ?? []; }

  async init() { if (this.ctx.params.card) this.card = await loadCard(this.ctx.params.card); }
  duration() { return this.dur; }
  stops() { return [this.dur - 0.7 - 1 / 60]; }
  /** The card is one slide: its note goes on that slide. */
  notes(): Note[] { return this.ctx.params.notes ? [{ at: 0, text: this.ctx.params.notes }] : []; }

  narration(): Line[] {
    const line: string | undefined = this.ctx.params.line;
    return line ? [{ id: 'end', at: 0.5, until: this.dur - 0.4, text: line, caption: this.ctx.params.caption }] : [];
  }

  cues(): Cue[] {
    return [
      ...(this.card ? [{ kind: 'swish', t: 0.15 } as Cue] : []),
      { kind: 'chime', t: 0.6 },
      ...(this.ctx.params.pill ? [{ kind: 'pop', t: 1.05 } as Cue] : []),
      ...this.chips.map((_, i): Cue => ({ kind: 'tick', t: CHIPS_IN + i * CHIP_STAGGER + 0.1, pitch: 1 + i * 0.1, pan: (i - (this.chips.length - 1) / 2) * 0.2 })),
    ];
  }

  render(f: Frame) {
    const g = this.g;
    const { ambient, lt } = f;
    const { name, subtitle, pill } = this.ctx.params;
    backdrop(g, ambient);
    const top = this.card ? 0 : -170;

    const k = prog(lt, 0.1, 1.0, ease.spring);
    if (this.card && k > 0) {
      g.save();
      g.globalAlpha = clamp(k * 2);
      polaroid(g, this.card.image, this.card.crop, W / 2, 280 + Math.sin(ambient * 1.4) * 5 * k + 50 * (1 - k), 560 * lerp(0.7, 1, k), 0.04 * k);
      g.restore();
    }

    const p = prog(lt, 0.95, 1.4, ease.outBack);
    if (pill && p > 0) {
      g.save();
      g.globalAlpha = clamp(p * 1.5);
      g.font = font('text', 24, 700);
      const text = pill.toUpperCase();
      const w = g.measureText(text).width + 44, h = 46;
      g.translate(W / 2, 505 + top);
      g.scale(lerp(0.8, 1, p), lerp(0.8, 1, p));
      roundRect(g, -w / 2, -h / 2, w, h, h / 2);
      g.fillStyle = withAlpha(C.accent600, 0.12);
      g.fill();
      g.fillStyle = C.accent700;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 0, 1);
      g.restore();
    }

    const head = prog(lt, 0.45, 1.2, ease.outExpo);
    g.save();
    g.textAlign = 'center';
    g.globalAlpha = clamp(head * 1.4);
    g.font = font('sans', 120, 700);
    g.fillStyle = C.ink;
    g.fillText(name, W / 2, 640 + top + 50 * (1 - head));
    if (subtitle) {
      g.globalAlpha = prog(lt, 0.9, 1.5, ease.outCubic);
      g.font = font('sans', 52, 600);
      g.fillStyle = C.accent700;
      g.fillText(subtitle, W / 2, 725 + top);
    }
    g.restore();

    g.save();
    g.font = font('text', 26, 500);
    const gap = 16;
    const widths = this.chips.map((c) => g.measureText(c).width + 26 * 1.5);
    let cx = W / 2 - (widths.reduce((a, b) => a + b, 0) + gap * (this.chips.length - 1)) / 2;
    this.chips.forEach((c, i) => {
      const q = prog(lt, CHIPS_IN + i * CHIP_STAGGER, CHIPS_IN + 0.55 + i * CHIP_STAGGER, ease.outBack);
      g.save();
      g.globalAlpha = clamp(q * 1.5);
      g.translate(cx + widths[i]! / 2, 830 + top + 25);
      g.scale(lerp(0.8, 1, q), lerp(0.8, 1, q));
      chip(g, -widths[i]! / 2, -25, c, { size: 26 });
      g.restore();
      cx += widths[i]! + gap;
    });
    g.restore();

    const out = prog(lt, this.dur - 0.7, this.dur, ease.inOutQuad);
    if (out > 0) { g.save(); g.globalAlpha = out; backdrop(g, ambient); g.restore(); }
  }
}
