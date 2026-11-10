import { describe, expect, test } from 'bun:test';
import { readWav, speechSeconds, takeKey, writeWav } from './vo';

describe('takeKey', () => {
  test('names a take by voice, speed and text: 12 hex digits of their SHA-1', () => {
    const sha = (s: string) => new Bun.CryptoHasher('sha1').update(s).digest('hex').slice(0, 12);
    expect(takeKey('af_heart', 1.1, 'Hello there.')).toBe(sha('af_heart|1.1|Hello there.'));
    expect(takeKey('af_heart', 1, 'Hello there.')).toBe(sha('af_heart|1|Hello there.'));
    expect(takeKey('af_heart', 1.1, 'x')).toMatch(/^[0-9a-f]{12}$/);
  });

  test('any change to the line, voice or speed is a new take', () => {
    const keys = [takeKey('af_heart', 1.1, 'a'), takeKey('af_heart', 1.1, 'b'), takeKey('af_sky', 1.1, 'a'), takeKey('af_heart', 1, 'a')];
    expect(new Set(keys).size).toBe(4);
  });
});

describe('WAV files', () => {
  const samples = Float32Array.from([0, 0.5, -0.5, 1, -1, 0.25]);

  test('round-trip a mono float take and its rate', () => {
    const back = readWav(writeWav(samples, 24000));
    expect(back.rate).toBe(24000);
    expect([...back.samples]).toEqual([...samples]);
  });

  test('are the layout audio.ts reads: RIFF/WAVE, IEEE float, one channel, 32 bits', () => {
    const view = new DataView(writeWav(samples, 24000));
    const tag = (at: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(at + i)));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(view.getUint16(20, true)).toBe(3);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(32);
    expect(view.getUint32(28, true)).toBe(24000 * 4);
    expect(view.getUint32(4, true)).toBe(view.byteLength - 8);
    expect(view.getUint32(40, true)).toBe(samples.length * 4);
  });
});

describe('speechSeconds', () => {
  const take = (silenceBefore: number, speech: number, silenceAfter: number) =>
    Float32Array.from([...Array(silenceBefore).fill(0.001), ...Array(speech).fill(0.5), ...Array(silenceAfter).fill(-0.005)]);

  test('measures from the first to the last sample that is not near-silent', () => {
    expect(speechSeconds(take(200, 300, 500), 100)).toBe(2.99); // 299 samples between first and last
  });

  test('is the same wherever the speech sits in the take', () => {
    expect(speechSeconds(take(0, 300, 0), 100)).toBe(speechSeconds(take(50, 300, 70), 100));
  });

  test('rounds to the millisecond', () => {
    expect(speechSeconds(take(0, 3, 0), 3)).toBe(0.667);
  });
});
