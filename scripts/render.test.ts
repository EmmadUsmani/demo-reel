import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { analyzeJumps, frameCount, renderOptions, sheetTimes, stillName, stillTimes, videoArgs, videoRange } from './render-lib';

const ROOT = path.resolve(import.meta.dir, '..');

describe('renderOptions', () => {
  test('with no arguments it renders stills of the first edit at full HD', () => {
    expect(renderOptions([])).toMatchObject({ mode: 'stills', edit: undefined, only: undefined, url: undefined, headed: false, scale: 1, width: 1920, height: 1080, samples: 1, shutter: 0.5 });
  });

  test('the first argument is the mode, and the flags follow in any order', () => {
    const options = renderOptions(['video', '--headed', '--edit', 'vite', '--only', 'intro', '--url', 'http://localhost:9999', '--samples', '8', '--shutter', '0.25']);
    expect(options).toMatchObject({ mode: 'video', edit: 'vite', only: 'intro', url: 'http://localhost:9999', headed: true, samples: 8, shutter: 0.25 });
    expect(options.opt('crf', '16')).toBe('16');
    expect(options.flag('headed')).toBe(true);
  });

  test.each(['stills', 'sheet', 'jumps', 'video'])('accepts the %s mode', (mode) => {
    expect(renderOptions([mode]).mode).toBe(mode);
  });

  test('refuses an unknown mode by name, and a flag where the mode should be', () => {
    expect(() => renderOptions(['movie'])).toThrow('unknown mode movie');
    expect(() => renderOptions(['--edit', 'vite'])).toThrow('unknown mode --edit');
  });

  test('--scale 2 is a true 4K render', () => {
    expect(renderOptions(['stills', '--scale', '2'])).toMatchObject({ scale: 2, width: 3840, height: 2160 });
  });

  test('--scale rounds to a whole number and never goes below 1', () => {
    expect(renderOptions(['stills', '--scale', '1.6']).scale).toBe(2);
    expect(renderOptions(['stills', '--scale', '0.4']).scale).toBe(1);
    expect(renderOptions(['stills', '--scale', '-3']).scale).toBe(1);
  });
});

describe('renderOptions on a bad flag', () => {
  test('says which flag is not a number, and what was typed', () => {
    expect(() => renderOptions(['stills', '--scale', 'big'])).toThrow("--scale must be a number, not 'big'");
    expect(() => renderOptions(['stills', '--shutter', ''])).toThrow("--shutter must be a number, not ''");
    expect(() => renderOptions(['video', '--fps', 'fast'])).toThrow("--fps must be a number, not 'fast'");
    expect(() => renderOptions(['video', '--from', 'x'])).toThrow("--from must be a number, not 'x'");
    expect(() => renderOptions(['jumps', '--to', 'x'])).toThrow("--to must be a number, not 'x'");
    expect(() => renderOptions(['sheet', '--n', 'many'])).toThrow("--n must be a number, not 'many'");
  });

  test('--samples is a whole number of at least 1', () => {
    expect(() => renderOptions(['stills', '--samples', '0'])).toThrow('--samples must be a whole number of 1 or more');
    expect(() => renderOptions(['stills', '--samples', '2.5'])).toThrow('--samples must be a whole number of 1 or more');
  });

  test('--t and --times must be lists of numbers', () => {
    expect(() => renderOptions(['stills', '--t', '1,two,3'])).toThrow("--t must be comma-separated seconds, not '1,two,3'");
    expect(() => renderOptions(['stills', '--t', '1,,3'])).toThrow('--t must be comma-separated seconds');
    expect(() => renderOptions(['sheet', '--times', '1,x'])).toThrow("--times must be comma-separated seconds, not '1,x'");
  });

  test('a video that ends before it starts, or runs at 0 fps, is refused', () => {
    expect(() => renderOptions(['video', '--from', '5', '--to', '2'])).toThrow('--to (2) must be after --from (5)');
    expect(() => renderOptions(['video', '--from', '5', '--to', '5'])).toThrow('must be after');
    expect(() => renderOptions(['video', '--fps', '0'])).toThrow('--fps must be above 0');
    expect(() => renderOptions(['video', '--fps', '-30'])).toThrow('--fps must be above 0');
  });

  test('a contact sheet needs at least one frame', () => {
    expect(() => renderOptions(['sheet', '--n', '0'])).toThrow('--n must be a whole number of 1 or more');
    expect(() => renderOptions(['sheet', '--n', '1.5'])).toThrow('--n must be a whole number');
  });

  test('--cols is 1 or more', () => {
    expect(() => renderOptions(['sheet', '--cols', '0'])).toThrow('--cols must be 1 or more');
    expect(() => renderOptions(['sheet', '--cols', 'x'])).toThrow("--cols must be a number, not 'x'");
  });

  test('good flags still pass, and a sheet from --times needs no --n', () => {
    expect(() => renderOptions(['video', '--from', '1', '--to', '3', '--fps', '30'])).not.toThrow();
    expect(() => renderOptions(['sheet', '--times', '1,2', '--n', '0'])).not.toThrow();
  });
});

