// The title card: up to three polaroids cut from the real footage spring in, then the name, one line
// of what it is, and a chip. It clears to the backdrop before it ends, so it can crossfade or cut.
//   params: {
//     name: string,                 the product or feature, big
//     subtitle?: string,            one line of what it is
//     kicker?: string,              a chip under it ("Open source", "Now live", "Coming soon")
//     line?: string,                the narration (a deck has none)
//     caption?: string,             the narration as it reads on screen, when it is respelled
//     notes?: string,               what a presenter says on this slide (deck speaker notes)
//     cards?: CardSpec[],           polaroids, see cards.ts
//     dur?: number                  seconds (default 5)
//   }
import { backdrop, chip, polaroid } from '../engine/draw';
import { C, font } from '../engine/palette';
import { Scene, W, type Cue, type Frame, type Line, type Note } from '../engine/scene';
import { clamp, ease, lerp, prog } from '../engine/util';
import { cardLayout, loadCard, type Card, type CardSpec } from './cards';

const CARDS_IN = 0.1, CARD_STAGGER = 0.18, TITLE_IN = 0.8, SUB_IN = 1.3, KICKER_IN = 1.75;

export default class TitleCard extends Scene {
  private cards: Card[] = [];
  private get dur(): number { return this.ctx.params.dur ?? 5; }
  private get exit() { return this.dur - 0.7; }

  async init() {
    const specs: CardSpec[] = this.ctx.params.cards ?? [];
    this.cards = await Promise.all(specs.slice(0, 3).map(loadCard));
  }

  duration() { return this.dur; }
  stops() { return [this.exit - 1 / 60]; }
  /** At the card's start, so it is on the way to the card's stop even when a crossfade into the next slide moves that stop earlier. */
  notes(): Note[] { return this.ctx.params.notes ? [{ at: 0, text: this.ctx.params.notes }] : []; }

  narration(): Line[] {
    const line: string | undefined = this.ctx.params.line;
    return line ? [{ id: 'title', at: 0.6, until: this.exit + 0.5, text: line, caption: this.ctx.params.caption }] : [];
  }

  cues(): Cue[] {
    const layout = cardLayout(this.cards.length);
    return [
      ...this.cards.map((_, i): Cue => ({ kind: 'swish', t: CARDS_IN + i * CARD_STAGGER + 0.05, pan: clamp(layout[i]![0] / 600, -0.6, 0.6) })),
      { kind: 'chime', t: TITLE_IN + 0.05 },
      ...(this.ctx.params.kicker ? [{ kind: 'tick', t: KICKER_IN + 0.1, pitch: 1.1 } as Cue] : []),
      { kind: 'whoosh-out', t: this.exit, dur: 0.7, gain: 0.8 },
    ];
  }

  render(f: Frame) {
    const g = this.g;
    const { t, lt } = f;
    const { name, subtitle, kicker } = this.ctx.params;
    backdrop(g, t);
    const out = prog(lt, this.exit, this.exit + 0.6, ease.inCubic);
    const hasCards = this.cards.length > 0;
    g.save();
    g.globalAlpha = 1 - out;
    g.translate(W / 2, (hasCards ? 540 : 440) - 50 * out);
    g.scale(1 - 0.04 * out, 1 - 0.04 * out);

    cardLayout(this.cards.length).forEach(([x, y, width, rotation], i) => {
      const card = this.cards[i];
      if (!card) return; // cardLayout(0) still lays out one slot
      const k = prog(lt, CARDS_IN + i * CARD_STAGGER, CARDS_IN + i * CARD_STAGGER + 0.9, ease.spring);
      if (k <= 0) return;
      const bob = Math.sin(t * 1.4 + x) * 5 * k;
      g.save();
      g.globalAlpha *= clamp(k * 2);
      polaroid(g, card.image, card.crop, x * lerp(0.4, 1, k), y + bob + 60 * (1 - k), width, rotation * k);
      g.restore();
    });

    g.textAlign = 'center';
    const title = prog(lt, TITLE_IN, TITLE_IN + 0.7, ease.outExpo);
    g.save();
    g.globalAlpha *= clamp(title * 1.4);
    g.font = font('sans', 130, 700);
    g.fillStyle = C.ink;
    g.fillText(name, 0, 135 + 40 * (1 - title));
    g.restore();

    if (subtitle) {
      const sub = prog(lt, SUB_IN, SUB_IN + 0.6, ease.outCubic);
      g.save();
      g.globalAlpha *= sub;
      g.font = font('sans', 58, 600);
      g.fillStyle = C.accent700;
      g.fillText(subtitle, 0, 225 + 20 * (1 - sub));
      g.restore();
    }

    const k = prog(lt, KICKER_IN, KICKER_IN + 0.5, ease.outBack);
    if (kicker && k > 0) {
      g.save();
      g.globalAlpha *= clamp(k * 1.5);
      g.font = font('text', 26, 500);
      g.textAlign = 'left';
      const w = g.measureText(kicker).width + 26 * 1.5;
      g.translate(0, subtitle ? 300 : 220);
      g.scale(lerp(0.8, 1, k), lerp(0.8, 1, k));
      chip(g, -w / 2, 0, kicker, { size: 26 });
      g.restore();
    }
    g.restore();
  }
}
