// The preview / export page's pure parts (main.ts): its URL, and what its keys do. Tested without a
// browser (preview.test.ts).
type Entry = { id: string; start: number; end: number };

export type PreviewParams = {
  /** ?export=1 (any value): the bare canvas and the window.__video API that scripts/render.ts drives. */
  export: boolean;
  /** ?only=a,b: load just these timeline entries. */
  only: Set<string> | null;
  edit: string | null;
  /** ?t=: where the preview opens, s; null when missing or not a number. */
  from: number | null;
};

export function parsePreview(search: string): PreviewParams {
  const params = new URLSearchParams(search);
  const only = params.get('only');
  const from = parseFloat(params.get('t') ?? '');
  return {
    export: params.has('export'),
    only: only ? new Set(only.split(',')) : null,
    edit: params.get('edit'),
    from: Number.isNaN(from) ? null : from,
  };
}

export type PreviewAction =
  | { kind: 'toggle' }
  | { kind: 'seek'; t: number }
  | { kind: 'loop' }
  | { kind: 'hide' };

/** The span of the entry on screen at `t` (the first, where entries overlap), which `l` loops. */
export function loopRange(timeline: Entry[], t: number): [number, number] | null {
  const e = timeline.find((x) => t >= x.start && t < x.end);
  return e ? [e.start, e.end] : null;
}

/** What a key does (KeyboardEvent.key) at time `t`, or null when the preview ignores it. */
export function previewKey(key: string, shift: boolean, t: number, timeline: Entry[]): PreviewAction | null {
  switch (key) {
    case ' ': return { kind: 'toggle' };
    case 'ArrowRight': return { kind: 'seek', t: t + (shift ? 5 : 1) };
    case 'ArrowLeft': return { kind: 'seek', t: t - (shift ? 5 : 1) };
    case '.': return { kind: 'seek', t: t + 1 / 60 };
    case ',': return { kind: 'seek', t: t - 1 / 60 };
    case 'l': return { kind: 'loop' };
    case 'h': return { kind: 'hide' };
    case ']': { const e = timeline.find((x) => x.start > t + 0.01); return e ? { kind: 'seek', t: e.start } : null; }
    case '[': { const e = timeline.filter((x) => x.start < t - 0.3).at(-1); return e ? { kind: 'seek', t: e.start } : null; }
    default: return null;
  }
}
