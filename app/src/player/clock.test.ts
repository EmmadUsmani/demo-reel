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

  test('a step back of exactly JITTER is a seek, not jitter', () => {
    const clock = new PlaybackClock(100);
    clock.reset(20, 0);
    expect(clock.read(20 + JITTER, 0, playing(20))).toBe(20);
  });

  test('without audio, a small step back holds the frame too', () => {
    const clock = new PlaybackClock(100);
    clock.reset(10, 0);
    expect(clock.read(10.1, 0)).toBe(10.1); // the wall clock says 10; the picture is already at 10.1
    expect(clock.read(10.1, 400)).toBeCloseTo(10.4);
  });

  test('ended wins over every other state, wherever the audio sits', () => {
    for (const state of [{ paused: true }, { seeking: true }, { readyState: 0 }]) {
      const clock = new PlaybackClock(42);
      expect(clock.read(3, 0, playing(1, { ended: true, ...state }))).toBe(42);
    }
  });

  test('an audio clock that reports a new time restarts the extrapolation from that report', () => {
    const clock = new PlaybackClock(100);
    clock.reset(5, 0);
    expect(clock.read(5, 0, playing(5))).toBe(5);
    expect(clock.read(5.05, 50, playing(5))).toBeCloseTo(5.05); // same report: 50 ms past it
    expect(clock.read(5.05, 60, playing(5.06))).toBeCloseTo(5.06); // a new report: no extrapolation yet
    expect(clock.read(5.06, 70, playing(5.06))).toBeCloseTo(5.07);
  });

  test('a reset forgets the last report, so the same audio time counts as a new one', () => {
    const clock = new PlaybackClock(100);
    clock.reset(5, 0);
    clock.read(5, 0, playing(5));
    clock.reset(5, 10_000);
    expect(clock.read(5, 10_050, playing(5))).toBeCloseTo(5); // not 5 + EXTRAPOLATE from the old report
    expect(clock.read(5, 10_150, playing(5))).toBeCloseTo(5.1);
  });

  test('while the audio buffers, the wall clock restarts at the held frame, so playing on without audio continues from there', () => {
    const clock = new PlaybackClock(100);
    clock.reset(0, 0);
    expect(clock.read(7, 5000, playing(7, { readyState: 2 }))).toBe(7);
    expect(clock.read(7, 5500)).toBeCloseTo(7.5); // the sound failed for good: the wall clock carries on from 7
  });

  test('the audio\'s own time is followed even when it is behind the picture by more than the jitter', () => {
    const clock = new PlaybackClock(100);
    clock.reset(30, 0);
    expect(clock.read(30, 0, playing(12))).toBe(12);
  });

  test('the audio\'s time is not clamped to the end: the player does that', () => {
    const clock = new PlaybackClock(10);
    expect(clock.read(9.9, 0, playing(10.2))).toBeCloseTo(10.2);
  });
});
