// TodoMVC (React): three todos typed in, one ticked off, then the Active filter. One recorded
// session, held at each result for its line.
import type { ClipPlayer } from '../engine/clip';
import { ClipScene, type CameraKey } from '../engine/clip-scene';
import { beat, grow } from '../engine/beats';
import { highlight, label } from '../engine/draw';
import type { Cue, Frame, Line } from '../engine/scene';
import { ease } from '../engine/util';
import { insideWindow } from '../engine/view';

const INTRO = 0.9; // wide on the empty app before the push
const ADDED_HOLD = 2.0;
const DONE_HOLD = 0.9;
const FILTERED_HOLD = 1.6;
const END_HOLD = 0.6;
const ZOOM = 1.6;

export default class TodoSession extends ClipScene {
  protected source = { footage: 'todomvc', clip: 'session', url: 'todomvc.com/examples/react/dist' };

  protected plan(player: ClipPlayer) {
    player.hold(INTRO, 'start').play('start', 'added').hold(ADDED_HOLD).play('added', 'done').hold(DONE_HOLD).play('done', 'filtered').hold(FILTERED_HOLD).play('filtered', 'end').hold(END_HOLD);
  }

  private at(mark: string) { return this.player.timeOf(mark); }

  narration(): Line[] {
    return [
      { id: 'type', at: this.at('focused') + 0.1, until: this.at('added2'), text: 'Type what needs doing, and press Enter.' },
      { id: 'list', at: this.at('added') + 0.1, until: this.presses[1]! - 0.1, text: 'Each one joins the list, with a count of what’s left.' },
      { id: 'done', at: this.presses[1]! + 0.3, until: this.presses[2]! - 0.1, text: 'Tick one off when it’s done.' },
      { id: 'filter', at: this.presses[2]! + 0.1, until: this.duration() - 0.1, text: 'Then filter to what’s still open.' },
    ];
  }

  protected sounds(): Cue[] {
    return [{ kind: 'pop', t: this.at('added') + 0.25 }, { kind: 'pop', t: this.at('done') + 0.1 }, { kind: 'pop', t: this.at('filtered') + 0.1 }];
  }

  protected cameraKeys(): CameraKey[] {
    const view = this.view;
    const close = insideWindow(view, view.aim(this.box('added', 'app'), ZOOM, 0, -20));
    return [
      [0, view.wide],
      [INTRO - 0.3, view.wide],
      [this.at('focused'), close, ease.inOutQuart],
      [this.duration() - 1.2, close],
      [this.duration(), view.wide, ease.inOutQuart],
    ];
  }

  protected overlay(f: Frame) {
    const g = this.g;
    const list = this.screenBox('added', 'list');
    const onList = beat(f.lt, this.at('added') + 0.25, this.presses[1]! - 0.5);
    highlight(g, list, onList, 6);
    label(g, list, 'Added with Enter', onList, 'left', 'One todo per line');

    const done = this.screenBox('done', 'item');
    const onDone = beat(f.lt, this.at('done') + 0.1, this.presses[2]! - 0.6);
    highlight(g, done, onDone, 6);
    label(g, done, 'Done, crossed out', onDone, 'left', 'The count drops to two');

    const filter = this.screenBox('filtered', 'filter');
    const onFilter = beat(f.lt, this.at('filtered') + 0.1, this.duration() - 1.3);
    highlight(g, grow(filter, 2), onFilter);
    label(g, filter, 'Only what’s left', onFilter, 'below');
  }
}
