import { describe, expect, test } from 'bun:test';
import { fractionAt } from './progress';

describe('fractionAt', () => {
  test('is how far along the bar the pointer is', () => {
    expect(fractionAt(100, 100, 400)).toBe(0);
    expect(fractionAt(300, 100, 400)).toBe(0.5);
    expect(fractionAt(500, 100, 400)).toBe(1);
  });

  test('a drag past either end is clamped, and a bar with no width is empty', () => {
    expect(fractionAt(20, 100, 400)).toBe(0);
    expect(fractionAt(900, 100, 400)).toBe(1);
    expect(fractionAt(300, 100, 0)).toBe(0);
  });
});
