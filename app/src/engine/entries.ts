// How a timeline entry names its scene: the project's own scenes/<name>.ts first, then the shared
// card of that name. Split from edit.ts (which globs the shared cards at build time) so it can be
// tested without Vite.
import type { TimelineEntry } from './engine';
import type { SceneClass } from './scene';

export type Loaders = Record<string, () => Promise<{ default: SceneClass }>>;
export type Options = { dur?: number; overlap?: number; params?: Record<string, any> };

/** Builds `entries` over the shared cards (a glob of app/src/scenes/*.ts). */
export function entriesOver(shared: Loaders) {
  return (globbed: Record<string, () => Promise<unknown>>) => {
    const local = globbed as Loaders;
    const load = (name: string) => () => {
      const found = local[`./scenes/${name}.ts`] ?? shared[`../scenes/${name}.ts`];
      return found ? found() : Promise.reject(new Error(`scene module not found: '${name}' (looked in the project's scenes/ and app/src/scenes/)`));
    };
    return (id: string, file: string, { dur, overlap, params }: Options = {}): TimelineEntry =>
      ({ id, load: load(file), start: 0, end: 0, dur, overlap, params });
  };
}
