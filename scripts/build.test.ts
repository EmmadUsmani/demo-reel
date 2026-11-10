import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildOptions, clipCount, copyFootage, dirSize, encodeSoundtrack, footageFiles, listFiles, megabytes, mp3Args } from './build-lib';
import { RATE, writeWav } from './audio-lib';
import { ffmpegTest, probeAudio, sineWav, tempDir } from './test-support';

const ROOT = path.resolve(import.meta.dir, '..');
let tmp: ReturnType<typeof tempDir>;
beforeEach(() => { tmp = tempDir(); });
afterEach(() => tmp.remove());

/** Lay out files under the temp directory: { 'a/b.txt': 'text' }. */
function lay(files: Record<string, string>, base = tmp.dir) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(base, name)), { recursive: true });
    writeFileSync(path.join(base, name), text);
  }
}
/** Every file under `dir`, relative and sorted. */
const tree = (dir: string): string[] => readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath, e.name))).sort();

describe('buildOptions', () => {
  beforeEach(() => lay({ 'projects/demo/timeline.ts': '' }));

  test('names the edit, its output folder, bitrate and where its audio comes from', () => {
    expect(buildOptions(['--edit', 'demo'], tmp.dir)).toEqual({
      edit: 'demo',
      out: path.join(tmp.dir, 'out/web-demo'),
      bitrate: '128k',
      project: path.join(tmp.dir, 'projects/demo'),
      audio: path.join(tmp.dir, 'out/audio-demo'),
      single: false,
    });
  });

  test('--single writes one file: out/web-<name>.html by default, and --out gets an .html extension if it lacks one', () => {
    expect(buildOptions(['--edit', 'demo', '--single'], tmp.dir)).toMatchObject({ single: true, out: path.join(tmp.dir, 'out/web-demo.html') });
    expect(buildOptions(['--edit', 'demo', '--single', '--out', '/x/deck.html'], tmp.dir).out).toBe('/x/deck.html');
    expect(buildOptions(['--edit', 'demo', '--single', '--out', '/x/deck'], tmp.dir).out).toBe('/x/deck.html');
    expect(buildOptions(['--edit', 'demo', '--out', '/x/deck'], tmp.dir)).toMatchObject({ single: false, out: '/x/deck' });
  });

  test('--out and --bitrate override the defaults, and --out is made absolute', () => {
    const options = buildOptions(['--edit', 'demo', '--out', 'somewhere/else', '--bitrate', '96k'], tmp.dir);
    expect(options.bitrate).toBe('96k');
    expect(path.isAbsolute(options.out)).toBe(true);
    expect(options.out).toBe(path.resolve('somewhere/else'));
  });

  test('requires --edit', () => {
    expect(() => buildOptions([], tmp.dir)).toThrow('--edit <name> is required');
    expect(() => buildOptions(['--bitrate', '96k'], tmp.dir)).toThrow('--edit <name> is required');
  });

  test("refuses an edit that has no timeline: a missing project, or a folder that isn't one", () => {
    mkdirSync(path.join(tmp.dir, 'projects/empty'));
    expect(() => buildOptions(['--edit', 'nope'], tmp.dir)).toThrow("no project 'nope'");
    expect(() => buildOptions(['--edit', 'empty'], tmp.dir)).toThrow("no project 'empty'");
  });
});

describe('footageFiles', () => {
  test('is the manifest itself, every shot, every file extra, and every clip frame under its folder', () => {
    const files = footageFiles({
      shots: { a: { file: 'a.png' }, b: { file: 'b.png' } },
      extras: { logo: { file: 'logo.svg' }, data: { value: 3 } as any, none: null, notAFile: { file: 7 } },
      clips: { run: { dir: 'run', frames: [{ file: '0.jpg' }, { file: '1.jpg' }] } },
    });
    expect(files).toEqual(['manifest.json', 'a.png', 'b.png', 'logo.svg', 'run/0.jpg', 'run/1.jpg']);
  });

  test('lists a file used twice once', () => {
    expect(footageFiles({ shots: { a: { file: 'x.png' }, b: { file: 'x.png' } }, extras: { c: { file: 'x.png' } } })).toEqual(['manifest.json', 'x.png']);
  });

  test('an empty manifest names just itself', () => {
    expect(footageFiles({})).toEqual(['manifest.json']);
  });
});

