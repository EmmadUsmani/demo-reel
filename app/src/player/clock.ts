// The player's clock: what time to draw. While the soundtrack plays, the audio keeps the time and the
// picture follows it; without sound (none built, or blocked), the wall clock does.

/** What the clock reads from the audio being heard; an HTMLAudioElement is one. */
export type AudioTime = { currentTime: number; paused: boolean; seeking: boolean; readyState: number; ended: boolean };

/** HTMLMediaElement.HAVE_FUTURE_DATA: enough is buffered to keep playing. */
const HAVE_FUTURE_DATA = 3;
/** How far the picture may run ahead of an audio clock that hasn't reported a new time yet, s. */
export const EXTRAPOLATE = 0.1;
/** A step back smaller than this is the audio clock's reporting jitter, not a seek: hold the frame, s. */
export const JITTER = 0.25;

export class PlaybackClock {
  /** The wall clock: playback reached `from` (s) at `at` (ms, performance.now). */
  private from = 0;
  private at = 0;
  /** The audio clock's last reported time, and when it reported it. */
  private heard = -1;
  private heardAt = 0;

  constructor(private readonly end: number) {}

  /** Time restarts from `t` at `perf`: a play, a seek, a switch of track. */
  reset(t: number, perf: number) {
    this.from = t;
    this.at = perf;
    this.heard = -1;
  }

  /** The time to draw at `perf`, given the time drawn last and the audio being heard, if any. */
  read(last: number, perf: number, audio?: AudioTime): number {
    let t: number;
    if (!audio) t = this.from + (perf - this.at) / 1000;
    else if (audio.ended) t = this.end;
    else if (audio.paused || audio.seeking || audio.readyState < HAVE_FUTURE_DATA) {
      this.reset(last, perf); // starting or buffering: the picture waits for the sound
      t = last;
    } else {
      if (audio.currentTime !== this.heard) { this.heard = audio.currentTime; this.heardAt = perf; }
      t = this.heard + Math.min(EXTRAPOLATE, (perf - this.heardAt) / 1000);
    }
    return t < last && last - t < JITTER ? last : t;
  }
}
