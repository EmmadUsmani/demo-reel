// Which caption, note lines, scene and start time go with a moment of the video. Pure, so it is tested
// without a browser (moments.test.ts).

/** A line of narration as written, timed to its speech (captions.json), s. */
export type Caption = { at: number; end: number; text: string };
type Span = { start: number; end: number };

/** The caption on screen at `t`: the first line whose speech covers it. */
export function captionAt(captions: Caption[], t: number): Caption | undefined {
  return captions.find((c) => t >= c.at && t < c.end);
}

/** The lines said on the way to slide `k` (0-based): after the previous stop, up to and including this one. */
export function notesFor(captions: Caption[], stops: number[], from: number, k: number): Caption[] {
  if (k < 0) return [];
  return captions.filter((c) => c.at > (stops[k - 1] ?? from) - 1e-6 && c.at <= stops[k]!);
}

/** The scene on screen at `t`: of overlapping entries (a crossfade), the later one. */
export function sceneAt(timeline: (Span & { id: string })[], t: number): string | undefined {
  return timeline.filter((e) => t >= e.start && t < e.end).at(-1)?.id;
}

/** The frame shown before the first play when the edit names no poster: the first stop, else the end of the first scene. */
export function posterTime(stops: number[], timeline: Span[], to: number): number {
  const [first, second] = timeline;
  return stops[0] ?? Math.max(0, Math.min(second?.start ?? to, first?.end ?? to) - 1 / 60);
}

/** Where the player starts, s: `t` if given, else (an embed) its last stop, else the edit's poster. */
export function startTime(o: { from: number; to: number; t?: number; embed: boolean; stops: number[]; poster?: number; timeline: Span[] }): number {
  const wanted = o.t ?? (o.embed ? o.stops.at(-1) ?? o.from : o.poster ?? posterTime(o.stops, o.timeline, o.to));
  return Math.min(o.to - 1e-3, Math.max(o.from, wanted));
}

/** m:ss */
export const clockText = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
