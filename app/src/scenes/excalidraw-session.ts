// Excalidraw: pick a shape, drag it out, label it, then join three shapes with arrows. One recorded
// session, held at each result for its line. Nothing is sped up.
import type { ClipPlayer } from '../engine/clip';
import { ClipScene, type CameraKey } from '../engine/clip-scene';
import { beat, grow, union } from '../engine/beats';
import { highlight, label } from '../engine/draw';
import type { Cue, Frame, Line } from '../engine/scene';
import { ease } from '../engine/util';
import { insideWindow } from '../engine/view';

const INTRO = 0.8; // wide on the empty canvas before the push
const TOOL_HOLD = 3.6; // on the toolbar
const IDEA_HOLD = 2.6; // on the first labelled shape
const SHAPES_HOLD = 2.6; // on all three shapes
const ARROW_HOLD = 3.2; // on the first arrow
const DONE_HOLD = 4.0; // on the finished flow
const END_HOLD = 0.5;

export default class ExcalidrawSession extends ClipScene {
  protected source = { footage: 'excalidraw', clip: 'session', url: 'excalidraw.com' };

  protected plan(player: ClipPlayer) {
    player
      .hold(INTRO, 'start').play('start', 'tool').hold(TOOL_HOLD)
      .play('tool', 'idea').hold(IDEA_HOLD)
      .play('idea', 'share').hold(SHAPES_HOLD)
      .play('share', 'arrow').hold(ARROW_HOLD)
      .play('arrow', 'done').hold(DONE_HOLD)
      .play('done', 'end').hold(END_HOLD);
  }

  private at(mark: string) { return this.player.timeOf(mark); }

  private shapes() { return union(union(this.box('shapes', 'idea'), this.box('shapes', 'sketch')), this.box('shapes', 'share')); }

  narration(): Line[] {
    return [
      { id: 'tool', at: this.at('tool') + 0.1, until: this.at('tool') + TOOL_HOLD - 0.1, text: 'Pick a tool. Each one has a single-key shortcut.' },
      { id: 'draw', at: this.at('drawn') - 0.9, until: this.at('idea') + IDEA_HOLD - 0.1, text: 'Drag out the shape, press Enter, and type a label.' },
      { id: 'more', at: this.at('idea') + 0.6, until: this.at('sketch') - 0.2, text: 'Diamonds and ellipses work the same way.' },
      { id: 'three', at: this.at('share') + 0.1, until: this.at('share') + SHAPES_HOLD - 0.1, text: 'Three shapes, ready to connect.' },
      { id: 'arrow', at: this.at('share') + SHAPES_HOLD + 0.3, until: this.at('arrow') + ARROW_HOLD - 0.1, text: 'Pick the arrow, and drag from one shape to the next.' },
      { id: 'done', at: this.at('done') + 0.1, until: this.at('done') + DONE_HOLD - 0.1, text: 'A clean flow, and it all stays in your browser.' },
    ];
  }

  protected sounds(): Cue[] {
    return [
      { kind: 'pop', t: this.at('tool') + 0.25 },
      { kind: 'pop', t: this.at('idea') + 0.15 },
      { kind: 'pop', t: this.at('share') + 0.15 },
      { kind: 'pop', t: this.at('arrow') + 0.15 },
      { kind: 'pop', t: this.at('done') + 0.15 },
    ];
  }

  protected cameraKeys(): CameraKey[] {
    const view = this.view;
    const toolbar = insideWindow(view, view.aim(this.box('tool', 'toolbar'), 2.0, 0, 90));
    const flow = insideWindow(view, view.aim(this.shapes(), 1.35));
    const toolEnd = this.at('tool') + TOOL_HOLD;
    return [
      [0, view.wide],
      [this.at('tool') - 0.6, view.wide],
      [this.at('tool') + 0.1, toolbar, ease.inOutQuart],
      [toolEnd - 0.3, toolbar],
      [toolEnd + 0.7, view.wide, ease.inOutQuart],
      [this.at('done') + 0.2, view.wide],
      [this.at('done') + 1.2, flow, ease.inOutQuart],
      [this.at('done') + DONE_HOLD - 0.4, flow],
      [this.duration(), view.wide, ease.inOutQuart],
    ];
  }

  protected overlay(f: Frame) {
    const g = this.g;

    const tool = this.screenBox('tool', 'tool');
    const onTool = beat(f.lt, this.at('tool') + 0.2, this.at('tool') + TOOL_HOLD - 0.4);
    highlight(g, grow(tool, 2), onTool);
    label(g, tool, 'Pick a shape', onTool, 'below', 'Shortcut key beside each tool');

    const idea = this.screenBox('idea', 'shape');
    const onIdea = beat(f.lt, this.at('idea') + 0.1, this.at('idea') + IDEA_HOLD - 0.4);
    highlight(g, idea, onIdea, 16);
    label(g, idea, 'Type inside any shape', onIdea, 'below', 'Enter starts the label');

    const all = this.view.screenBox(this.shapes());
    const onShapes = beat(f.lt, this.at('share') + 0.1, this.at('share') + SHAPES_HOLD - 0.3);
    highlight(g, grow(all, 6), onShapes, 24);
    label(g, all, 'Hand-drawn look', onShapes, 'below');

    const a = this.box('arrow', 'idea'), b = this.box('arrow', 'sketch');
    const gap = { x: a.x + a.w, y: a.y + a.h / 2 - 22, w: b.x - (a.x + a.w), h: 44 };
    const link = this.view.screenBox(gap);
    const onArrow = beat(f.lt, this.at('arrow') + 0.1, this.at('arrow') + ARROW_HOLD - 0.4);
    highlight(g, link, onArrow, 16);
    // the label sits above the row of shapes, clear of the shapes themselves
    const row = this.view.screenBox(this.shapes());
    label(g, { x: link.x, y: row.y, w: link.w, h: 0 }, 'A linking arrow', onArrow, 'above', 'Ends attach to each shape');

    const done = this.view.screenBox(this.shapes());
    const onDone = beat(f.lt, this.at('done') + 0.1, this.at('done') + DONE_HOLD - 0.5);
    highlight(g, grow(done, 6), onDone, 24);
    label(g, done, 'A finished flow', onDone, 'below', 'Saved in the browser');
  }
}
