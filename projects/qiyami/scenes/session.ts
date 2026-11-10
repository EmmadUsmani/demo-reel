// Spoken lines respell Arabic words for the narrator (Keeyaami, Tahhajjood, Kuhrahn, Haadeeth, Ahsir);
// the screen keeps the real spelling.
// Qiyami: the dashboard (countdown, times, last third of the night, verses), then the settings
// sheet: Asr method and a city override, saved. One recorded session, held at each beat for its line.
import type { ClipPlayer } from '@engine/clip';
import { ClipScene, type CameraKey } from '@engine/clip-scene';
import { beat } from '@engine/beats';
import { highlight, label } from '@engine/draw';
import type { Cue, Frame, Line } from '@engine/scene';
import { ease } from '@engine/util';
import { insideWindow } from '@engine/view';

const INTRO = 0.8;
const COUNTDOWN_HOLD = 4.0;
const NIGHT_HOLD = 4.4;
const VERSES_HOLD = 3.6;
const SETTINGS_HOLD = 0.0;
const SAVED_HOLD = 3.2;
const ZOOM = 1.55;

export default class QiyamiSession extends ClipScene {
  protected source = { footage: 'qiyami', clip: 'session', url: 'qiyami.com' };

  protected plan(player: ClipPlayer) {
    player.hold(INTRO, 'start').play('start', 'countdown').hold(COUNTDOWN_HOLD)
      .play('countdown', 'night').hold(NIGHT_HOLD)
      .play('night', 'verses').hold(VERSES_HOLD)
      .play('verses', 'settings').hold(SETTINGS_HOLD)
      .play('settings', 'city').play('city', 'save').play('save', 'saved').hold(SAVED_HOLD).play('saved', 'end');
  }

  private at(mark: string) { return this.player.timeOf(mark); }

  narration(): Line[] {
    const p = this.presses;
    return [
      { id: 'countdown', at: this.at('countdown') + 0.2, until: this.at('countdown') + COUNTDOWN_HOLD, text: 'Today’s prayers on one screen, with a live countdown to the next.' },
      { id: 'night', at: this.at('night') + 0.2, until: this.at('night') + NIGHT_HOLD, text: 'It also finds the last third of the night, for Tahhajjood.', caption: 'It also finds the last third of the night, for Tahajjud.' },
      { id: 'verses', at: this.at('verses') + 0.2, until: this.at('verses') + VERSES_HOLD, text: 'Below, the Kuhrahn and Haadeeth behind night prayer.', caption: 'Below, the Qur’an and hadith behind night prayer.' },
      { id: 'settings', at: p[0]! + 0.3, until: p[2]! - 0.1, text: 'Pick a calculation method and Ahsir school.', caption: 'Pick a calculation method and Asr school.' },
      { id: 'city', at: p[2]! + 0.1, until: p[4]! - 0.1, text: 'Or search any city to fix your location.' },
      { id: 'saved', at: p[4]! + 0.3, until: this.at('saved') + SAVED_HOLD, text: 'Save, and every time follows.' },
    ];
  }

  protected sounds(): Cue[] {
    return ['countdown', 'night', 'verses', 'saved'].map((m) => ({ kind: 'pop', t: this.at(m) + 0.25 }));
  }

  protected cameraKeys(): CameraKey[] {
    const view = this.view;
    const on = (mark: string, key: string, dx = 0, dy = 0) => insideWindow(view, view.aim(this.box(mark, key), ZOOM, dx, dy));
    const settings = insideWindow(view, view.aim(this.box('settings', 'sheet'), 1.25));
    const end = this.duration();
    return [
      [0, view.wide],
      [INTRO - 0.2, view.wide],
      [this.at('countdown') - 0.4, on('countdown', 'region'), ease.inOutQuart],
      [this.at('countdown') + COUNTDOWN_HOLD - 0.4, on('countdown', 'region')],
      [this.at('night') - 0.2, on('night', 'times'), ease.inOutQuart, 0.15],
      [this.at('night') + NIGHT_HOLD - 0.4, on('night', 'times')],
      [this.at('verses') - 0.2, on('verses', 'verses', 0, -10), ease.inOutQuart, 0.15],
      [this.at('verses') + VERSES_HOLD - 0.4, on('verses', 'verses', 0, -10)],
      [this.at('settings') + 0.2, settings, ease.inOutQuart],
      [this.at('save') + 0.6, settings],
      [this.at('saved') + 0.2, view.wide, ease.inOutQuart],
      [end, view.wide],
    ];
  }

  protected overlay(f: Frame) {
    const g = this.g;
    const t = (m: string, d = 0) => this.at(m) + d;

    const countdown = this.screenBox('countdown', 'region');
    const onCountdown = beat(f.lt, t('countdown', 0.2), t('countdown') + COUNTDOWN_HOLD - 0.3);
    highlight(g, countdown, onCountdown, 22);
    label(g, countdown, 'Live countdown', onCountdown, 'below', 'To the next prayer');

    const night = this.screenBox('night', 'night');
    const onNight = beat(f.lt, t('night', 0.2), t('night') + NIGHT_HOLD - 0.3);
    highlight(g, night, onNight, 18);
    label(g, night, 'Last third of the night', onNight, 'above', 'Tahajjud time');

    const verses = this.screenBox('verses', 'verses');
    const onVerses = beat(f.lt, t('verses', 0.2), t('verses') + VERSES_HOLD - 0.3);
    highlight(g, verses, onVerses, 22);
    label(g, verses, 'Qur’an and hadith', onVerses, 'above');

    const saved = this.screenBox('saved', 'header');
    const onSaved = beat(f.lt, t('saved', 0.2), t('saved') + SAVED_HOLD - 0.3);
    highlight(g, saved, onSaved, 18);
    label(g, saved, 'New city, new times', onSaved, 'below');
  }
}
