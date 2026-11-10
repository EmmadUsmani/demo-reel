import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import type { Cue as EngineCue } from '../app/src/engine/scene';
import {
  audioOptions, captionsFor, CEILING, clipFile, duckEnvelope, fitReport, limit, lufs, mixDown, parseLoudness, RATE, readWav, renderEffects, resample,
  trimSpeech, voiceTrack, writeWav, type Clip, type Cue, type Line,
} from './audio-lib';
import { ffmpegTest, probeAudio, tempDir } from './test-support';

const ROOT = '/repo';
const peak = (a: Float32Array, from = 0, to = a.length) => { let p = 0; for (let i = from; i < to; i++) p = Math.max(p, Math.abs(a[i]!)); return p; };
/** First and last index where |a| exceeds `level`. */
const extent = (a: Float32Array, level = 1e-6) => ({ first: a.findIndex((v) => Math.abs(v) > level), last: a.length - 1 - [...a].reverse().findIndex((v) => Math.abs(v) > level) });
const line = (over: Partial<Line> = {}): Line => ({ id: 'one', at: 1, until: 4, text: 'Hello there.', scene: 'intro', ...over });
const clip = (over: Partial<Line> = {}, speech = 1.5, samples: Float32Array = new Float32Array(RATE)): Clip => ({ line: line(over), speech, samples });
const sine = (n: number, amp = 1, period = 50) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * i) / period));
const cue = (kind: string, t: number, over: Partial<Cue> = {}): Cue => ({ kind, t, scene: 's', ...over });

describe('audioOptions', () => {
  test('defaults: the narrator voice at normal speed, written under out/audio-<edit>', () => {
    expect(audioOptions(['--edit', 'todomvc'], ROOT)).toEqual({ edit: 'todomvc', out: '/repo/out/audio-todomvc', voice: 'af_heart', speed: 1, force: false });
  });

  test('without an edit the output is out/audio', () => {
    expect(audioOptions([], ROOT)).toMatchObject({ edit: undefined, out: '/repo/out/audio' });
  });

  test('--voice, --speed, --out and --force are read', () => {
    const options = audioOptions(['--edit', 'x', '--voice', 'bf_emma', '--speed', '1.1', '--out', '/somewhere/audio', '--force'], ROOT);
    expect(options).toEqual({ edit: 'x', out: '/somewhere/audio', voice: 'bf_emma', speed: 1.1, force: true });
  });

  test('--speed must be a number above 0, and says what it got', () => {
    for (const bad of ['fast', '0', '-1', '', 'Infinity']) expect(() => audioOptions(['--speed', bad], ROOT)).toThrow(`--speed must be a number above 0, not '${bad}'`);
  });

  test('a relative --out becomes absolute', () => {
    expect(path.isAbsolute(audioOptions(['--out', 'mine'], ROOT).out)).toBe(true);
  });
});

describe('clipFile', () => {
  const where = (l: Pick<Line, 'id' | 'text'>, voice = 'af_heart', speed = 1) => clipFile('/out', l, voice, speed);

  test('is under vo/, named by the line and a 12-character hash', () => {
    expect(where(line())).toMatch(/^\/out\/vo\/one-[0-9a-f]{12}\.wav$/);
  });

  test('is the same for the same line, voice and speed', () => {
    expect(where(line())).toBe(where(line({ at: 9, until: 12, scene: 'other', caption: 'different caption' })));
  });

  test('changes with the words, the voice and the speed, so an edit never plays a stale clip', () => {
    const base = where(line());
    expect(where(line({ text: 'Hello there!' }))).not.toBe(base);
    expect(where(line(), 'bf_emma')).not.toBe(base);
    expect(where(line(), 'af_heart', 1.1)).not.toBe(base);
  });

  test('keeps lines that say the same thing apart by id', () => {
    expect(where(line({ id: 'two' }))).not.toBe(where(line()));
  });
});