describe('copyFootage', () => {
  const manifest = JSON.stringify({ shots: { a: { file: 'a.png' } }, clips: { run: { dir: 'run', frames: [{ file: '0.jpg' }] } }, extras: { x: { file: 'x.json' } } });

  test('copies what the manifest names, nested clip folders included, and leaves other files behind', async () => {
    lay({ 'manifest.json': manifest, 'a.png': 'A', 'x.json': 'X', 'run/0.jpg': 'F0', 'run/1.jpg': 'unused frame', 'old-plate.png': 'stale', 'notes.md': 'n' }, path.join(tmp.dir, 'in'));
    const copied = await copyFootage('demo', path.join(tmp.dir, 'in'), path.join(tmp.dir, 'out'));
    expect(copied).toEqual(['manifest.json', 'a.png', 'x.json', 'run/0.jpg']);
    expect(tree(path.join(tmp.dir, 'out'))).toEqual(['a.png', 'manifest.json', 'run/0.jpg', 'x.json']);
    expect(readFileSync(path.join(tmp.dir, 'out/run/0.jpg'), 'utf8')).toBe('F0');
  });

  test('names the missing file, and how to capture it, when a plate is gone', async () => {
    lay({ 'manifest.json': manifest, 'a.png': 'A' }, path.join(tmp.dir, 'in'));
    await expect(copyFootage('demo', path.join(tmp.dir, 'in'), path.join(tmp.dir, 'out'))).rejects.toThrow(
      `footage file missing: ${path.join(tmp.dir, 'in', 'x.json')} (capture the footage first: bun projects/demo/capture.ts)`,
    );
  });

  test('a project with no manifest has no footage, and nothing is created', async () => {
    mkdirSync(path.join(tmp.dir, 'in'));
    expect(await copyFootage('demo', path.join(tmp.dir, 'in'), path.join(tmp.dir, 'out'))).toEqual([]);
    expect(existsSync(path.join(tmp.dir, 'out'))).toBe(false);
  });

  test('a manifest that names nothing copies only itself', async () => {
    lay({ 'manifest.json': '{}', 'plate.png': 'x' }, path.join(tmp.dir, 'in'));
    await copyFootage('demo', path.join(tmp.dir, 'in'), path.join(tmp.dir, 'out'));
    expect(tree(path.join(tmp.dir, 'out'))).toEqual(['manifest.json']);
  });
});

describe('mp3Args', () => {
  test('encodes with LAME at the bitrate asked for, overwriting, quietly', () => {
    expect(mp3Args('in.wav', 'out.mp3', '96k')).toEqual(['ffmpeg', '-y', '-v', 'error', '-i', 'in.wav', '-c:a', 'libmp3lame', '-b:a', '96k', 'out.mp3']);
  });
});