describe('videoRange', () => {
  const opts = (...args: string[]) => (key: string, fallback?: string) => { const i = args.indexOf(`--${key}`); return i >= 0 ? args[i + 1] : fallback; };

  test('is the whole edit at 60 fps by default', () => {
    expect(videoRange(opts(), 27.5)).toEqual({ from: 0, to: 27.5, fps: 60 });
  });

  test('--from, --to and --fps override it', () => {
    expect(videoRange(opts('--from', '2', '--to', '9', '--fps', '30'), 27.5)).toEqual({ from: 2, to: 9, fps: 30 });
  });

  test('an edit with no length cannot be rendered', () => {
    expect(() => videoRange(opts(), 0)).toThrow('--to (0) must be after --from (0)');
  });
});

describe('stillTimes and stillName', () => {
  test('--t is a comma-separated list of seconds, defaulting to the first frame', () => {
    expect(stillTimes('1.5,8,12.25')).toEqual([1.5, 8, 12.25]);
    expect(stillTimes()).toEqual([0]);
  });

  test('a still is named by its time to 10 ms, zero-padded so names sort by time', () => {
    expect(stillName(0)).toBe('f_000.00.png');
    expect(stillName(1.5)).toBe('f_001.50.png');
    expect(stillName(12.25)).toBe('f_012.25.png');
    expect(stillName(100.456)).toBe('f_100.46.png');
    expect(['f_012.25.png', stillName(8), stillName(101)].sort()).toEqual([stillName(8), 'f_012.25.png', stillName(101)]);
  });
});

describe('sheetTimes', () => {
  const base = { from: 0, to: 10, n: 5 };

  test('is n times spread evenly from `from` to `to`, both included', () => {
    expect(sheetTimes(base)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(sheetTimes({ from: 4, to: 6, n: 3 })).toEqual([4, 5, 6]);
  });

  test('a single frame is the start, not a division by zero', () => {
    expect(sheetTimes({ ...base, n: 1 })).toEqual([0]);
  });

  test('--times replaces the spread with exactly those times', () => {
    expect(sheetTimes({ ...base, times: '1,2.5,9' })).toEqual([1, 2.5, 9]);
  });

  test('--cuts is a beat either side and a frame either side of every cut after the first scene', () => {
    const cuts = [{ start: 0 }, { start: 4 }, { start: 10 }];
    expect(sheetTimes({ ...base, cuts })).toEqual([3.9, 4 - 1 / 60, 4 + 1 / 60, 4.1, 9.9, 10 - 1 / 60, 10 + 1 / 60, 10.1]);
  });

  test('--cuts wins over --times, and an edit of one scene has no cuts', () => {
    expect(sheetTimes({ ...base, times: '1,2', cuts: [{ start: 0 }, { start: 5 }] })).toHaveLength(4);
    expect(sheetTimes({ ...base, cuts: [{ start: 0 }] })).toEqual([]);
  });
});

describe('frameCount', () => {
  test('is the frames between the two times at the frame rate', () => {
    expect(frameCount(0, 2, 60)).toBe(120);
    expect(frameCount(1.5, 3, 60)).toBe(90);
    expect(frameCount(0, 10, 25)).toBe(250);
  });

  test('rounds each end to a frame, as the app does when it steps', () => {
    expect(frameCount(0, 1.004, 60)).toBe(60);
    expect(frameCount(0.01, 1, 60)).toBe(60 - 1);
  });
});

describe('videoArgs', () => {
  const base = { width: 1920, height: 1080, fps: 60, from: 0, to: 10, out: '/out/edit.mp4' };

  test('reads raw RGBA frames of the render size at the frame rate from stdin', () => {
    const args = videoArgs(base);
    const raw = args.slice(0, args.indexOf('pipe:0') + 1);
    expect(raw).toEqual(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '1920x1080', '-r', '60', '-i', 'pipe:0']);
  });

  test('a 4K render and another frame rate change the size and rate', () => {
    const args = videoArgs({ ...base, width: 3840, height: 2160, fps: 30 });
    expect(args[args.indexOf('-s') + 1]).toBe('3840x2160');
    expect(args[args.indexOf('-r') + 1]).toBe('30');
  });

  test('encodes H.264 yuv420p, faststart, and tags BT.709 on the stream and in the conversion', () => {
    const args = videoArgs(base).join(' ');
    expect(args).toContain('-vf scale=out_color_matrix=bt709,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709');
    expect(args).toContain('-c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -tune animation -movflags +faststart');
  });

  test('preset and crf can be changed', () => {
    expect(videoArgs({ ...base, preset: 'veryfast', crf: '23' }).join(' ')).toContain('-preset veryfast -crf 23');
  });

  test('writes to the output file, last', () => {
    expect(videoArgs(base).at(-1)).toBe('/out/edit.mp4');
  });

  test('without audio it maps nothing and adds no second input', () => {
    const args = videoArgs(base);
    expect(args.filter((a) => a === '-i')).toHaveLength(1);
    expect(args).not.toContain('-map');
    expect(args).not.toContain('aac');
  });

  test('with audio it cuts the soundtrack to the same range, as AAC at 256k, mapped after the video', () => {
    const args = videoArgs({ ...base, from: 2.5, to: 7, audio: 'out/audio-x/mix.wav' });
    const second = args.indexOf('-i', args.indexOf('pipe:0') + 1);
    expect(args.slice(second - 4, second + 2)).toEqual(['-ss', '2.5', '-t', '4.5', '-i', path.resolve('out/audio-x/mix.wav')]);
    expect(args.slice(second + 2, second + 10)).toEqual(['-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k']);
    expect(args.indexOf('-vf')).toBeGreaterThan(second); // the trim applies to the audio input, not the frames
  });
});

