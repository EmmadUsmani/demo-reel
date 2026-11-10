import { describe, expect, test } from 'bun:test';
import { parseParams, startOf, viewHash } from './params';

describe('parseParams', () => {
  test('no query: nothing chosen (the edit decides mode and narration), captions off', () => {
    expect(parseParams('', '')).toEqual({ edit: null, mode: undefined, view: 'player', scene: undefined, slide: undefined, t: undefined, captions: false, narration: undefined });
  });

  test('every query parameter', () => {
    const p = parseParams('?edit=news-digest&mode=slides&slide=7&scene=pacing&t=12.5&captions=1&narration=0', '');
    expect(p).toEqual({ edit: 'news-digest', mode: 'slides', view: 'player', scene: 'pacing', slide: 7, t: 12.5, captions: true, narration: false });
  });

  test('mode is slides or video as written; anything else is no choice', () => {
    expect(parseParams('?mode=slides', '').mode).toBe('slides');
    expect(parseParams('?mode=video', '').mode).toBe('video');
    for (const v of ['SLIDES', '', 'deck']) expect(parseParams(`?mode=${v}`, '').mode, v).toBeUndefined();
  });

  test('captions are on only for exactly 1; narration is off only for exactly 0', () => {
    for (const v of ['0', 'true', 'yes', '', '2']) expect(parseParams(`?captions=${v}`, '').captions).toBe(false);
    for (const v of ['1']) expect(parseParams(`?captions=${v}`, '').captions).toBe(true);
    for (const v of ['1', 'false', 'off', '', '00']) expect(parseParams(`?narration=${v}`, '').narration).toBe(true);
    expect(parseParams('?narration=0', '').narration).toBe(false);
    expect(parseParams('', '').narration).toBeUndefined();
  });

  test('#slides opens slides mode', () => {
    expect(parseParams('', '#slides')).toMatchObject({ mode: 'slides', slide: undefined });
  });

  test('#slide-N opens slides mode on slide N', () => {
    expect(parseParams('', '#slide-4')).toMatchObject({ mode: 'slides', slide: 4 });
    expect(parseParams('', '#slide-12')).toMatchObject({ mode: 'slides', slide: 12 });
  });

  test('#scene-ID is an embed of that scene, and the ID may carry dashes', () => {
    expect(parseParams('', '#scene-pacing')).toMatchObject({ scene: 'pacing', mode: undefined });
    expect(parseParams('', '#scene-how-it-works')).toMatchObject({ scene: 'how-it-works' });
  });

  test('a hash name wins over the query it stands for; the rest of the query stays', () => {
    const p = parseParams('?scene=a&slide=2&captions=1&t=9', '#slide-5');
    expect(p).toMatchObject({ mode: 'slides', slide: 5, scene: 'a', captions: true, t: 9 });
    expect(parseParams('?scene=a', '#scene-b').scene).toBe('b');
    expect(parseParams('?mode=video', '#slides').mode).toBe('slides');
  });

  test('#slides and #slide-N are the audience view even when the query says ?view=presenter', () => {
    expect(parseParams('?view=presenter', '#slides').view).toBe('player');
    expect(parseParams('?view=presenter&slide=2', '#slide-5')).toMatchObject({ view: 'player', mode: 'slides', slide: 5 });
  });

  test('#presenter and #presenter-N are the presenter view, and win over ?mode=', () => {
    expect(parseParams('?mode=video', '#presenter')).toMatchObject({ view: 'presenter', mode: undefined });
    expect(parseParams('?mode=slides&slide=2', '#presenter-6')).toMatchObject({ view: 'presenter', mode: undefined, slide: 6 });
    expect(parseParams('?view=presenter', '#presenter-3')).toMatchObject({ view: 'presenter', slide: 3 });
  });

  test('a bare view name means no slide, whatever slide the query names', () => {
    expect(parseParams('?slide=4', '#presenter').slide).toBeUndefined();
    expect(parseParams('?slide=4', '#slides').slide).toBeUndefined();
    expect(parseParams('?slide=4', '#slide-2').slide).toBe(2);
  });

  test('a hash that names nothing is ignored', () => {
    for (const hash of ['#', '#foo', '#slide-', '#slide-x', '#slide-1x', '#slide--3', '#slide-1.5', '#slides-2', '#Slides', '#presenter-', '#presenter-x', '#presenter-2x', '#presenters', '#Presenter', '#scenes', '#t=5']) {
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

  test('?view=presenter is the presenter view; any other view is the player', () => {
    expect(parseParams('?view=presenter', '').view).toBe('presenter');
    for (const v of ['player', 'Presenter', '', 'slides']) expect(parseParams(`?view=${v}`, '').view, v).toBe('player');
    expect(parseParams('', '').view).toBe('player');
  });

  test('#presenter opens the presenter view, and #presenter-N on slide N', () => {
    expect(parseParams('', '#presenter')).toMatchObject({ view: 'presenter', slide: undefined });
    expect(parseParams('', '#presenter-3')).toMatchObject({ view: 'presenter', slide: 3 });
    expect(parseParams('?slide=9&edit=x', '#presenter-3')).toMatchObject({ view: 'presenter', slide: 3, edit: 'x' });
    expect(parseParams('', 'presenter-12')).toMatchObject({ view: 'presenter', slide: 12 });
  });

  test('the presenter view leaves mode alone: it always works in slides terms itself', () => {
    expect(parseParams('?view=presenter&mode=video', '').mode).toBe('video');
  });
});

describe('startOf', () => {
  test('a video edit: video mode, narration on', () => {
    expect(startOf({}, {})).toEqual({ mode: 'video', narration: true });
    expect(startOf({}, { deck: false })).toEqual({ mode: 'video', narration: true });
  });

  test('a deck edit: slides mode, narration off', () => {
    expect(startOf({}, { deck: true })).toEqual({ mode: 'slides', narration: false });
  });

  test('what the URL chose wins over the edit, on a deck and on a video', () => {
    expect(startOf({ mode: 'video' }, { deck: true }).mode).toBe('video');
    expect(startOf({ narration: true }, { deck: true }).narration).toBe(true);
    expect(startOf({ mode: 'slides' }, {}).mode).toBe('slides');
    expect(startOf({ narration: false }, {}).narration).toBe(false);
  });

  test('through the parser: ?mode=video on a deck, #slides on a video, and no choice at all', () => {
    expect(startOf(parseParams('?mode=video', ''), { deck: true }).mode).toBe('video');
    expect(startOf(parseParams('', '#slide-2'), {}).mode).toBe('slides');
    expect(startOf(parseParams('?narration=0', ''), { deck: true }).narration).toBe(false);
    expect(startOf(parseParams('?narration=1', ''), { deck: true }).narration).toBe(true);
    expect(startOf(parseParams('', ''), { deck: true })).toEqual({ mode: 'slides', narration: false });
  });
});

describe('viewHash', () => {
  test('names the view on a slide, 1-based, and the bare view before the first slide', () => {
    expect(viewHash('presenter', 2)).toBe('presenter-3');
    expect(viewHash('player', 0)).toBe('slide-1');
    expect(viewHash('presenter', -1)).toBe('presenter');
    expect(viewHash('player', -1)).toBe('slides');
  });

  test('is what parseParams reads back: the same view on the same slide, over any query', () => {
    for (const [view, slide] of [['presenter', 4], ['player', 4], ['presenter', -1], ['player', -1]] as const) {
      const p = parseParams('?edit=x&view=presenter&mode=video&slide=9', `#${viewHash(view, slide)}`);
      expect([p.view, p.slide].join(), `${view} ${slide}`).toBe([view, slide < 0 ? undefined : slide + 1].join());
    }
  });
});