describe('encodeSoundtrack', () => {
  const warnings = () => spyOn(console, 'warn').mockImplementation(() => {});
  const captions = JSON.stringify([{ id: 'a', scene: 's', at: 1, end: 2, text: 'Hello' }]);

  ffmpegTest('turns mix.wav and effects.wav into constant-bitrate MP3s of the same length, and copies the captions', async () => {
    const audioIn = path.join(tmp.dir, 'audio-in'), audioOut = path.join(tmp.dir, 'web/audio/demo');
    mkdirSync(audioIn);
    sineWav(path.join(audioIn, 'mix.wav'), 1);
    sineWav(path.join(audioIn, 'effects.wav'), 1, 880);
    writeFileSync(path.join(audioIn, 'captions.json'), captions);
    writeFileSync(path.join(audioIn, 'vo.wav'), 'not for the player');
    const written = await encodeSoundtrack('demo', audioIn, audioOut, '128k', tmp.dir);
    expect(written).toEqual(['mix.mp3', 'effects.mp3', 'captions.json']);
    expect(tree(audioOut)).toEqual(['captions.json', 'effects.mp3', 'mix.mp3']);
    for (const track of ['mix', 'effects']) {
      const info = probeAudio(path.join(audioOut, `${track}.mp3`));
      expect(info.codec).toBe('mp3');
      expect(info.rate).toBe(48000);
      expect(info.channels).toBe(2);
      expect(info.bitRate).toBe(128000);
      expect(info.duration).toBeCloseTo(1, 1); // the encoder adds a few ms of padding
    }
    expect(readFileSync(path.join(audioOut, 'captions.json'), 'utf8')).toBe(captions);
  }, 30_000);

  ffmpegTest('--bitrate sets the encoded bitrate', async () => {
    const audioIn = path.join(tmp.dir, 'in');
    mkdirSync(audioIn);
    sineWav(path.join(audioIn, 'mix.wav'), 1);
    const warn = warnings();
    await encodeSoundtrack('demo', audioIn, path.join(tmp.dir, 'out'), '64k', tmp.dir);
    warn.mockRestore();
    expect(probeAudio(path.join(tmp.dir, 'out/mix.mp3')).bitRate).toBe(64000);
  });

  ffmpegTest('with no effects.wav it still builds the mix, and says how to get the effects', async () => {
    const warn = warnings();
    const audioIn = path.join(tmp.dir, 'in');
    mkdirSync(audioIn);
    sineWav(path.join(audioIn, 'mix.wav'), 1);
    const written = await encodeSoundtrack('demo', audioIn, path.join(tmp.dir, 'out'), '128k', tmp.dir);
    expect(written).toEqual(['mix.mp3']);
    expect(warn).toHaveBeenCalledWith('no effects.wav: re-run scripts/audio.ts --edit demo for it');
    warn.mockRestore();
  });

  test('with no mix.wav the player is silent: a warning, no audio folder, no error', async () => {
    const warn = warnings();
    const audioIn = path.join(tmp.dir, 'in');
    mkdirSync(audioIn);
    writeFileSync(path.join(audioIn, 'effects.wav'), 'x'); // effects alone are not a soundtrack
    expect(await encodeSoundtrack('demo', audioIn, path.join(tmp.dir, 'out'), '128k', tmp.dir)).toEqual([]);
    expect(existsSync(path.join(tmp.dir, 'out'))).toBe(false);
    expect(warn).toHaveBeenCalledWith(`no soundtrack in ${audioIn}: the player is silent (run bun scripts/audio.ts --edit demo first)`);
    warn.mockRestore();
  });

  test('with no audio folder at all it is the same silent player', async () => {
    const warn = warnings();
    expect(await encodeSoundtrack('demo', path.join(tmp.dir, 'missing'), path.join(tmp.dir, 'out'), '128k', tmp.dir)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  ffmpegTest('a mix.wav ffmpeg cannot read fails the build, with the command in the message', async () => {
    const audioIn = path.join(tmp.dir, 'in');
    lay({ 'in/mix.wav': 'this is not a wav' });
    await expect(encodeSoundtrack('demo', audioIn, path.join(tmp.dir, 'out'), '128k', tmp.dir)).rejects.toThrow(/ffmpeg .*mix\.wav.* failed/);
  });
});

describe('the encoded soundtrack lines up with the WAV it came from', () => {
  ffmpegTest('a click at 1.000 s is still at 1.000 s, and the length is unchanged, after the MP3 round trip', async () => {
    const wav = path.join(tmp.dir, 'in.wav'), mp3 = path.join(tmp.dir, 'out.mp3'), raw = path.join(tmp.dir, 'out.f32');
    const click = new Float32Array(RATE * 2);
    for (let i = 0; i < 2000; i++) click[RATE + i] = 0.8 * Math.sin(i / 3) * Math.exp(-i / 400);
    await Bun.write(wav, writeWav([click, click], RATE));
    expect(Bun.spawnSync(mp3Args(wav, mp3, '128k')).exitCode).toBe(0);
    expect(Bun.spawnSync(['ffmpeg', '-y', '-v', 'error', '-i', mp3, '-f', 'f32le', '-ac', '1', '-ar', String(RATE), raw]).exitCode).toBe(0);
    const decoded = new Float32Array(await Bun.file(raw).arrayBuffer());
    const loudest = (a: Float32Array) => a.reduce((best, v, i) => (Math.abs(v) > Math.abs(a[best]!) ? i : best), 0);
    expect(decoded.length).toBe(click.length);
    expect(Math.abs(loudest(decoded) - loudest(click))).toBeLessThanOrEqual(2); // the encoder's delay is compensated
  });
});

describe('clipCount and listFiles', () => {
  test('clipCount counts the manifest clips, and is 0 without footage', async () => {
    expect(await clipCount(tmp.dir)).toBe(0);
    lay({ 'manifest.json': JSON.stringify({ shots: {}, clips: { a: { dir: 'a', frames: [] }, b: { dir: 'b', frames: [] } } }) });
    expect(await clipCount(tmp.dir)).toBe(2);
    lay({ 'manifest.json': JSON.stringify({ shots: {} }) });
    expect(await clipCount(tmp.dir)).toBe(0);
  });

  test('listFiles is every file below a folder, relative with / and sorted', () => {
    lay({ 'b.txt': '', 'a/z.txt': '', 'a/deep/y.txt': '' });
    expect(listFiles(tmp.dir)).toEqual(['a/deep/y.txt', 'a/z.txt', 'b.txt']);
  });
});

describe('size reporting', () => {
  test('dirSize adds up every file below a folder', () => {
    lay({ 'a.txt': '12345', 'sub/b.txt': '123', 'sub/deep/c.txt': '12' });
    expect(dirSize(tmp.dir)).toBe(10);
  });

  test('megabytes formats it, and shows a dash for a folder that does not exist', () => {
    lay({ 'a.bin': 'x'.repeat(1_500_000) });
    expect(megabytes(tmp.dir)).toBe('1.5 MB');
    expect(megabytes(path.join(tmp.dir, 'nope'))).toBe('—');
  });
});

describe('build.ts on the command line', () => {
  const build = (...args: string[]) => Bun.spawnSync(['bun', 'scripts/build.ts', ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });

  test('fails fast without --edit', () => {
    const result = build();
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('--edit <name> is required');
  });

  test("fails fast on a project that isn't there, before any build output is written", () => {
    const out = path.join(tmp.dir, 'web');
    const result = build('--edit', 'no-such-project', '--out', out);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("no project 'no-such-project'");
    expect(existsSync(out)).toBe(false);
  });
});

// needs news-digest's captured footage and scripts/audio.ts's output (both gitignored): skipped without them
const haveNewsDigest = existsSync(path.join(ROOT, 'projects/news-digest/footage/manifest.json')) && existsSync(path.join(ROOT, 'out/audio-news-digest/mix.wav'));
describe('build.ts --single on news-digest', () => {
  const test_ = haveNewsDigest ? test : test.skip;
  test_('writes exactly one self-contained file that carries every plate the manifest names', async () => {
    const out = path.join(tmp.dir, 'deck');
    const built = Bun.spawnSync(['bun', 'scripts/build.ts', '--edit', 'news-digest', '--single', '--out', out], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    expect(built.stderr.toString().replace(/warning: .*\n/g, '')).toBe('');
    expect(built.exitCode).toBe(0);
    expect(readdirSync(tmp.dir)).toEqual(['deck.html']);
    const html = readFileSync(path.join(tmp.dir, 'deck.html'), 'utf8');
    expect(html).not.toMatch(/<script[^>]*\ssrc=/);
    expect(html).not.toMatch(/<link[^>]*\shref="(?!data:)/);
    expect(html).not.toContain('./assets/');
    const embedded = JSON.parse(html.match(/<script type="application\/json" id="embedded-files">([\s\S]*?)<\/script>/)![1]!);
    const manifest = await Bun.file(path.join(ROOT, 'projects/news-digest/footage/manifest.json')).json();
    for (const file of footageFiles(manifest)) expect(embedded[`footage/news-digest/${file}`]).toBeDefined();
    for (const file of ['mix.mp3', 'effects.mp3', 'captions.json']) expect(embedded[`audio/news-digest/${file}`]).toBeDefined();
    expect(html.match(/<script type="module">/g)).toHaveLength(1);
  }, 120_000);
});
