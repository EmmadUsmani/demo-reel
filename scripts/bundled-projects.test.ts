import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectOf, projectsOf, withFootage } from './bundled-projects';
import { tempDir } from './test-support';

const ROOT = '/repo';

describe('projectOf', () => {
  test('is the project a module lives in', () => {
    expect(projectOf('/repo/projects/news-digest/scenes/hook.ts', ROOT)).toBe('news-digest');
    expect(projectOf('/repo/projects/todomvc/timeline.ts?v=3', ROOT)).toBe('todomvc');
    expect(projectOf('C:\\repo\\projects\\vite\\timeline.ts', 'C:\\repo')).toBe('vite');
  });

  test('is nothing for shared code, other roots, virtual modules or a file straight in projects/', () => {
    expect(projectOf('/repo/app/src/engine/engine.ts', ROOT)).toBeUndefined();
    expect(projectOf('/elsewhere/projects/x/a.ts', ROOT)).toBeUndefined();
    expect(projectOf('/repo/projectsX/x/a.ts', ROOT)).toBeUndefined();
    expect(projectOf('\0virtual:edits', ROOT)).toBeUndefined();
    expect(projectOf('/repo/projects/', ROOT)).toBeUndefined();
  });
});

describe('projectsOf', () => {
  test('lists each project once, sorted, from a bundle that reuses another one\'s scenes', () => {
    const ids = ['/repo/projects/news-digest-deck/timeline.ts', '/repo/projects/news-digest/scenes/a.ts', '/repo/projects/news-digest/scenes/b.ts', '/repo/app/src/x.ts', '\0virtual:edits'];
    expect(projectsOf(ids, ROOT)).toEqual(['news-digest', 'news-digest-deck']);
  });
});

describe('withFootage', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => { tmp = tempDir(); });
  afterEach(() => tmp.remove());

  test('keeps only the projects that have a footage manifest', () => {
    mkdirSync(path.join(tmp.dir, 'with/footage'), { recursive: true });
    writeFileSync(path.join(tmp.dir, 'with/footage/manifest.json'), '{}');
    mkdirSync(path.join(tmp.dir, 'empty-footage/footage'), { recursive: true });
    mkdirSync(path.join(tmp.dir, 'none'), { recursive: true });
    expect(withFootage(['with', 'empty-footage', 'none', 'missing'], tmp.dir)).toEqual(['with']);
  });
});
