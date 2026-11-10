import { describe, expect, test } from 'bun:test';
import { SCRIPT, written } from './script';
import VO from './vo-lengths.json';

describe('written(): the narration as captions and notes show it', () => {
  test('respellings read as the words are written', () => {
    expect(written('A Nest J.S. A.P.I. serves a React app, and Bull M.Q. queues run on Reddis.')).toBe('A NestJS API serves a React app, and BullMQ queues run on Redis.');
    expect(written('It goes into steering dot M.D., on one exe dot dev V.M.')).toBe('It goes into STEERING.md, on one exe.dev VM.');
    expect(written('a capped x A.I. search, verified through oh-embed, under system D')).toBe('a capped xAI search, verified through oEmbed, under systemd');
  });

  test('an acronym that ends a sentence keeps its full stop', () => {
    expect(written('Each runs on the V.M. Then it ships.')).toBe('Each runs on the VM. Then it ships.');
    expect(written('Tests never call paid A.P.I.s, ever.')).toBe('Tests never call paid APIs, ever.');
  });

  test('no line of the script keeps a spoken-only spelling', () => {
    for (const line of Object.values(SCRIPT)) expect(written(line)).not.toMatch(/(?:[A-Z]\.){2,}|Reddis|oh-embed| dot (dev|M)|system D|P\.N\.P\.M/);
  });
});

describe('written(): the cases a respelling rule could get wrong', () => {
  test('a line with nothing respelled is unchanged, and writing twice is the same as once', () => {
    expect(written('Postgres and Haiku, side by side.')).toBe('Postgres and Haiku, side by side.');
    for (const line of Object.values(SCRIPT)) expect(written(written(line))).toBe(written(line));
  });

  test('an acronym followed by more of the sentence loses its dots, and keeps none', () => {
    expect(written('through the exe dot dev L.L.M. gateway')).toBe('through the exe.dev LLM gateway');
    expect(written('from the C.L.I.’s event stream')).toBe('from the CLI’s event stream');
    expect(written('Postgres, then Bull M.Q. queues')).toBe('Postgres, then BullMQ queues');
  });

  test('an acronym ending the line keeps its full stop; one before a capital does too', () => {
    expect(written('We run on one V.M.')).toBe('We run on one VM.');
    expect(written('It runs on a V.M. Codex then starts.')).toBe('It runs on a VM. Codex then starts.');
  });

  test('every respelling is replaced wherever it repeats', () => {
    expect(written('Reddis, Reddis and Reddis')).toBe('Redis, Redis and Redis');
    expect(written('system D, then system D again')).toBe('systemd, then systemd again');
  });
});

describe('script.ts: the narration lines', () => {
  const lines = Object.entries(SCRIPT);

  test('every id is short and lower-case, with no spaces', () => {
    for (const [id] of lines) expect(id, id).toMatch(/^[a-z][a-z0-9]*$/);
  });

  test('every line is a clean sentence: no stray spaces, ends in punctuation, no digits (numbers are in words)', () => {
    for (const [id, text] of lines) {
      expect(text, id).toBe(text.trim());
      expect(text, id).not.toMatch(/ {2}/);
      expect(text, id).toMatch(/[.!?]$/);
      expect(text, id).not.toMatch(/\d/);
      expect(text.length, id).toBeGreaterThan(10);
    }
  });

  test('no line is said twice', () => {
    const texts = lines.map(([, text]) => text);
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe('vo-lengths.json agrees with the script', () => {
  const measured = VO as Record<string, number>;

  test('has a length for every line, and none for a line that is gone', () => {
    expect(Object.keys(measured).sort()).toEqual(Object.keys(SCRIPT).sort());
  });

  test('every length is a real duration in step with its line (a stale one, from before the line changed, is not)', () => {
    for (const [id, seconds] of Object.entries(measured)) {
      const charsPerSecond = SCRIPT[id]!.length / seconds;
      expect(seconds, id).toBeGreaterThan(0.5);
      expect(charsPerSecond, `${id}: ${seconds}s for "${SCRIPT[id]}"`).toBeGreaterThan(10);
      expect(charsPerSecond, `${id}: ${seconds}s for "${SCRIPT[id]}"`).toBeLessThan(25);
    }
  });
});
