// The Share box's links: to the moment, to the slide, to the presenter's view of it, and an <iframe> that plays the scene on screen
// alone. Pure, so it is tested without a browser (share.test.ts).
import { escapeHtml } from './moments';

export type ShareInput = {
  title: string;
  /** The scene this player is limited to (an embed), if any. */
  scene?: string;
  /** The scene on screen now, for the embed of a full-video player. */
  sceneOnScreen: string;
  t: number;
  /** The slide on screen, 0-based; -1 before the first. */
  slide: number;
};

/** `where` is location (origin 'null' is a page without one, such as an artifact's frame). */
export function shareLinks(where: { origin: string; pathname: string; search: string }, s: ShareInput): { moment: string; slide: string; presenter: string; embed: string } {
  const base = `${where.origin === 'null' ? '' : where.origin}${where.pathname}`;
  const keep = new URLSearchParams(where.search);
  for (const k of ['t', 'slide', 'mode', 'view', 'scene']) keep.delete(k);
  const url = (params: Record<string, string>) => {
    const q = new URLSearchParams(keep);
    for (const [k, v] of Object.entries(params)) q.set(k, v);
    return `${base}?${q}`;
  };
  const embed: Record<string, string> = s.scene ? { scene: s.scene } : {};
  const scene = s.scene ?? s.sceneOnScreen;
  const slide = String(Math.max(1, s.slide + 1));
  return {
    moment: url({ ...embed, t: s.t.toFixed(2) }),
    slide: url({ ...embed, mode: 'slides', slide }),
    presenter: url({ ...embed, view: 'presenter', slide }),
    embed: `<iframe src="${escapeHtml(url({ scene }))}" width="960" height="540" style="border:0" allow="autoplay; fullscreen" allowfullscreen title="${escapeHtml(`${s.title}: ${scene}`)}"></iframe>`,
  };
}
