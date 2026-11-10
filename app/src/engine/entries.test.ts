import { describe, expect, test } from 'bun:test';
import { entriesOver } from './entries';
import { Scene, type SceneClass } from './scene';

class Shared extends Scene { render() {} }
class Local extends Scene { render() {} }

const E = entriesOver({ '../scenes/title-card.ts': async () => ({ default: Shared as SceneClass }) })({
  './scenes/hero.ts': async () => ({ default: Local as SceneClass }),
  './scenes/title-card.ts': async () => ({ default: Local as SceneClass }),
});

describe('entries', () => {
  test('an entry carries its id, timing options and params, and is laid out later (start and end 0)', () => {
    const entry = E('intro', 'hero', { dur: 4, overlap: 0.5, params: { name: 'X' } });
    expect(entry).toMatchObject({ id: 'intro', start: 0, end: 0, dur: 4, overlap: 0.5, params: { name: 'X' } });
  });

  test('options are all optional', () => {
    const entry = E('a', 'hero');
    expect(entry.dur).toBeUndefined();
    expect(entry.overlap).toBeUndefined();
    expect(entry.params).toBeUndefined();
  });

  test("a scene name resolves to the project's own scene", async () => {
    expect((await E('a', 'hero').load()).default).toBe(Local);
  });

  test('a name the project does not have resolves to the shared card', async () => {
    const shared = entriesOver({ '../scenes/chapter.ts': async () => ({ default: Shared as SceneClass }) })({});
    expect((await shared('c', 'chapter').load()).default).toBe(Shared);
  });

  test("the project's own scene wins over a shared one of the same name", async () => {
    expect((await E('t', 'title-card').load()).default).toBe(Local);
  });

  test('an unknown scene is an error that says where it looked, and only when loaded', async () => {
    const entry = E('x', 'nowhere'); // building the entry does not throw
    await expect(entry.load()).rejects.toThrow("scene module not found: 'nowhere' (looked in the project's scenes/ and app/src/scenes/)");
  });
});
