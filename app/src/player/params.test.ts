import { describe, expect, test } from 'bun:test';
import { parseParams } from './params';

describe('parseParams', () => {
  test('no query: a full video, narration on, captions off', () => {
    expect(parseParams('', '')).toEqual({ edit: null, mode: 'video', scene: undefined, slide: undefined, t: undefined, captions: false, narration: true });
  });

  test('every query parameter', () => {
    const p = parseParams('?edit=news-digest&mode=slides&slide=7&scene=pacing&t=12.5&captions=1&narration=0', '');
    expect(p).toEqual({ edit: 'news-digest', mode: 'slides', scene: 'pacing', slide: 7, t: 12.5, captions: true, narration: false });
  });

  test('only mode=slides is slides; any other mode is video', () => {
    expect(parseParams('?mode=slides', '').mode).toBe('slides');
    expect(parseParams('?mode=video', '').mode).toBe('video');
    expect(parseParams('?mode=SLIDES', '').mode).toBe('video');
    expect(parseParams('?mode=', '').mode).toBe('video');
  });

  test('captions are on only for exactly 1; narration is off only for exactly 0', () => {
    for (const v of ['0', 'true', 'yes', '', '2']) expect(parseParams(`?captions=${v}`, '').captions).toBe(false);
    for (const v of ['1']) expect(parseParams(`?captions=${v}`, '').captions).toBe(true);
    for (const v of ['1', 'false', 'off', '', '00']) expect(parseParams(`?narration=${v}`, '').narration).toBe(true);
    expect(parseParams('?narration=0', '').narration).toBe(false);
  });

  test('#slides opens slides mode', () => {
    expect(parseParams('', '#slides')).toMatchObject({ mode: 'slides', slide: undefined });
  });

  test('#slide-N opens slides mode on slide N', () => {
    expect(parseParams('', '#slide-4')).toMatchObject({ mode: 'slides', slide: 4 });
    expect(parseParams('', '#slide-12')).toMatchObject({ mode: 'slides', slide: 12 });
  });

  test('#scene-ID is an embed of that scene, and the ID may carry dashes', () => {
    expect(parseParams('', '#scene-pacing')).toMatchObject({ scene: 'pacing', mode: 'video' });
    expect(parseParams('', '#scene-how-it-works')).toMatchObject({ scene: 'how-it-works' });
  });

  test('a hash name wins over the query it stands for; the rest of the query stays', () => {
    const p = parseParams('?scene=a&slide=2&captions=1&t=9', '#slide-5');
    expect(p).toMatchObject({ mode: 'slides', slide: 5, scene: 'a', captions: true, t: 9 });
    expect(parseParams('?scene=a', '#scene-b').scene).toBe('b');
    expect(parseParams('?mode=video', '#slides').mode).toBe('slides');
  });

  test('a hash that names nothing is ignored', () => {
    for (const hash of ['#', '#foo', '#slide-', '#slide-x', '#slide-1x', '#slide--3', '#slide-1.5', '#slides-2', '#Slides', '#scenes', '#t=5']) {
      expect(parseParams('?t=3', hash), hash).toEqual(parseParams('?t=3', ''));
    }
  });

  test('the hash may come with or without its #', () => {
    expect(parseParams('', 'slides').mode).toBe('slides');
    expect(parseParams('', 'scene-x').scene).toBe('x');
  });

  test('an empty scene is no scene (the whole video)', () => {
    expect(parseParams('?scene=', '').scene).toBeUndefined();
    expect(parseParams('', '#scene-').scene).toBeUndefined();
  });

  test('values are decoded', () => {
    expect(parseParams('?scene=a%20b&edit=my%2Dedit', '')).toMatchObject({ scene: 'a b', edit: 'my-edit' });
  });

  test('t is a number of seconds: fractional, zero or negative are kept', () => {
    expect(parseParams('?t=0', '').t).toBe(0);
    expect(parseParams('?t=.5', '').t).toBe(0.5);
    expect(parseParams('?t=-3', '').t).toBe(-3);
    expect(parseParams('?t=1e2', '').t).toBe(100);
  });

  test('a t that is empty or not a number is no t (it would otherwise reach the clock as NaN)', () => {
    for (const t of ['', ' ', 'abc', 'NaN', '12s', '1:30']) expect(parseParams(`?t=${t}`, '').t, t).toBeUndefined();
  });

  test('a slide is a whole number; a fractional one is rounded down, and nonsense is no slide', () => {
    expect(parseParams('?slide=3', '').slide).toBe(3);
    expect(parseParams('?slide=2.9', '').slide).toBe(2);
    expect(parseParams('?slide=0', '').slide).toBe(0);
    expect(parseParams('?slide=-2', '').slide).toBe(-2);
    for (const slide of ['', 'abc', 'NaN', 'three']) expect(parseParams(`?slide=${slide}`, '').slide, slide).toBeUndefined();
  });
});
