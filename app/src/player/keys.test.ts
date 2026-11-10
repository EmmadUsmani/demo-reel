import { describe, expect, test } from 'bun:test';
import { FRAME_STEP, keyCommand, SEEK_STEP } from './keys';

describe('keyCommand: video', () => {
  test('space and k play and pause', () => {
    expect(keyCommand(' ', false, 'video')).toEqual({ kind: 'toggle' });
    expect(keyCommand('k', false, 'video')).toEqual({ kind: 'toggle' });
  });

  test('arrows seek five seconds, shift-arrows one frame', () => {
    expect(keyCommand('ArrowRight', false, 'video')).toEqual({ kind: 'seekBy', by: SEEK_STEP });
    expect(keyCommand('ArrowLeft', false, 'video')).toEqual({ kind: 'seekBy', by: -SEEK_STEP });
    expect(keyCommand('ArrowRight', true, 'video')).toEqual({ kind: 'seekBy', by: FRAME_STEP });
    expect(keyCommand('ArrowLeft', true, 'video')).toEqual({ kind: 'seekBy', by: -FRAME_STEP });
    expect(SEEK_STEP).toBe(5);
    expect(FRAME_STEP).toBeCloseTo(1 / 60);
  });

  test('Home goes to the start; End, Enter, PageDown and Backspace do nothing', () => {
    expect(keyCommand('Home', false, 'video')).toEqual({ kind: 'seekStart' });
    for (const key of ['End', 'Enter', 'PageDown', 'PageUp', 'Backspace']) expect(keyCommand(key, false, 'video'), key).toBeNull();
  });

  test('the toggles', () => {
    expect(keyCommand('n', false, 'video')).toEqual({ kind: 'narration' });
    expect(keyCommand('c', false, 'video')).toEqual({ kind: 'captions' });
    expect(keyCommand('s', false, 'video')).toEqual({ kind: 'notes' });
    expect(keyCommand('v', false, 'video')).toEqual({ kind: 'mode' });
    expect(keyCommand('m', false, 'video')).toEqual({ kind: 'mute' });
    expect(keyCommand('f', false, 'video')).toEqual({ kind: 'fullscreen' });
    expect(keyCommand('Escape', false, 'video')).toEqual({ kind: 'closeShare' });
  });

  test('other keys are left to the browser', () => {
    for (const key of ['a', 'x', 'Tab', 'ArrowUp', 'ArrowDown', '1', 'F5', 'Shift', '']) expect(keyCommand(key, false, 'video'), key).toBeNull();
  });

  test('keys are case-sensitive: with caps lock, a shortcut does not fire', () => {
    for (const key of ['K', 'N', 'C', 'S', 'V', 'M', 'F']) expect(keyCommand(key, false, 'video'), key).toBeNull();
  });
});

describe('keyCommand: slides', () => {
  test('right, page down and enter go forward', () => {
    for (const key of ['ArrowRight', 'PageDown', 'Enter']) expect(keyCommand(key, false, 'slides'), key).toEqual({ kind: 'next' });
  });

  test('left, page up and backspace go back', () => {
    for (const key of ['ArrowLeft', 'PageUp', 'Backspace']) expect(keyCommand(key, false, 'slides'), key).toEqual({ kind: 'prev' });
  });

  test('shift does not turn a step into a frame step', () => {
    expect(keyCommand('ArrowRight', true, 'slides')).toEqual({ kind: 'next' });
    expect(keyCommand('ArrowLeft', true, 'slides')).toEqual({ kind: 'prev' });
  });

  test('Home and End jump to the first (the start) and last slide', () => {
    expect(keyCommand('Home', false, 'slides')).toEqual({ kind: 'slide', to: 'first' });
    expect(keyCommand('End', false, 'slides')).toEqual({ kind: 'slide', to: 'last' });
  });

  test('space and k pause and resume (they used to step forward)', () => {
    for (const key of [' ', 'k']) expect(keyCommand(key, false, 'slides'), key).toEqual({ kind: 'pause' });
    for (const key of [' ', 'k']) expect(keyCommand(key, false, 'video'), key).toEqual({ kind: 'toggle' });
  });

  test('the toggles work the same', () => {
    expect(keyCommand('n', false, 'slides')).toEqual({ kind: 'narration' });
    expect(keyCommand('s', false, 'slides')).toEqual({ kind: 'notes' });
    expect(keyCommand('v', false, 'slides')).toEqual({ kind: 'mode' });
  });
});
