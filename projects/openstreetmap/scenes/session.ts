// OpenStreetMap: search for a city, watch the map fly to it and pin it, then zoom in a level at a
// time down to the streets. One recorded session, held at each result for its line. Nothing is
// sped up; the map tiles are OpenStreetMap's own.
import type { ClipPlayer } from '@engine/clip';
import { ClipScene, type CameraKey } from '@engine/clip-scene';
import { beat, grow, union } from '@engine/beats';
import { highlight, label } from '@engine/draw';
import type { Cue, Frame, Line } from '@engine/scene';
import { ease } from '@engine/util';
import { insideWindow } from '@engine/view';

const INTRO = 1.0; // wide on the map before the search
const FOUND_HOLD = 3.4; // on the pinned result
const DONE_HOLD = 4.2; // on the street map and its credit
const END_HOLD = 0.4;

export default class OpenStreetMapSession extends ClipScene {
  protected source = { footage: 'openstreetmap', clip: 'session', url: 'openstreetmap.org' };

  protected plan(player: ClipPlayer) {
    player
      .hold(INTRO, 'start').play('start', 'results').hold(0.4)
      .play('results', 'found').hold(FOUND_HOLD)
      .play('found', 'zoomed')
      .play('zoomed', 'done').hold(DONE_HOLD)
      .play('done', 'end').hold(END_HOLD);
  }

  private at(mark: string) { return this.player.timeOf(mark); }

  narration(): Line[] {
    return [
      { id: 'search', at: this.at('focused') - 0.2, until: this.at('results') - 0.2, text: 'Type a place name, and press Enter.' },
      { id: 'found', at: this.at('found') + 0.1, until: this.at('found') + FOUND_HOLD - 0.1, text: 'The map flies to the city and drops a pin on it.' },
      { id: 'zoom', at: this.at('found') + FOUND_HOLD + 0.8, until: this.at('zoomed') + 0.4, text: 'Zoom in a level at a time, all the way down to the streets.' },
      { id: 'open', at: this.at('done') + 0.1, until: this.at('done') + DONE_HOLD - 0.1, text: 'Every street here is open data, mapped by its community.' },
    ];
  }

  protected sounds(): Cue[] {
    return [
      { kind: 'pop', t: this.at('results') + 0.2 },
      { kind: 'pop', t: this.at('found') + 0.15 },
      { kind: 'pop', t: this.at('found') + FOUND_HOLD + 1.0 },
      { kind: 'pop', t: this.at('done') + 0.15 },
    ];
  }

  protected cameraKeys(): CameraKey[] {
    const view = this.view;
    const searching = insideWindow(view, view.aim(union(this.box('results', 'search'), this.box('results', 'result')), 1.9, 40, 0));
    const pin = insideWindow(view, view.aim(this.box('found', 'pin'), 1.7));
    const credit = insideWindow(view, view.aim(this.box('done', 'attribution'), 2.4, 0, -60));
    const foundEnd = this.at('found') + FOUND_HOLD;
    return [
      [0, view.wide],
      [INTRO - 0.2, view.wide],
      [INTRO + 0.8, searching, ease.inOutQuart],
      [this.at('results') + 0.5, searching],
      [this.at('found') - 0.3, pin, ease.inOutQuart],
      [foundEnd - 0.3, pin],
      [foundEnd + 0.7, view.wide, ease.inOutQuart],
      [this.at('done') + 0.1, view.wide],
      [this.at('done') + 1.0, credit, ease.inOutQuart],
      [this.at('done') + DONE_HOLD - 0.4, credit],
      [this.duration(), view.wide, ease.inOutQuart],
    ];
  }

  protected overlay(f: Frame) {
    const g = this.g;

    const search = this.screenBox('results', 'search');
    const onSearch = beat(f.lt, this.at('focused') + 0.1, this.at('results') - 0.3);
    highlight(g, grow(search, 3), onSearch, 12);
    label(g, search, 'Search any place', onSearch, 'right', 'Type a name, then Enter');

    const pin = this.screenBox('found', 'pin');
    const onPin = beat(f.lt, this.at('found') + 0.1, this.at('found') + FOUND_HOLD - 0.2);
    highlight(g, grow(pin, 4), onPin, 20);
    label(g, pin, 'A pin on the result', onPin, 'right', 'The map flew here');

    const zoom = this.screenBox('found', 'zoom');
    const onZoom = beat(f.lt, this.at('found') + FOUND_HOLD + 1.0, this.at('zoomed') + 0.3);
    highlight(g, grow(zoom, 2), onZoom, 14);
    label(g, zoom, 'Zoom in', onZoom, 'left', 'One level per click');

    const credit = this.screenBox('done', 'attribution');
    const onCredit = beat(f.lt, this.at('done') + 1.0, this.at('done') + DONE_HOLD - 0.3);
    highlight(g, grow(credit, 3), onCredit, 10);
    label(g, credit, 'Mapped by contributors', onCredit, 'above', 'Credited on every map', 'end');
  }
}