describe('trimSpeech', () => {
  /** `lead` silent samples, `speech` loud ones, `tail` silent ones, at 1000 Hz so seconds are easy. */
  const padded = (lead: number, speech: number, tail: number, level = 0.5) => Float32Array.from({ length: lead + speech + tail }, (_, i) => (i >= lead && i < lead + speech ? level : 0));

  test('keeps 40 ms before the first word and 150 ms after the last', () => {
    const { samples } = trimSpeech(padded(500, 1000, 500), 1000);
    expect(samples.length).toBe(40 + 999 + 150); // the lead-in, first to last loud sample, the tail
    expect(samples[39]).toBe(0);
    expect(samples[40]).toBe(0.5);
  });

  test('measures the speech from the first to the last sample over the threshold', () => {
    expect(trimSpeech(padded(500, 1000, 500), 1000).speech).toBeCloseTo(0.999, 6);
    expect(trimSpeech(padded(0, 2000, 0), 2000).speech).toBeCloseTo(0.9995, 6);
  });

  test('treats anything under 0.01 as silence', () => {
    expect(trimSpeech(padded(500, 1000, 500, 0.009), 1000).speech).toBeLessThan(0.001);
    expect(trimSpeech(padded(500, 1000, 500, 0.011), 1000).speech).toBeCloseTo(0.999, 6);
  });

  test('cannot keep more tail than there is', () => {
    const { samples } = trimSpeech(padded(500, 100, 10), 1000);
    expect(samples.length).toBe(40 + 100 + 10); // the lead-in, the speech, and the 10 samples left (not 150)
  });

  test("always leaves exactly 40 ms before the first word, so a placed clip's speech starts on its line time", () => {
    const loud = (lead: number) => Float32Array.from({ length: lead + 4800 + 2400 }, (_, i) => (i >= lead && i < lead + 4800 ? 0.5 : 0));
    for (const lead of [0, 480, 1920, 9600]) { // 0 ms, 10 ms, exactly 40 ms, 200 ms of silence before the speech
      const { samples, speech } = trimSpeech(loud(lead), RATE);
      expect(samples.findIndex((v) => v !== 0)).toBe(Math.round(0.04 * RATE));
      const track = voiceTrack([clip({ at: 1 }, speech, samples)], RATE * 3);
      expect(track.findIndex((v) => v !== 0)).toBe(RATE);
    }
  });

  test('an all-silent clip has no speech and nothing to keep', () => {
    expect(trimSpeech(new Float32Array(2000), 1000)).toEqual({ samples: new Float32Array(0), speech: 0 });
    expect(trimSpeech(new Float32Array(0), 1000)).toEqual({ samples: new Float32Array(0), speech: 0 });
  });

  test('works out the lead-in and tail in samples at the clip\'s own rate', () => {
    const { samples } = trimSpeech(padded(10_000, 24_000, 10_000), 24_000);
    expect(samples.length).toBe(Math.round(0.04 * 24_000) + 23_999 + Math.round(0.15 * 24_000));
  });
});

describe('fitReport', () => {
  test('says how much room a line has left in its beat', () => {
    const { lines, overruns } = fitReport([clip({ at: 2, until: 5 }, 1.5)], 'af_heart', 1);
    expect(lines).toEqual(['narration (af_heart, speed 1):', '    2.00s  1.50s  fits, 1.50s spare  intro/one: Hello there.']);
    expect(overruns).toBe(0);
  });

  test('flags a line that runs past its beat, by how much, and counts them', () => {
    const { lines, overruns } = fitReport([clip({ at: 2, until: 3 }, 1.25), clip({ id: 'b', at: 10, until: 12 }, 1), clip({ id: 'c', at: 20, until: 20.5, scene: 'end' }, 1)], 'af_heart', 1.1);
    expect(lines[0]).toBe('narration (af_heart, speed 1.1):');
    expect(lines[1]).toContain('OVERRUNS by 0.25s');
    expect(lines[2]).toContain('fits, 1.00s spare');
    expect(lines[3]).toContain('OVERRUNS by 0.50s  end/c:');
    expect(overruns).toBe(2);
  });

  test('a line that ends exactly on its beat fits', () => {
    const { lines, overruns } = fitReport([clip({ at: 1, until: 2.5 }, 1.5)], 'v', 1);
    expect(overruns).toBe(0);
    expect(lines[1]).toContain('fits, 0.00s spare');
  });

  test('no narration is no overruns', () => {
    expect(fitReport([], 'v', 1)).toEqual({ lines: ['narration (v, speed 1):'], overruns: 0 });
  });
});

