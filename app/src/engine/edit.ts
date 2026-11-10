// What a project hands the engine: its timeline, and optionally its own theme. Each project keeps
// its edit in projects/<name>/timeline.ts (default export); app/src/timeline.ts collects them all.
import type { TimelineEntry } from './engine';
import { entriesOver, type Loaders } from './entries';
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

// The reusable cards (title, chapter, end) every project can use by name.
const shared = import.meta.glob<{ default: SceneClass }>('../scenes/*.ts') as Loaders;

/**
 * Builds a project's entry helper from its own scenes (`import.meta.glob('./scenes/*.ts')` in the
 * project's timeline.ts). A scene name resolves to the project's own scenes/<name>.ts first, then to
 * the shared one in app/src/scenes/. `params` configure a reusable scene; see each card's header.
 */
export const entries = entriesOver(shared);
