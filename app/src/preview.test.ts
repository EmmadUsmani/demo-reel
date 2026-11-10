import { describe, expect, test } from 'bun:test';
import { loopRange, parsePreview, previewKey } from './preview';

const timeline = [{ id: 'a', start: 0, end: 10 }, { id: 'b', start: 9, end: 20 }, { id: 'c', start: 20, end: 30 }];

describe('parsePreview', () => {
  test('no query: the preview player', () => {
    expect(parsePreview('')).toEqual({ export: false, only: null, edit: null, from: null });
  });

  test('?export (with any value, even 0) is export mode', () => {
    expect(parsePreview('?export=1').export).toBe(true);
    expect(parsePreview('?export').export).toBe(true);
    expect(parsePreview('?export=0').export).toBe(true);
  });

  test('?only is a set of entry ids', () => {
    expect(parsePreview('?only=a,b').only).toEqual(new Set(['a', 'b']));
    expect(parsePreview('?only=').only).toBeNull();
  });

  test('?t starts the preview there; 0 and a missing t both start at the beginning (null)', () => {
    expect(parsePreview('?t=12.5').from).toBe(12.5);
    expect(parsePreview('?t=0').from).toBe(0);
    expect(parsePreview('?t=').from).toBeNull();
  });

  test('?edit names the edit', () => {
    expect(parsePreview('?edit=todomvc&export=1')).toMatchObject({ edit: 'todomvc', export: true });
  });
});

describe('previewKey', () => {
  test('space plays and pauses', () => {
    expect(previewKey(' ', false, 5, timeline)).toEqual({ kind: 'toggle' });
  });

  test('arrows seek one second, shift-arrows five', () => {
    expect(previewKey('ArrowRight', false, 5, timeline)).toEqual({ kind: 'seek', t: 6 });
    expect(previewKey('ArrowLeft', false, 5, timeline)).toEqual({ kind: 'seek', t: 4 });
    expect(previewKey('ArrowRight', true, 5, timeline)).toEqual({ kind: 'seek', t: 10 });
    expect(previewKey('ArrowLeft', true, 5, timeline)).toEqual({ kind: 'seek', t: 0 });
  });

  test('. and , step a frame', () => {
    expect(previewKey('.', false, 5, timeline)).toEqual({ kind: 'seek', t: 5 + 1 / 60 });
    expect(previewKey(',', false, 5, timeline)).toEqual({ kind: 'seek', t: 5 - 1 / 60 });
  });

  test('] goes to the next scene start, and does nothing after the last', () => {
    expect(previewKey(']', false, 0, timeline)).toEqual({ kind: 'seek', t: 9 });
    expect(previewKey(']', false, 9, timeline)).toEqual({ kind: 'seek', t: 20 }); // a scene starting here is not "next"
    expect(previewKey(']', false, 25, timeline)).toBeNull();
  });

  test('[ goes to the start of the scene being watched, or the one before in its first 0.3 s', () => {
    expect(previewKey('[', false, 25, timeline)).toEqual({ kind: 'seek', t: 20 });
    expect(previewKey('[', false, 20.2, timeline)).toEqual({ kind: 'seek', t: 9 });
    expect(previewKey('[', false, 0.2, timeline)).toBeNull();
  });

  test('l loops, h hides the controls, other keys are ignored', () => {
    expect(previewKey('l', false, 0, timeline)).toEqual({ kind: 'loop' });
    expect(previewKey('h', false, 0, timeline)).toEqual({ kind: 'hide' });
    for (const k of ['k', 'n', 'Home', 'Enter', 'Escape']) expect(previewKey(k, false, 0, timeline), k).toBeNull();
  });
});

describe('loopRange', () => {
  test('the span of the scene on screen; the first of two overlapping', () => {
    expect(loopRange(timeline, 5)).toEqual([0, 10]);
    expect(loopRange(timeline, 9.5)).toEqual([0, 10]);
    expect(loopRange(timeline, 10)).toEqual([9, 20]);
  });
  test('none outside the timeline', () => {
    expect(loopRange(timeline, 30)).toBeNull();
    expect(loopRange([], 0)).toBeNull();
  });
});
