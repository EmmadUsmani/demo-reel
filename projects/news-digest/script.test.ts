import { describe, expect, test } from 'bun:test';
import { SCRIPT, written } from './script';

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
