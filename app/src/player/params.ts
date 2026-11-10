// What the player's URL asks for: the query string, and the #name a host that passes only a #name to the
// page (a Claude artifact) uses instead. Pure, so it is tested without a browser (params.test.ts).
import type { Mode } from './player';

/** The page: the player, or the presenter's view of the same deck. */
export type View = 'player' | 'presenter';

export type PlayerParams = {
  /** The edit to play (the dev server holds all of them), if named. */
  edit: string | null;
  /** The mode the URL asks for; none leaves it to the edit (`startOf`). */
  mode?: Mode;
  view: View;
  /** Play only this timeline entry (an embed). */
  scene?: string;
  /** Slides mode and the presenter view: open on this slide, 1-based. */
  slide?: number;
  /** Start (and show the poster) at this time, s. */
  t?: number;
  captions: boolean;
  /** False for the soundtrack without the voice; none leaves it to the edit (`startOf`). */
  narration?: boolean;
};

/** A number from a URL value, or undefined when it is empty or not a number (`+'abc'` is NaN, which would reach the clock). */
function numberOf(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const n = +value;
  return Number.isNaN(n) ? undefined : n;
}

/** `search` is location.search, `hash` is location.hash; a hash name wins over the query it stands for. */
export function parseParams(search: string, hash: string): PlayerParams {
  const params = new URLSearchParams(search);
  const name = hash.replace(/^#/, '');
  if (name === 'slides') params.set('mode', 'slides');
  else if (/^slide-\d+$/.test(name)) { params.set('mode', 'slides'); params.set('slide', name.slice(6)); }
  else if (name === 'presenter') params.set('view', 'presenter');
  else if (/^presenter-\d+$/.test(name)) { params.set('view', 'presenter'); params.set('slide', name.slice(10)); }
  else if (name.startsWith('scene-')) params.set('scene', name.slice(6));
  const narration = params.get('narration');
  const slide = numberOf(params.get('slide'));
  return {
    edit: params.get('edit'),
    mode: ['video', 'slides'].includes(params.get('mode')!) ? (params.get('mode') as Mode) : undefined,
    view: params.get('view') === 'presenter' ? 'presenter' : 'player',
    scene: params.get('scene') || undefined,
    slide: slide === undefined ? undefined : Math.floor(slide),
    t: numberOf(params.get('t')),
    captions: params.get('captions') === '1',
    narration: narration === null ? undefined : narration !== '0',
  };
}

/** The mode and narration the player starts with: what the URL chose, else what the edit is (a deck: slides, narration off). */
export function startOf(params: Pick<PlayerParams, 'mode' | 'narration'>, edit: { deck?: boolean }): { mode: Mode; narration: boolean } {
  return { mode: params.mode ?? (edit.deck ? 'slides' : 'video'), narration: params.narration ?? !edit.deck };
}
