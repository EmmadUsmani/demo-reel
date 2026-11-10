// What the player's URL asks for: the query string, and the #name a host that passes only a #name to the
// page (a Claude artifact) uses instead. Pure, so it is tested without a browser (params.test.ts).
import type { Mode } from './player';

export type PlayerParams = {
  /** The edit to play (the dev server holds all of them), if named. */
  edit: string | null;
  mode: Mode;
  /** Play only this timeline entry (an embed). */
  scene?: string;
  /** Slides mode: open on this slide, 1-based. */
  slide?: number;
  /** Start (and show the poster) at this time, s. */
  t?: number;
  captions: boolean;
  /** False for the soundtrack without the voice. */
  narration: boolean;
};

/** `search` is location.search, `hash` is location.hash; a hash name wins over the query it stands for. */
export function parseParams(search: string, hash: string): PlayerParams {
  const params = new URLSearchParams(search);
  const name = hash.replace(/^#/, '');
  if (name === 'slides') params.set('mode', 'slides');
  else if (/^slide-\d+$/.test(name)) { params.set('mode', 'slides'); params.set('slide', name.slice(6)); }
  else if (name.startsWith('scene-')) params.set('scene', name.slice(6));
  return {
    edit: params.get('edit'),
    mode: params.get('mode') === 'slides' ? 'slides' : 'video',
    scene: params.get('scene') || undefined,
    slide: params.has('slide') ? +params.get('slide')! : undefined,
    t: params.has('t') ? +params.get('t')! : undefined,
    captions: params.get('captions') === '1',
    narration: params.get('narration') !== '0',
  };
}
