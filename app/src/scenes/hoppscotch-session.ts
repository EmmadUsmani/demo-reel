// Hoppscotch: a request to its public echo endpoint. One query parameter is typed in and sent, the
// response is read, then a second parameter is added and sent again. One recorded session, held at
// each result for its line. Nothing is sped up.
import type { ClipPlayer } from '../engine/clip';
import { ClipScene, type CameraKey } from '../engine/clip-scene';
import { beat, grow, union } from '../engine/beats';
import { highlight, label } from '../engine/draw';
import type { Cue, Frame, Line } from '../engine/scene';
import { ease } from '../engine/util';
import { insideWindow } from '../engine/view';

const INTRO = 4.2; // wide on the request, with its line
const SENT_A = 3.0; // on the status
const SENT_B = 2.9; // on the echoed parameter
const SENT2 = 3.2; // on both parameters
const ZOOM = 1.7;

export default class HoppscotchSession extends ClipScene {
  protected source = { footage: 'hoppscotch', clip: 'session', url: 'hoppscotch.io' };

  protected plan(player: ClipPlayer) {
    player
      .hold(INTRO, 'start').play('start', 'param1').hold(0.4)
      .play('param1', 'sent1').hold(SENT_A).hold(SENT_B)
      .play('sent1', 'param2').hold(0.3)
      .play('param2', 'sent2').hold(SENT2)
      .play('sent2', 'end').hold(0.4);
  }

  private at(mark: string) { return this.player.timeOf(mark); }

  narration(): Line[] {
    const sentEnd = this.at('sent1') + SENT_A + SENT_B;
    return [
      { id: 'request', at: 0.4, until: INTRO - 0.1, text: 'Here’s a request, already pointed at a public echo service.' },
      { id: 'param', at: INTRO + 0.2, until: this.at('param1') + 0.3, text: 'Add a query parameter: a name, then a value.' },
      { id: 'send', at: this.at('param1') + 0.5, until: this.at('sent1') - 0.2, text: 'Press Send.' },
      { id: 'status', at: this.at('sent1') + 0.1, until: this.at('sent1') + SENT_A - 0.1, text: 'A status of two hundred, so the request worked.' },
      { id: 'args', at: this.at('sent1') + SENT_A + 0.1, until: sentEnd - 0.1, text: 'And your parameter is echoed back under args.' },
      { id: 'second', at: sentEnd + 0.3, until: this.at('param2') + 0.2, text: 'Add a second one, and send again.' },
      { id: 'both', at: this.at('sent2') + 0.1, until: this.at('sent2') + SENT2 - 0.1, text: 'Now both parameters come back, just as sent.' },
    ];
  }

  protected sounds(): Cue[] {
    return [
      { kind: 'pop', t: this.at('start') + 0.5 },
      { kind: 'pop', t: this.at('sent1') + 0.15 },
      { kind: 'pop', t: this.at('sent1') + SENT_A + 0.15 },
      { kind: 'pop', t: this.at('sent2') + 0.15 },
    ];
  }

  // the request row, Send and the top of the response: one framing for the whole working part
  private work() {
    return union(union(this.box('param1', 'key'), this.box('param1', 'send')), this.box('sent1', 'hello'));
  }

  protected cameraKeys(): CameraKey[] {
    const view = this.view;
    const work = insideWindow(view, view.aim(this.work(), ZOOM, 0, 40));
    const end = this.at('sent2') + SENT2;
    return [
      [0, view.wide],
      [INTRO - 0.3, view.wide],
      [INTRO + 0.7, work, ease.inOutQuart],
      [end - 0.2, work],
      [end + 0.9, view.wide, ease.inOutQuart],
    ];
  }

  protected overlay(f: Frame) {
    const g = this.g;

    const url = this.screenBox('start', 'url');
    const onUrl = beat(f.lt, 0.5, INTRO - 0.3);
    highlight(g, grow(url, 3), onUrl, 12);
    label(g, url, 'The request', onUrl, 'below', 'Its URL, and the echo it mirrors back', 'start');

    const row = this.view.screenBox(union(this.box('param1', 'key'), this.box('param1', 'value')));
    const onParam = beat(f.lt, this.at('param1') - 1.4, this.at('param1') + 0.35);
    highlight(g, grow(row, 4), onParam, 10);
    label(g, row, 'Query parameter', onParam, 'below', 'A name and a value', 'start');

    const status = this.screenBox('sent1', 'status');
    const onStatus = beat(f.lt, this.at('sent1') + 0.1, this.at('sent1') + SENT_A - 0.1);
    highlight(g, grow(status, 3), onStatus, 12);
    label(g, status, 'It worked', onStatus, 'above', 'Status 200, with the time and size', 'start');

    const echoed = this.view.screenBox(union(this.box('sent1', 'greeting'), this.box('sent1', 'hello')));
    const onEcho = beat(f.lt, this.at('sent1') + SENT_A + 0.1, this.at('sent1') + SENT_A + SENT_B - 0.1);
    highlight(g, grow(echoed, -4), onEcho, 10);
    label(g, echoed, 'Echoed back', onEcho, 'right', 'Your parameter, under args');

    const both = this.view.screenBox(union(union(this.box('sent2', 'from'), this.box('sent2', 'value')), this.box('sent2', 'greeting')));
    const onBoth = beat(f.lt, this.at('sent2') + 0.1, this.at('sent2') + SENT2 - 0.1);
    highlight(g, grow(both, [0, -4]), onBoth, 10);
    label(g, both, 'Both of them', onBoth, 'right', 'In the response, as sent');
  }
}
