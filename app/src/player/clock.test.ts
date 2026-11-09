import { describe, expect, test } from 'bun:test';
import { EXTRAPOLATE, JITTER, PlaybackClock, type AudioTime } from './clock';

const playing = (currentTime: number, over: Partial<AudioTime> = {}): AudioTime =>
  ({ currentTime, paused: false, seeking: false, readyState: 4, ended: false, ...over });

describe('PlaybackClock', () => {
  test('without audio, the wall clock keeps time from the last reset', () => {
    const clock = new PlaybackClock(100);
    clock.reset(10, 1000);
    expect(clock.read(10, 1000)).toBe(10);
    expect(clock.read(10, 3500)).toBeCloseTo(12.5);
  });

  test('with audio, the picture follows the audio time', () => {
    const clock = new PlaybackClock(100);
    clock.reset(10, 0);
    expect(clock.read(10, 0, playing(10.2))).toBeCloseTo(10.2);
    expect(clock.read(10.2, 500, playing(40))).toBeCloseTo(40); // the audio jumped (a seek): follow it
  });

  test('between audio reports, the time extrapolates, but never more than EXTRAPOLATE ahead', () => {
    const clock = new PlaybackClock(100);
    clock.reset(5, 0);
    expect(clock.read(5, 0, playing(5))).toBe(5);
    expect(clock.read(5, 16, playing(5))).toBeCloseTo(5.016);
    expect(clock.read(5.016, 2000, playing(5))).toBeCloseTo(5 + EXTRAPOLATE); // the audio stopped reporting
  });

  test('holds the frame while the audio is starting, seeking or buffering', () => {
    for (const state of [{ paused: true }, { seeking: true }, { readyState: 2 }]) {
      const clock = new PlaybackClock(100);
      clock.reset(7, 0);
      expect(clock.read(7, 5000, playing(7, state))).toBe(7);
    }
  });

  test('once the audio has ended, the time is the end', () => {
    const clock = new PlaybackClock(100);
    expect(clock.read(99.9, 0, playing(100, { ended: true, paused: true }))).toBe(100);
  });

  test('a small step back (reporting jitter) holds the frame; a big one is a seek', () => {
    const clock = new PlaybackClock(100);
    clock.reset(20, 0);
    expect(clock.read(20.05, 0, playing(20.01))).toBe(20.05);
    expect(clock.read(20 + JITTER + 1, 0, playing(20))).toBe(20);
  });
});
