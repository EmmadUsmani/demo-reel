// Which projects' code ends up in a built player, and so whose footage it needs. A timeline may reuse
// another project's scenes (they load that project's footage by its name), so the footage to ship follows
// the modules the bundler kept, not the name of the edit. Pure, so the vite config can import it.
import { existsSync } from 'node:fs';
import path from 'node:path';

/** The project a module id lives in: projects/<name>/... under `root`, ignoring a `?query` and Windows separators. */
export function projectOf(id: string, root: string): string | undefined {
  const file = id.split('?')[0]!.replaceAll('\\', '/');
  const prefix = `${root.replaceAll('\\', '/').replace(/\/$/, '')}/projects/`;
  if (!file.startsWith(prefix)) return undefined;
  return file.slice(prefix.length).split('/')[0] || undefined;
}

/** The projects (sorted, once each) the module ids come from. */
export function projectsOf(ids: string[], root: string): string[] {
  return [...new Set(ids.map((id) => projectOf(id, root)).filter((name): name is string => !!name))].sort();
}

/** Of those projects, the ones with captured footage (a footage/manifest.json): the rest contribute none. */
export function withFootage(names: string[], projectsDir: string): string[] {
  return names.filter((name) => existsSync(path.join(projectsDir, name, 'footage', 'manifest.json')));
}