describe('captionsFor', () => {
  test('has id, scene, start, end (start + speech) and the text on screen', () => {
    expect(captionsFor([clip({ id: 'a', scene: 'intro', at: 2.5 }, 1.25)])).toEqual([{ id: 'a', scene: 'intro', at: 2.5, end: 3.75, text: 'Hello there.' }]);
  });

  test('a caption overrides the spoken text', () => {
    const [first, second] = captionsFor([clip({ text: 'Twenty twenty six', caption: '2026' }), clip({ id: 'b', text: 'No caption here' })]);
    expect(first!.text).toBe('2026');
    expect(second!.text).toBe('No caption here');
  });

  test('an empty caption still counts as a caption', () => {
    expect(captionsFor([clip({ caption: '' })])[0]!.text).toBe('');
  });

  test('keeps the order of the lines, and survives a trip through JSON as the player reads it', () => {
    const captions = captionsFor([clip({ id: 'a', at: 1 }), clip({ id: 'b', at: 5 }), clip({ id: 'c', at: 9 })]);
    expect(JSON.parse(JSON.stringify(captions, null, 1)).map((c: { id: string }) => c.id)).toEqual(['a', 'b', 'c']);
    expect(Object.keys(captions[0]!)).toEqual(['id', 'scene', 'at', 'end', 'text']);
  });
});

