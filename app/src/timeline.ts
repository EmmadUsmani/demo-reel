// The edits: one per project, collected from projects/<name>/timeline.ts (vite.config.ts `edits()`).
// Entries that overlap crossfade; entries that touch hard-cut. Choose one with ?edit=<name> (preview,
// player) or --edit <name> (scripts). A built player (scripts/build.ts) holds exactly one.
import type { Edit } from './engine/edit';
import found from 'virtual:edits';

export const EDITS: Record<string, Edit> = found;
