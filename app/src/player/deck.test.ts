import { describe, expect, test } from 'bun:test';
import { Deck } from './deck';

describe('Deck', () => {
  test('starts before the first slide; forward plays to it and holds', () => {
    const deck = new Deck([5, 10, 15], 0);
    expect(deck.slide).toBe(-1);
    expect(deck.next()).toEqual({ kind: 'play', from: 0, to: 5 });
    expect(deck.arrive(4.9)).toBe(false);
    expect(deck.arrive(5)).toBe(true);
    expect(deck.slide).toBe(0);
    expect(deck.next()).toEqual({ kind: 'play', from: 5, to: 10 });
  });

  test('forward during a step finishes it at once', () => {
    const deck = new Deck([5, 10], 0);
    deck.next();
    expect(deck.next()).toEqual({ kind: 'show', t: 5 });
    expect(deck.slide).toBe(0);
    expect(deck.target).toBeNull();
  });

  test('back during a step returns to where it started; back when holding shows the previous slide', () => {
    const deck = new Deck([5, 10, 15], 0);
    deck.go(1);
    deck.next();
    expect(deck.prev()).toEqual({ kind: 'show', t: 10 });
    expect(deck.prev()).toEqual({ kind: 'show', t: 5 });
    expect(deck.prev()).toEqual({ kind: 'show', t: 0 });
    expect(deck.slide).toBe(-1);
    expect(deck.prev()).toBeNull();
  });

  test('forward on the last slide does nothing', () => {
    const deck = new Deck([5, 10], 0);
    deck.go(1);
    expect(deck.next()).toBeNull();
  });

  test('go clamps; sync picks the slide on screen at a video time', () => {
    const deck = new Deck([5, 10, 15], 2);
    expect(deck.go(99)).toEqual({ kind: 'show', t: 15 });
    deck.sync(12);
    expect(deck.slide).toBe(1);
    deck.sync(1);
    expect(deck.slide).toBe(-1);
    deck.sync(10);
    expect(deck.slide).toBe(1);
  });
});
