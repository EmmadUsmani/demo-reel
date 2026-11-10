// Invariants every edit must keep, checked on each project's real timeline (booted without a browser:
// projects/testing/browser.ts). What needs the voice itself (does a line fit its beat?) is covered by
// scripts/audio.ts at render time; here a line must at least be speakable in the time it is given.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { FRAME } from '@engine/stops';
import { installBrowser, manifestOf, project, projectNames, ROOT } from './testing/browser';
import { SCRIPT, written } from './news-digest/script';
import VO from './news-digest/vo-lengths.json';

let restore: () => void;
beforeAll(() => { restore = installBrowser(); });
afterAll(() => restore());

/**
 * The fastest narration measured (news-digest's vo-lengths.json, voiced at speed 1.1), in characters
 * a second, brought down to the house speed of 1 (speed 1.1 for news-digest). A window shorter than a line needs at this rate
 * cannot hold it however the voice is tuned.
 */
const FASTEST_CPS = Math.max(...Object.entries(VO).map(([id, seconds]) => SCRIPT[id]!.length / seconds)) / 1.1;
/** news-digest is voiced faster (its treatment). */
const SPEED: Record<string, number> = { 'news-digest': 1.1 };
const speakable = (text: string, project: string) => text.length / (FASTEST_CPS * (SPEED[project] ?? 1));

/** How the narrator is told to say what the screen spells otherwise (qiyami/treatment.md, Pronunciation). */
const RESPELLINGS: Record<string, [spoken: string, written: string][]> = {
  qiyami: [['Keeyaami', 'Qiyami'], ['keeyaami dot com', 'qiyami.com'], ['Tahhajjood', 'Tahajjud'], ['Kuhrahn', 'Qur’an'], ['Haadeeth', 'hadith'], ['Ahsir', 'Asr']],
};

const CUE_KINDS = ['click', 'key', 'drop', 'whoosh-in', 'whoosh-out', 'whoosh-across', 'pop', 'swish', 'land', 'chime', 'tick', 'wheel'];

test('there is an edit to test, and every project directory with a timeline is one', () => {
  expect(projectNames()).toEqual(['excalidraw', 'hoppscotch', 'news-digest', 'openstreetmap', 'qiyami', 'todomvc', 'vite']);
});

