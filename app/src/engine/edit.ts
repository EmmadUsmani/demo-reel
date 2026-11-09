// What a project hands the engine: its timeline, and optionally its own theme. Each project keeps
// its edit in projects/<name>/timeline.ts (default export); app/src/timeline.ts collects them all.
import type { TimelineEntry } from './engine';
import type { Theme } from './palette';
import type { SceneClass } from './scene';

export type Edit = {
  timeline: () => TimelineEntry[];
  theme?: Theme;
  /** What the HTML player calls the video (its page title); the project's name when omitted. */
  title?: string;
  /** The frame the player shows before the first play: `at` seconds into the entry `scene`. */
  poster?: { scene: string; at: number };
};

type Loaders = Record<string, () => Promise<{ default: SceneClass }>>;
type Options = { dur?: number; overlap?: number; params?: Record<string, any> };

// The reusable cards (title, chapter, end) every project can use by name.
const shared = import.meta.glob<{ default: SceneClass }>('../scenes/*.ts') as Loaders;

/**
 * Builds a project's entry helper from its own scenes (`import.meta.glob('./scenes/*.ts')` in the
 * project's timeline.ts). A scene name resolves to the project's own scenes/<name>.ts first, then to
 * the shared one in app/src/scenes/. `params` configure a reusable scene; see each card's header.
 */
export function entries(globbed: Record<string, () => Promise<unknown>>) {
  const local = globbed as Loaders;
  const load = (name: string) => () => {
    const found = local[`./scenes/${name}.ts`] ?? shared[`../scenes/${name}.ts`];
    return found ? found() : Promise.reject(new Error(`scene module not found: '${name}' (looked in the project's scenes/ and app/src/scenes/)`));
  };
  return (id: string, file: string, { dur, overlap, params }: Options = {}): TimelineEntry =>
    ({ id, load: load(file), start: 0, end: 0, dur, overlap, params });
}