describe('renderEffects', () => {
  // every kind a scene can ask for: the Record makes the compiler list any the engine adds
  const known: Record<EngineCue['kind'], true> = { click: true, key: true, drop: true, 'whoosh-in': true, 'whoosh-out': true, 'whoosh-across': true, pop: true, swish: true, land: true, chime: true, tick: true, wheel: true };
  const kinds = Object.keys(known);
  const N = RATE * 4;

  test.each(kinds)('%s makes a finite, audible sound that starts at its cue and stays under full scale', (kind) => {
    const { L, R } = renderEffects([cue(kind, 1)], N);
    for (const channel of [L, R]) for (const v of channel) if (!Number.isFinite(v)) throw new Error('not finite');
    expect(Math.max(peak(L), peak(R))).toBeGreaterThan(0.005);
    expect(Math.max(peak(L), peak(R))).toBeLessThan(0.5);
    expect(extent(L).first).toBeGreaterThanOrEqual(RATE); // nothing before t = 1 s
    expect(extent(L).first).toBeLessThan(RATE + 0.005 * RATE); // and it starts within 5 ms of it
  });

  test('counts the cues of each kind', () => {
    const { counts } = renderEffects([cue('click', 0.1), cue('click', 0.5), cue('pop', 1), cue('key', 2)], N);
    expect(counts).toEqual({ click: 2, pop: 1, key: 1 });
  });

  test('no cues is silence', () => {
    const { L, R, counts } = renderEffects([], 1000);
    expect([L.length, R.length, peak(L), peak(R)]).toEqual([1000, 1000, 0, 0]);
    expect(counts).toEqual({});
  });

  test('a kind with no sound is an error that names the cue', () => {
    expect(() => renderEffects([cue('click', 1), cue('boing', 2.5, { scene: 'intro' })], N)).toThrow("no sound for cue kind 'boing' (intro @ 2.50s)");
  });

  test('is the same every time: the noise is seeded', () => {
    const cues = kinds.map((kind, i) => cue(kind, 0.2 * i));
    const a = renderEffects(cues, N), b = renderEffects(cues, N);
    expect(Buffer.from(a.L.buffer).equals(Buffer.from(b.L.buffer))).toBe(true);
    expect(Buffer.from(a.R.buffer).equals(Buffer.from(b.R.buffer))).toBe(true);
  });

  test('cue gain scales the level linearly', () => {
    const quiet = renderEffects([cue('drop', 1)], N), loud = renderEffects([cue('drop', 1, { gain: 2.5 })], N);
    expect(peak(loud.L) / peak(quiet.L)).toBeCloseTo(2.5, 5);
    expect(peak(renderEffects([cue('drop', 1, { gain: 0 })], N).L)).toBe(0);
  });

  test('pan is equal-power: all left at -1, all right at 1, the same level in both at 0', () => {
    const at = (pan: number) => renderEffects([cue('pop', 1, { pan })], N);
    expect(peak(at(-1).R)).toBeCloseTo(0, 6);
    expect(peak(at(-1).L)).toBeGreaterThan(0.01);
    expect(peak(at(1).L)).toBeCloseTo(0, 6);
    const middle = at(0);
    expect(peak(middle.L)).toBeCloseTo(peak(middle.R), 8);
    const hard = at(-1).L;
    for (const pan of [-0.5, 0, 0.3, 0.9]) {
      const { L, R } = at(pan);
      let worst = 0;
      for (let i = 0; i < N; i++) worst = Math.max(worst, Math.abs(Math.hypot(L[i]!, R[i]!) - Math.abs(hard[i]!)));
      expect(worst).toBeLessThan(1e-6);
    }
  });

  test('a pan beyond the ends is held at the end', () => {
    const wide = renderEffects([cue('pop', 1, { pan: 4 })], N), edge = renderEffects([cue('pop', 1, { pan: 1 })], N);
    expect(Buffer.from(wide.R.buffer).equals(Buffer.from(edge.R.buffer))).toBe(true);
  });

  test('each kind has its own default pan: click leans right, drop leans left', () => {
    const click = renderEffects([cue('click', 1)], N), drop = renderEffects([cue('drop', 1)], N);
    expect(peak(click.R)).toBeGreaterThan(peak(click.L));
    expect(peak(drop.L)).toBeGreaterThan(peak(drop.R));
  });

  test('a whoosh lasts as long as the move it follows (at least 0.3 s), plus a short tail', () => {
    const length = (dur?: number) => { const { L } = renderEffects([cue('whoosh-in', 0, { dur })], RATE * 3); const { first, last } = extent(L, 1e-5); return { first, seconds: (last + 1) / RATE }; };
    expect(length(1.5).seconds).toBeGreaterThan(1.2);
    expect(length(1.5).seconds).toBeLessThanOrEqual(1.65);
    expect(length(0.1).seconds).toBeLessThanOrEqual(0.45); // floor of 0.3 s, plus the tail
    expect(length(undefined).seconds).toBeGreaterThan(0.6); // default 0.8 s
  });

  test('a whoosh across pans from left to right over its length', () => {
    const { L, R } = renderEffects([cue('whoosh-across', 0, { dur: 1 })], RATE * 2);
    const energy = (a: Float32Array, from: number, to: number) => { let e = 0; for (let i = from; i < to; i++) e += a[i]! ** 2; return e; };
    const early = [0.05, 0.3].map((s) => s * RATE), late = [0.7, 0.95].map((s) => s * RATE);
    expect(energy(L, early[0]!, early[1]!)).toBeGreaterThan(energy(R, early[0]!, early[1]!));
    expect(energy(R, late[0]!, late[1]!)).toBeGreaterThan(energy(L, late[0]!, late[1]!));
  });

  test('a cue before the start is clipped to it, and one after the end is dropped, without error', () => {
    const early = renderEffects([cue('chime', -0.5)], RATE);
    expect(peak(early.L)).toBeGreaterThan(0.005);
    expect(early.L.length).toBe(RATE);
    expect(peak(renderEffects([cue('chime', 5)], RATE).L)).toBe(0);
    expect(peak(renderEffects([cue('chime', 0.9)], RATE).L)).toBeGreaterThan(0); // cut off at the end
  });

  test('overlapping cues add', () => {
    const one = renderEffects([cue('tick', 1)], N), two = renderEffects([cue('tick', 1), cue('tick', 1)], N);
    // the second tick has different noise, but the tonal part adds: more energy than one
    expect(peak(two.L)).toBeGreaterThan(peak(one.L) * 1.2);
  });
});

