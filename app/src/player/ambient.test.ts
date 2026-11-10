import { describe, expect, test } from 'bun:test';
import { AmbientClock } from './ambient';

describe('AmbientClock', () => {
  test('is the video time when nothing is held (the video, a step playing from the start)', () => {
    const clock = new AmbientClock();
    expect(clock.read(0, 0)).toBe(0);
    expect(clock.read(12.5, 99999)).toBe(12.5);
    expect(clock.held).toBe(false);
  });

  test('while a slide is held, the video time stands still and the clock keeps going with the wall clock', () => {
    const clock = new AmbientClock();
    clock.hold(1000);
    expect(clock.held).toBe(true);
    expect(clock.read(8, 1000)).toBe(8);
    expect(clock.read(8, 1500)).toBeCloseTo(8.5);
    expect(clock.read(8, 4000)).toBeCloseTo(11);
  });

  test('holding again does not restart the hold', () => {
    const clock = new AmbientClock();
    clock.hold(0);
    clock.hold(700);
    expect(clock.read(5, 1000)).toBeCloseTo(6);
  });

  test('the next step carries on from where the held clock was: no jump when it starts, nor when it ends', () => {
    const clock = new AmbientClock();
    clock.hold(0);
    const before = clock.read(8, 3000);
    clock.play(3000);
    expect(clock.held).toBe(false);
    expect(clock.read(8, 3000)).toBeCloseTo(before);
    expect(clock.read(9.5, 4500)).toBeCloseTo(before + 1.5); // the step plays at the video's pace
    clock.hold(4500); // it arrives and holds
    expect(clock.read(9.5, 4500)).toBeCloseTo(before + 1.5);
    expect(clock.read(9.5, 5500)).toBeCloseTo(before + 2.5);
  });

  test('held time accumulates across several holds', () => {
    const clock = new AmbientClock();
    clock.hold(0);
    clock.play(2000); // held 2 s
    clock.hold(3000); // the step took 1 s
    clock.play(5000); // held 2 s more
    expect(clock.read(10, 5000)).toBeCloseTo(10 + 4);
  });

  test('a jump starts over at the video time', () => {
    const clock = new AmbientClock();
    clock.hold(0);
    clock.play(5000);
    clock.reset();
    expect(clock.read(3, 6000)).toBe(3);
    clock.hold(6000);
    expect(clock.read(3, 6400)).toBeCloseTo(3.4);
    clock.reset();
    expect(clock.held).toBe(false);
    expect(clock.read(1, 9000)).toBe(1);
  });

  test('a perf earlier than the hold (an event stamped after the frame) reads as no time held', () => {
    const clock = new AmbientClock();
    clock.hold(1000);
    expect(clock.read(4, 990)).toBe(4);
  });

  test('paused, a held clock stands still, and resuming does not count the pause', () => {
    const clock = new AmbientClock();
    clock.hold(0);
    clock.pause(2000);
    expect(clock.paused).toBe(true);
    expect(clock.read(8, 2000)).toBeCloseTo(10);
    expect(clock.read(8, 9000)).toBeCloseTo(10);
    clock.resume(9000);
    expect(clock.paused).toBe(false);
    expect(clock.read(8, 9000)).toBeCloseTo(10);
    expect(clock.read(8, 9500)).toBeCloseTo(10.5);
  });

  test('pausing twice or resuming when running changes nothing', () => {
    const clock = new AmbientClock();
    clock.hold(0);
    clock.resume(500);
    clock.pause(1000);
    clock.pause(4000);
    clock.resume(5000);
    expect(clock.read(0, 5000)).toBeCloseTo(1);
  });

  test('a playing step paused keeps its offset; the held time before it is not lost', () => {
    const clock = new AmbientClock();
    clock.hold(0);
    clock.play(3000); // 3 s ahead
    clock.pause(4000);
    expect(clock.read(5, 9000)).toBeCloseTo(8);
    clock.resume(9000);
    expect(clock.read(5, 9000)).toBeCloseTo(8);
  });

  test('a slide that arrives or a jump that lands while paused holds from the pause; a new step or a jump runs again', () => {
    const clock = new AmbientClock();
    clock.pause(1000);
    clock.hold(1500);
    expect(clock.read(4, 7000)).toBe(4);
    clock.resume(7000);
    expect(clock.read(4, 7000)).toBeCloseTo(4);
    expect(clock.read(4, 7400)).toBeCloseTo(4.4);
    clock.pause(8000);
    clock.play(8500); // a step that starts keeps the pause (the player resumes first, to play on)
    expect(clock.paused).toBe(true);
    clock.resume(8600);
    clock.pause(9000);
    clock.reset();
    expect(clock.paused).toBe(false);
    expect(clock.read(2, 9100)).toBe(2);
  });
});
