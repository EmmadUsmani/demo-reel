// Qiyami's recorded session as four narrated slides: each beat held long enough for its line to be said
// before the slide stops (scripts/audio.ts refuses a line a stop would cut), with a speaker note at each stop.
import Session, { type Holds } from '../../qiyami/scenes/session';

/** The beats a slide holds on, in order. */
const BEATS = ['countdown', 'night', 'verses', 'saved'] as const;

const NOTES = [
  'The dashboard puts today’s prayer times on one screen, with a live countdown to the next prayer.',
  'It also works out Islamic midnight and when the last third of the night begins: the time for Tahajjud.',
  'Below the times sit the Qur’an verses and hadith on night prayer, so the reason is right beside the time.',
  'Settings pick a calculation method and an Asr school, and fix the location to any city. Here it is San Jose; on save, every time on the page is worked out again.',
];

export default class extends Session {
  protected holds: Holds = { intro: 0.8, countdown: 5.2, night: 4.8, verses: 4.0, settings: 0, saved: 3.6 };

  /** Each beat with its label fully in, once its line is said: the label starts to fade 0.55 s before the hold ends. */
  stops() { return BEATS.map((mark) => this.at(mark) + this.holds[mark] - 0.6); }
  notes() { return this.stops().map((at, i) => ({ at, text: NOTES[i]! })); }
}