describe('voiceTrack', () => {
  const N = RATE * 4;

  test('scales each clip to a peak of 0.6, whatever its level', () => {
    const track = voiceTrack([clip({ at: 0.5 }, 1, sine(1000, 0.05)), clip({ id: 'b', at: 2.5 }, 1, sine(1000, 0.9))], N);
    expect(peak(track, 0, RATE * 2)).toBeCloseTo(0.6, 5);
    expect(peak(track, RATE * 2)).toBeCloseTo(0.6, 5);
  });

  test("starts a clip's 40 ms lead-in before the line's time, so the speech lands on it", () => {
    const samples = new Float32Array(RATE);
    samples.fill(0.5, 0.04 * RATE); // speech begins after the 40 ms lead-in, as trimSpeech leaves it
    const track = voiceTrack([clip({ at: 1.5 }, 0.9, samples)], N);
    expect(extent(track).first).toBe(1.5 * RATE);
  });

  test('puts lines that overlap on top of each other', () => {
    const ones = Float32Array.from({ length: 1000 }, () => 1);
    const track = voiceTrack([clip({ at: 1 }, 1, ones), clip({ id: 'b', at: 1 }, 1, ones)], N);
    expect(track[RATE - Math.round(0.04 * RATE) + 10]).toBeCloseTo(1.2, 6); // 0.6 + 0.6
  });

  test('drops what falls outside the track instead of failing', () => {
    expect(voiceTrack([clip({ at: 3.9 }, 1, sine(RATE, 1))], N).length).toBe(N);
    expect(peak(voiceTrack([clip({ at: 3.9 }, 1, sine(RATE, 1))], N))).toBeGreaterThan(0.5);
    expect(peak(voiceTrack([clip({ at: 100 }, 1, sine(RATE, 1))], N))).toBe(0);
    expect(peak(voiceTrack([clip({ at: 0 }, 1, sine(RATE, 1))], N), 0, 100)).toBeGreaterThan(0); // the lead-in before 0 is cut, the rest stays
  });

  test('a clip with nothing in it adds silence, not NaN', () => {
    const track = voiceTrack([clip({ at: 1 }, 0, new Float32Array(1000)), clip({ id: 'b', at: 2 }, 1, sine(1000, 0.5))], N);
    expect(track.every(Number.isFinite)).toBe(true);
    expect(peak(track, 0, RATE * 2 - 2000)).toBe(0);
    expect(peak(track)).toBeCloseTo(0.6, 5);
  });

  test('no clips is silence', () => {
    expect(peak(voiceTrack([], N))).toBe(0);
  });
});

describe('duckEnvelope', () => {
  const N = RATE * 10;
  const duck = duckEnvelope([clip({ at: 2 }, 3)], N); // speech from 2 s to 5 s

  test('leaves the effects alone before the first line', () => {
    expect(duck[0]).toBe(1);
    expect(duck[Math.round(1.9 * RATE)]).toBe(1);
  });

  test('settles about 5 dB down (0.55) while a line is spoken', () => {
    expect(duck[Math.round(4.9 * RATE)]).toBeCloseTo(0.55, 2);
    expect(Math.min(...duck)).toBeGreaterThan(0.549);
  });

  test('eases in over about 60 ms rather than jumping', () => {
    const at = (s: number) => duck[Math.round(s * RATE)]!;
    expect(at(2.0)).toBeCloseTo(1, 2);
    expect(at(2.06)).toBeCloseTo(1 - 0.45 * (1 - Math.exp(-1)), 1);
    expect(at(2.06)).toBeLessThan(at(2.02));
  });

  test('lets go over about 300 ms after the line, and is back to full by a second later', () => {
    const at = (s: number) => duck[Math.round(s * RATE)]!;
    expect(at(5.3)).toBeCloseTo(1 - 0.45 * Math.exp(-1), 1);
    expect(at(6.5)).toBeGreaterThan(0.99);
  });

  test('no narration is no ducking', () => {
    expect(Math.min(...duckEnvelope([], 1000))).toBe(1);
  });
});

describe('mixDown', () => {
  test('is the voice on both channels plus each effects channel at the duck gain', () => {
    const [left, right] = mixDown(Float32Array.of(0.5, 0, 0.25), Float32Array.of(1, 1, 1), Float32Array.of(0, 0.5, -1), Float32Array.of(1, 0.5, 0.25));
    expect([...left]).toEqual([1.5, 0.5, 0.5]);
    expect([...right]).toEqual([0.5, 0.25, 0]);
  });
});

describe('parseLoudness', () => {
  const log = `[Parsed_ebur128_0 @ 0x1] t: 0.1  M: -23.1 S: -120.7 I: -70.0 LUFS  LRA: 0.0 LU  FTPK: -10.0 dBFS  TPK: -10.0 dBFS
[Parsed_ebur128_0 @ 0x1] Summary:

  Integrated loudness:
    I:         -16.2 LUFS
    Threshold: -26.2 LUFS

  Loudness range:
    LRA:         3.1 LU

  True peak:
    Peak:       -1.7 dBFS
`;

  test('reads the integrated loudness and the true peak from the summary, not the running lines before it', () => {
    expect(parseLoudness(log)).toEqual({ integrated: -16.2, truePeak: -1.7 });
  });

  test('is NaN, not a crash, when ffmpeg printed no summary', () => {
    const { integrated, truePeak } = parseLoudness('ffmpeg: no such file');
    expect([integrated, truePeak].every(Number.isNaN)).toBe(true);
  });
});

