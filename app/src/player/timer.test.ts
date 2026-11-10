import { describe, expect, test } from 'bun:test';
import { Stopwatch, stopwatchText, wallClockText } from './timer';

describe('Stopwatch', () => {
  test('idle until begun, reading 0', () => {
    const w = new Stopwatch();
    expect(w.state).toBe('idle');
    expect(w.elapsed(5000)).toBe(0);
  });

  test('begin starts it; elapsed counts from there', () => {
    const w = new Stopwatch();
    w.begin(1000);
    expect(w.state).toBe('running');
    expect(w.elapsed(1000)).toBe(0);
    expect(w.elapsed(3500)).toBe(2500);
  });

  test('begin again (every later step) changes nothing', () => {
    const w = new Stopwatch();
    w.begin(1000);
    w.begin(4000);
    expect(w.elapsed(5000)).toBe(4000);
  });

  test('pause holds the time; resume continues from it', () => {
    const w = new Stopwatch();
    w.begin(0);
    w.toggle(2000);
    expect(w.state).toBe('paused');
    expect(w.elapsed(9000)).toBe(2000);
    w.toggle(10000);
    expect(w.state).toBe('running');
    expect(w.elapsed(11500)).toBe(3500);
  });

  test('a step forward while paused does not restart it', () => {
    const w = new Stopwatch();
    w.begin(0);
    w.toggle(1000);
    w.begin(5000);
    expect(w.state).toBe('paused');
    expect(w.elapsed(6000)).toBe(1000);
  });

  test('the pause button on an idle timer starts it', () => {
    const w = new Stopwatch();
    w.toggle(700);
    expect(w.state).toBe('running');
    expect(w.elapsed(1700)).toBe(1000);
  });

  test('reset goes back to idle at 0, and the next step begins it afresh', () => {
    const w = new Stopwatch();
    w.begin(0);
    w.reset();
    expect(w.state).toBe('idle');
    expect(w.elapsed(8000)).toBe(0);
    w.begin(8000);
    expect(w.elapsed(9000)).toBe(1000);
  });

  test('reset while paused, too', () => {
    const w = new Stopwatch();
    w.begin(0);
    w.toggle(1000);
    w.reset();
    expect(w.state).toBe('idle');
    expect(w.elapsed(2000)).toBe(0);
  });

  test('a clock that reads earlier than the start is 0, not negative', () => {
    const w = new Stopwatch();
    w.begin(1000);
    expect(w.elapsed(900)).toBe(0);
  });
});

describe('stopwatchText', () => {
  test('m:ss, seconds always two digits', () => {
    expect(stopwatchText(0)).toBe('0:00');
    expect(stopwatchText(999)).toBe('0:00');
    expect(stopwatchText(1000)).toBe('0:01');
    expect(stopwatchText(65_400)).toBe('1:05');
    expect(stopwatchText(59 * 60_000 + 59_999)).toBe('59:59');
  });

  test('h:mm:ss from an hour on', () => {
    expect(stopwatchText(3_600_000)).toBe('1:00:00');
    expect(stopwatchText(3_600_000 + 61_000)).toBe('1:01:01');
    expect(stopwatchText(10 * 3_600_000)).toBe('10:00:00');
  });

  test('negative reads as 0:00', () => {
    expect(stopwatchText(-5000)).toBe('0:00');
  });
});

describe('wallClockText', () => {
  test('hh:mm, 24 hours, zero padded', () => {
    expect(wallClockText(new Date(2026, 0, 1, 9, 5))).toBe('09:05');
    expect(wallClockText(new Date(2026, 0, 1, 0, 0))).toBe('00:00');
    expect(wallClockText(new Date(2026, 0, 1, 23, 59))).toBe('23:59');
  });
});