for (const name of projectNames()) {
  describe(name, () => {
    let loaded: Awaited<ReturnType<typeof project>>;
    beforeAll(async () => { loaded = await project(name); });
    const engine = () => loaded.engine;
    const edit = () => loaded.edit;

    describe('timeline', () => {
      test('loads: every scene module is found and every footage reference resolves', () => {
        expect(engine().errors).toEqual([]);
        expect(engine().timeline.length).toBeGreaterThan(0);
        expect([...engine().scenes.keys()]).toEqual(engine().timeline.map((e) => e.id));
      });

      test('scene ids are unique', () => {
        const ids = engine().timeline.map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      test('every scene has a positive, finite length', () => {
        for (const e of engine().timeline) {
          expect(Number.isFinite(e.start) && Number.isFinite(e.end), e.id).toBe(true);
          expect(e.end - e.start, e.id).toBeGreaterThan(0);
        }
      });

      test('scenes follow one another with no gap, and no more than two show at once', () => {
        const { timeline } = engine();
        expect(timeline[0]!.start).toBe(0);
        timeline.forEach((e, i) => {
          const previous = timeline[i - 1], before = timeline[i - 2];
          if (previous) {
            expect(e.start, `${e.id} starts before ${previous.id}`).toBeGreaterThanOrEqual(previous.start);
            expect(e.start, `gap before ${e.id}`).toBeLessThanOrEqual(previous.end + 1e-9);
            expect(e.end, `${e.id} ends before ${previous.id}`).toBeGreaterThanOrEqual(previous.end);
          }
          if (before) expect(e.start, `${e.id} overlaps ${before.id} and ${previous!.id}`).toBeGreaterThanOrEqual(before.end - 1e-9);
        });
      });

      test('the edit lasts until its last scene ends', () => {
        expect(engine().duration).toBe(Math.max(...engine().timeline.map((e) => e.end)));
      });

      test('has a title the player can show, when it sets one', () => {
        if (edit().title !== undefined) expect(edit().title!.trim()).not.toBe('');
      });
    });

    describe('narration', () => {
      test('every line has words, a window inside its scene, and a unique id', () => {
        const lines = engine().narration();
        expect(lines.length).toBeGreaterThan(0);
        expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
        for (const line of lines) {
          const scene = engine().timeline.find((e) => e.id === line.scene)!;
          expect(line.text.trim(), line.id).not.toBe('');
          expect(line.until, `${line.id} is empty`).toBeGreaterThan(line.at);
          expect(line.at, `${line.id} starts before its scene`).toBeGreaterThanOrEqual(scene.start);
          expect(line.until, `${line.id} runs past its scene`).toBeLessThanOrEqual(scene.end + 1e-9);
        }
      });

      test('lines are spoken one at a time: each one ends before the next begins', () => {
        const lines = engine().narration();
        lines.slice(1).forEach((line, i) => {
          const previous = lines[i]!;
          expect(previous.until, `${previous.id} still has its beat when ${line.id} starts`).toBeLessThanOrEqual(line.at + 1e-9);
          expect(previous.at + speakable(previous.text, name), `${previous.id} cannot be said before ${line.id} starts`).toBeLessThanOrEqual(line.at);
        });
      });

      test('every line can be said in the time it is given', () => {
        for (const line of engine().narration()) {
          expect(line.until - line.at, `${line.id}: "${line.text}"`).toBeGreaterThanOrEqual(speakable(line.text, name));
        }
      });

      test('captions spell what the narrator is told to respell', () => {
        for (const line of engine().narration()) {
          if (line.caption !== undefined) expect(line.caption.trim(), line.id).not.toBe('');
          const shown = line.caption ?? line.text;
          for (const [spoken, real] of RESPELLINGS[name] ?? []) {
            if (line.text.includes(spoken)) expect(line.caption, `${line.id} needs a caption`).toBeDefined();
            expect(shown, `${line.id} shows "${spoken}"`).not.toContain(spoken);
            if (line.text.includes(spoken)) expect(shown, line.id).toContain(real);
          }
        }
      });
    });

    describe('sounds', () => {
      test('every cue is a known sound, inside its scene, with sane settings', () => {
        const cues = engine().cues();
        for (const cue of cues) {
          const scene = engine().timeline.find((e) => e.id === cue.scene)!;
          const label = `${cue.scene} ${cue.kind} at ${cue.t.toFixed(2)}`;
          expect(CUE_KINDS, label).toContain(cue.kind);
          expect(Number.isFinite(cue.t), label).toBe(true);
          expect(cue.t, label).toBeGreaterThanOrEqual(scene.start - 1e-9);
          expect(cue.t, label).toBeLessThan(scene.end);
          if (cue.pan !== undefined) expect(Math.abs(cue.pan), label).toBeLessThanOrEqual(1);
          for (const value of [cue.dur, cue.gain, cue.pitch]) if (value !== undefined) expect(value, label).toBeGreaterThan(0);
        }
      });
    });

    describe('stops', () => {
      test('are in order, inside the edit, and each scene has one', () => {
        const stops = engine().stops();
        expect(stops.map((s) => s.t)).toEqual([...stops.map((s) => s.t)].sort((a, b) => a - b));
        stops.slice(1).forEach((s, i) => expect(s.t - stops[i]!.t, `${s.scene} ${s.t}`).toBeGreaterThanOrEqual(FRAME / 2));
        for (const s of stops) {
          expect(s.t).toBeGreaterThanOrEqual(0);
          expect(s.t).toBeLessThan(engine().duration);
        }
        expect(new Set(stops.map((s) => s.scene))).toEqual(new Set(engine().timeline.map((e) => e.id)));
      });

      test('never land in a crossfade: only the scene they name is on screen', () => {
        for (const stop of engine().stops()) {
          const showing = engine().timeline.filter((e) => stop.t >= e.start && stop.t < e.end).map((e) => e.id);
          expect(showing, `stop at ${stop.t.toFixed(2)}`).toEqual([stop.scene]);
        }
      });
    });

    describe('poster', () => {
      test('points at a real scene and a time inside it, outside a crossfade', () => {
        const { poster } = edit();
        if (!poster) return;
        const { timeline } = engine();
        const index = timeline.findIndex((e) => e.id === poster.scene);
        expect(index, `no scene '${poster.scene}'`).toBeGreaterThanOrEqual(0);
        const entry = timeline[index]!;
        const t = entry.start + poster.at;
        expect(poster.at).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThan(entry.end);
        const showing = timeline.filter((e) => t >= e.start && t < e.end).map((e) => e.id);
        expect(showing).toEqual([poster.scene]);
      });
    });

    describe('cards and theme', () => {
      test('a title card shows at most three polaroids; an end card has three or four chips', () => {
        for (const entry of engine().timeline) {
          const { cards, chips } = entry.params ?? {};
          if (cards) expect(cards.length, `${entry.id}: the title card draws the first three`).toBeLessThanOrEqual(3);
          if (chips) {
            expect(chips.length, entry.id).toBeGreaterThanOrEqual(3);
            expect(chips.length, entry.id).toBeLessThanOrEqual(4);
          }
        }
      });

      test('the theme\'s colours are the hex the engine mixes alpha into (shadow is an r, g, b triple), and its fonts exist', () => {
        const { colors = {}, fontFiles = [] } = edit().theme ?? {};
        for (const [key, value] of Object.entries(colors)) {
          if (key === 'shadow') expect(value, key).toMatch(/^\d+, \d+, \d+$/);
          else if (key !== 'tape') expect(value, key).toMatch(/^#[0-9a-f]{6}$/i);
        }
        for (const [family, file] of fontFiles) expect(existsSync(file), `${family}: ${file}`).toBe(true);
      });
    });

    describe('footage manifest', () => {
      const manifest = () => manifestOf(name);

      test('has a viewport, a scale and plates with sizes and boxes', () => {
        const m = manifest();
        expect(m.viewport.width).toBeGreaterThan(0);
        expect(m.viewport.height).toBeGreaterThan(0);
        expect(m.dpr).toBeGreaterThanOrEqual(1);
        for (const [id, shot] of Object.entries<any>(m.shots)) {
          expect(shot.file, id).toMatch(/\.png$/);
          expect(shot.w, id).toBeGreaterThan(0);
          expect(shot.h, id).toBeGreaterThan(0);
          for (const [key, box] of Object.entries<any>(shot.boxes)) expect([box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w >= 0 && box.h >= 0, `${id}/${key}`).toBe(true);
        }
        expect(Object.keys(m.shots).length + Object.keys(m.clips ?? {}).length, 'nothing was captured').toBeGreaterThan(0);
      });

      test('clips have frames, and their marks point at frames that exist', () => {
        for (const [id, clip] of Object.entries<any>(manifest().clips ?? {})) {
          expect(clip.frames.length, id).toBeGreaterThan(1);
          expect(clip.fps, id).toBeGreaterThan(0);
          expect(new Set(clip.frames.map((f: any) => f.file)).size, `${id}: repeated frame files`).toBe(clip.frames.length);
          for (const [mark, found] of Object.entries<any>(clip.marks)) {
            expect(Number.isInteger(found.frame) && found.frame >= 0 && found.frame < clip.frames.length, `${id}/${mark}`).toBe(true);
          }
        }
      });
    });
  });
}

describe('README gallery', () => {
  const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');

  test("states each edit's real length", async () => {
    let checked = 0;
    for (const name of projectNames()) {
      const shown = new RegExp(`\\*\\*\\[[^\\]]+\\]\\(projects/${name}/treatment\\.md\\)\\*\\* · (\\d+):(\\d\\d)`).exec(readme);
      if (!shown) continue; // not in the gallery
      const { engine } = await project(name);
      expect(Math.round(engine.duration), name).toBe(Number(shown[1]) * 60 + Number(shown[2]));
      checked++;
    }
    expect(checked, 'the gallery lists the five original edits').toBeGreaterThanOrEqual(5);
  });
});

describe('news-digest narration', () => {
  let loaded: Awaited<ReturnType<typeof project>>;
  beforeAll(async () => { loaded = await project('news-digest'); });

  test('every line fits its beat at the length measured for it (vo-lengths.json)', () => {
    for (const line of loaded.engine.narration()) {
      const spoken = (VO as Record<string, number>)[line.id]!;
      expect(spoken, `no measured length for ${line.id}`).toBeGreaterThan(0);
      expect(line.until - line.at, `${line.id} (${spoken}s)`).toBeGreaterThanOrEqual(spoken);
    }
  });

  test('every line of the script is told by a scene, and the captions are the written script', () => {
    const lines = loaded.engine.narration();
    expect(lines.map((l) => l.id).sort()).toEqual(Object.keys(SCRIPT).sort());
    for (const line of lines) {
      expect(line.text, line.id).toBe(SCRIPT[line.id]!);
      expect(line.caption, line.id).toBe(written(SCRIPT[line.id]!));
    }
  });
});