describe('limit', () => {
  test('applies the gain to a signal that stays under the ceiling, and nothing else', () => {
    const channel = sine(RATE / 4, 0.1);
    const expected = Float32Array.from(channel, (v) => v * 2);
    limit([channel], 2, CEILING);
    expect(channel.every((v, i) => v === expected[i])).toBe(true);
  });

  test('holds a sustained overload at the ceiling, not a hair over it', () => {
    const flat = Float32Array.from({ length: 2000 }, () => 2);
    limit([flat], 1, 1);
    expect(peak(flat)).toBeLessThanOrEqual(1);
  });

  test('holds every sample under the ceiling, however hot the input', () => {
    const left = sine(RATE, 0.9, 97), right = sine(RATE, 0.7, 61);
    limit([left, right], 6, CEILING);
    expect(Math.max(peak(left), peak(right))).toBeLessThanOrEqual(CEILING + 1e-6);
    expect(peak(left)).toBeGreaterThan(CEILING * 0.9); // limited, not flattened
  });

  test('catches a lone spike, starting to duck it 5 ms ahead and recovering over ~120 ms', () => {
    const n = RATE, at = RATE / 2;
    const signal = Float32Array.from({ length: n }, (_, i) => (i === at ? 0.9 : 0.1));
    limit([signal], 1, 0.5);
    expect(signal[at]).toBeCloseTo(0.5, 5);
    expect(signal[at - 100]).toBeLessThan(0.1 * 0.95); // already reduced before the spike
    expect(signal[at - 400]).toBeCloseTo(0.1, 5); // but not earlier than the lookahead
    const reduction = (i: number) => signal[i]! / 0.1;
    expect(reduction(at + Math.round(0.12 * RATE))).toBeCloseTo(1 - (1 - 0.5 / 0.9) * Math.exp(-1), 1);
    expect(reduction(n - 1)).toBeGreaterThan(0.99); // all but recovered half a second on
  });

  test('takes the same reduction on both channels, so the stereo image holds', () => {
    const left = Float32Array.from({ length: 4800 }, (_, i) => (i === 2000 ? 1 : 0.2));
    const right = Float32Array.from({ length: 4800 }, () => 0.2);
    limit([left, right], 1, 0.5);
    expect(left[2000]).toBeCloseTo(0.5, 5);
    expect(right[2000]).toBeCloseTo(0.1, 5); // the spike's 0.5x applied to the quiet channel too
  });

  test('handles a channel shorter than a lookahead window', () => {
    const tiny = Float32Array.of(2, 2, 2);
    limit([tiny], 1, 1);
    expect(peak(tiny)).toBeLessThanOrEqual(1);
  });

  test('silence stays silence', () => {
    const silent = new Float32Array(1000);
    limit([silent], 100, CEILING);
    expect(peak(silent)).toBe(0);
  });
});

describe('writeWav and readWav', () => {
  test('write then read gives back the samples and the rate', () => {
    const samples = sine(500, 0.7);
    const { rate, samples: back } = readWav(writeWav([samples], 24000));
    expect(rate).toBe(24000);
    expect([...back]).toEqual([...samples]);
  });

  test('writes the 44-byte header of a 32-bit float WAV, interleaving channels', () => {
    const wav = writeWav([Float32Array.of(1, 2), Float32Array.of(-1, -2)], 48000);
    const view = new DataView(wav);
    const text = (at: number) => String.fromCharCode(...new Uint8Array(wav, at, 4));
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(view.getUint16(20, true)).toBe(3); // IEEE float
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(28, true)).toBe(48000 * 2 * 4);
    expect(view.getUint32(40, true)).toBe(2 * 2 * 4);
    expect(wav.byteLength).toBe(44 + 16);
    expect([0, 1, 2, 3].map((i) => view.getFloat32(44 + i * 4, true))).toEqual([1, -1, 2, -2]);
  });

  ffmpegTest('ffprobe agrees it is a stereo 48 kHz float WAV of the right length', async () => {
    const tmp = tempDir();
    try {
      const file = path.join(tmp.dir, 'one-second.wav');
      await Bun.write(file, writeWav([sine(RATE, 0.5, 48), sine(RATE, 0.5, 96)], RATE));
      expect(probeAudio(file)).toMatchObject({ codec: 'pcm_f32le', rate: 48000, channels: 2 });
      expect(probeAudio(file).duration).toBeCloseTo(1, 6);
    } finally {
      tmp.remove();
    }
  });
});

