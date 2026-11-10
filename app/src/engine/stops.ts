// Stops: the moments a deck pauses on (the player's slides mode, scripts/slides.ts). A scene names its
// own (Scene.stops(), scene-local: where each of its beats is fully built); a scene that names none
// stops on its last frame. Kept free of the DOM so it can be unit-tested.

/** One frame at 60 fps, s: a stop sits a frame before the motion that follows it. */
export const FRAME = 1 / 60;

export type Stop = { t: number; scene: string };
type Placed = { id: string; start: number; end: number };

/**
 * Every stop in video time, ascending. A stop never lands in a crossfade, where two scenes show at
 * once: one inside the fade-in is moved to where it completes, and one inside (or past) the fade-out
 * to the frame before the next entry starts. `own` holds each loaded scene's stops (scene-local);
 * entries missing from it (not loaded) have none.
 */
export function placeStops(timeline: Placed[], own: Map<string, number[]>): Stop[] {
  const stops: Stop[] = [];
  timeline.forEach((entry, i) => {
    const local = own.get(entry.id);
    if (!local) return;
    const prev = timeline[i - 1], next = timeline[i + 1];
    const first = prev && prev.end > entry.start ? prev.end : entry.start;
    const last = Math.max(first, Math.min(entry.end, next?.start ?? entry.end) - FRAME);
    const times = local.length ? local.map((s) => Math.max(first, Math.min(last, entry.start + s))) : [last];
    for (const t of times) if (!stops.some((s) => Math.abs(s.t - t) < FRAME / 2)) stops.push({ t, scene: entry.id });
  });
  return stops.sort((a, b) => a.t - b.t);
}
