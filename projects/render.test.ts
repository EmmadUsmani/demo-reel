// Drawing every edit without real footage: each frame is a pure function of its time, so rendering a
// time must not throw, must hand the canvas only finite numbers, must leave the context balanced, and
// must give the same calls whenever and however often it is asked for. The footage plates are
// gitignored, so each stands in as a blank bitmap of the size its manifest says (projects/testing).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { installBrowser, project, projectNames, recorder, requested, useTheme } from './testing/browser';

let restore: () => void;
beforeAll(() => { restore = installBrowser(); });
afterAll(() => restore());

type Loaded = Awaited<ReturnType<typeof project>>;

/** Times worth drawing: a regular grid, the edit's ends, each scene's start, crossfade, middle and last moment, and every stop. */
function sweep({ engine }: Loaded) {
  const times = new Set<number>([0, engine.duration - 1e-3, engine.duration + 1]);
  for (let t = 0.0123; t < engine.duration; t += 0.25) times.add(t);
  engine.timeline.forEach((e, i) => {
    const previous = engine.timeline[i - 1];
    const fadeEnd = previous ? previous.end : e.start;
    times.add(e.start);
    times.add((e.start + fadeEnd) / 2); // mid-crossfade (the scene's start when it hard-cuts)
    times.add(fadeEnd + 1e-3);
    times.add((fadeEnd + e.end) / 2);
    times.add(e.end - 1e-3);
  });
  for (const stop of engine.stops()) times.add(stop.t);
  return [...times].map((t) => Math.round(t * 1000) / 1000).sort((a, b) => a - b);
}

async function frame({ engine }: Loaded, t: number) {
  recorder.reset();
  await engine.prepare(t);
  engine.render(t);
  return { calls: recorder.calls, problems: recorder.problems, open: recorder.openSaves() };
}

for (const name of projectNames()) {
  describe(name, () => {
    let loaded: Loaded;
    let undoTheme: () => void;
    beforeAll(async () => {
      loaded = await project(name);
      undoTheme = useTheme(loaded.edit);
    });
    afterAll(() => undoTheme());

    test('every frame of the sweep draws without an error, a bad number or an unbalanced save', async () => {
      for (const t of sweep(loaded)) {
        const { calls, problems, open } = await frame(loaded, t);
        expect(loaded.engine.errors, `t=${t}`).toEqual([]);
        expect(problems, `t=${t}`).toEqual([]);
        expect(open, `t=${t}: saves left open`).toBe(0);
        expect(calls.length, `t=${t}: nothing drawn`).toBeGreaterThan(0);
      }
    });

    test('a time draws the same calls whenever it is asked for', async () => {
      const times = sweep(loaded);
      const first = new Map<number, string[]>();
      for (const t of times) first.set(t, (await frame(loaded, t)).calls);
      // again, in reverse: a frame must not depend on the frames drawn before it
      for (const t of [...times].reverse()) expect((await frame(loaded, t)).calls, `t=${t}`).toEqual(first.get(t)!);
    });

    test("only this project's footage is used", async () => {
      const before = requested.length;
      for (const t of sweep(loaded)) await frame(loaded, t);
      for (const url of [...loaded.files, ...requested.slice(before)]) expect(url.startsWith(`footage/${name}/`), url).toBe(true);
    });
  });
}