describe('resample', () => {
  test('gives round(length x to / from) samples', () => {
    expect(resample(new Float32Array(24000), 24000, 48000).length).toBe(48000);
    expect(resample(new Float32Array(1001), 24000, 48000).length).toBe(2002);
    expect(resample(new Float32Array(0), 24000, 48000).length).toBe(0);
  });

  test('at the same rate it is the identity', () => {
    const input = sine(300, 0.8, 37);
    expect([...resample(input, 48000, 48000)]).toEqual([...input]);
  });

  test('keeps a tone: 24 kHz up to 48 kHz tracks the same sine', () => {
    const hz = 1000;
    const input = Float32Array.from({ length: 2400 }, (_, i) => Math.sin((2 * Math.PI * hz * i) / 24000));
    const out = resample(input, 24000, 48000);
    let worst = 0;
    for (let n = 10; n < out.length - 10; n++) worst = Math.max(worst, Math.abs(out[n]! - Math.sin((2 * Math.PI * hz * n) / 48000)));
    expect(worst).toBeLessThan(2e-3);
  });

  test('holds a constant level, edges included', () => {
    const out = resample(Float32Array.from({ length: 100 }, () => 0.5), 24000, 48000);
    expect(out.every((v) => Math.abs(v - 0.5) < 1e-6)).toBe(true);
  });
});

describe('loudness against a real meter', () => {
  ffmpegTest('a 1 kHz sine at -23 dBFS RMS measures about -23 LUFS, and its true peak is its amplitude', async () => {
    const tmp = tempDir();
    try {
      const file = path.join(tmp.dir, 'tone.wav');
      const amp = 10 ** (-23 / 20) * Math.SQRT2; // RMS -23 dBFS
      const tone = Float32Array.from({ length: RATE * 3 }, (_, i) => amp * Math.sin((2 * Math.PI * 1000 * i) / RATE));
      await Bun.write(file, writeWav([tone], RATE));
      const { integrated, truePeak } = await lufs(file);
      expect(integrated).toBeCloseTo(-23, 0);
      expect(truePeak).toBeCloseTo(20 * Math.log10(amp), 0);
    } finally {
      tmp.remove();
    }
  });

  ffmpegTest('mixing to the target (gain from the meter, then the limiter) lands at -16 LUFS with peaks under -1.5 dBFS', async () => {
    const tmp = tempDir();
    try {
      const mix = async (signal: Float32Array) => {
        const probe = path.join(tmp.dir, 'probe.wav'), out = path.join(tmp.dir, 'mix.wav');
        await Bun.write(probe, writeWav([signal, signal], RATE));
        const gain = 10 ** ((-16 - (await lufs(probe)).integrated) / 20);
        const left = signal.slice(), right = signal.slice();
        limit([left, right], gain, CEILING);
        await Bun.write(out, writeWav([left, right], RATE));
        return { ...(await lufs(out)), samplePeak: Math.max(peak(left), peak(right)) };
      };
      const tone = Float32Array.from({ length: RATE * 3 }, (_, i) => 0.05 * Math.sin((2 * Math.PI * 300 * i) / RATE));
      const plain = await mix(tone);
      expect(plain.integrated).toBeCloseTo(-16, 0);
      expect(plain.samplePeak).toBeLessThanOrEqual(CEILING);

      // one hot click: the limiter holds it, and the loudness target is only slightly missed
      const clicked = tone.slice();
      clicked[RATE * 1.5] = 0.8;
      const hot = await mix(clicked);
      expect(hot.samplePeak).toBeLessThanOrEqual(CEILING + 1e-6);
      expect(hot.integrated).toBeGreaterThan(-17);
      expect(hot.integrated).toBeLessThan(-15.5);
    } finally {
      tmp.remove();
    }
  }, 30_000);
});
