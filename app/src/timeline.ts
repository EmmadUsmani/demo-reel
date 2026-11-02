// The edits: one per project, collected from projects/<name>/timeline.ts. Entries that overlap
// crossfade; entries that touch hard-cut. Choose one with ?edit=<name> (preview) or --edit <name>.
import type { Edit } from './engine/edit';

const found = import.meta.glob<{ default: Edit }>('../../projects/*/timeline.ts', { eager: true });

export const EDITS: Record<string, Edit> = Object.fromEntries(
  Object.entries(found).map(([path, module]) => [path.match(/projects\/([^/]+)\/timeline\.ts$/)![1]!, module.default]),
);