describe('analyzeJumps', () => {
  const steady = (n: number, level = 0.2) => Array.from({ length: n }, () => level);

  test('smooth motion has no pops, and the summary gives the median, 99th percentile and maximum', () => {
    const diffs = Array.from({ length: 100 }, (_, i) => i / 10); // a steady ramp from 0 to 9.9
    expect(analyzeJumps(diffs, 0)).toEqual(['100 frame steps  median 5.00  p99 9.90  max 9.90', 'no pops']);
  });

  test('a frame that changes far more than its neighbours is a pop, at the time it lands', () => {
    const diffs = steady(60);
    diffs[29] = 6;
    const [summary, verdict] = analyzeJumps(diffs, 10);
    expect(summary).toBe('60 frame steps  median 0.20  p99 6.00  max 6.00');
    expect(verdict).toBe('pops:\n  10.500s  change 6.00  (neighbours ~0.20)'); // 10 + 30/60
  });

  test('a cut that is big against quiet neighbours counts, but a big change inside fast motion does not', () => {
    const quietCut = [...steady(20), 3, ...steady(20)];
    expect(analyzeJumps(quietCut, 0)[1]).toContain('pops:');
    const busy = steady(41, 3);
    busy[20] = 5;
    expect(analyzeJumps(busy, 0)[1]).toBe('no pops');
  });

  test('a change under 1.5 is never a pop, however still the frames around it', () => {
    const diffs = steady(40, 0);
    diffs[20] = 1.4;
    expect(analyzeJumps(diffs, 0)[1]).toBe('no pops');
  });

  test('a pop at the very first or last step is found with the neighbours it has', () => {
    const diffs = steady(30);
    diffs[0] = 5;
    diffs[29] = 5;
    const verdict = analyzeJumps(diffs, 0)[1]!;
    expect(verdict).toContain('0.017s  change 5.00');
    expect(verdict).toContain('0.500s  change 5.00');
  });

  test('reports every pop, in time order', () => {
    const diffs = steady(80);
    diffs[10] = 4;
    diffs[60] = 8;
    const lines = analyzeJumps(diffs, 0)[1]!.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('0.183s');
    expect(lines[2]).toContain('1.017s');
  });
});

describe('render.ts on the command line', () => {
  test('a bad flag fails at once too, naming it', () => {
    const result = Bun.spawnSync(['bun', 'scripts/render.ts', 'stills', '--t', '1,abc'], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("--t must be comma-separated seconds, not '1,abc'");
  });

  test('an unknown mode fails at once, before Chrome or Vite is started', () => {
    const started = performance.now();
    const result = Bun.spawnSync(['bun', 'scripts/render.ts', 'movie'], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('unknown mode movie');
    expect(performance.now() - started).toBeLessThan(5000);
  });
});
