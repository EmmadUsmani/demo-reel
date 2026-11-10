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

  test('an empty deck has no slides: nothing moves, and every slide is the start', () => {
    const deck = new Deck([], 3);
    expect(deck.count).toBe(0);
    expect(deck.next()).toBeNull();
    expect(deck.prev()).toBeNull();
    expect(deck.go(0)).toEqual({ kind: 'show', t: 3 });
    expect(deck.slide).toBe(-1);
    deck.sync(50);
    expect(deck.slide).toBe(-1);
    expect(deck.arrive(50)).toBe(false);
  });

  test('a single slide: forward plays to it, then does nothing; back returns to the start', () => {
    const deck = new Deck([8], 0);
    expect(deck.next()).toEqual({ kind: 'play', from: 0, to: 8 });
    expect(deck.arrive(8)).toBe(true);
    expect(deck.next()).toBeNull();
    expect(deck.prev()).toEqual({ kind: 'show', t: 0 });
    expect(deck.slide).toBe(-1);
  });

  test('go below the start clamps to the start; the start of a scene embed is its own start, not 0', () => {
    const deck = new Deck([30, 40], 20);
    expect(deck.go(-7)).toEqual({ kind: 'show', t: 20 });
    expect(deck.slide).toBe(-1);
    expect(deck.next()).toEqual({ kind: 'play', from: 20, to: 30 });
  });

  test('go in the middle of a step cancels it', () => {
    const deck = new Deck([5, 10, 15], 0);
    deck.next();
    expect(deck.target).toBe(0);
    expect(deck.go(2)).toEqual({ kind: 'show', t: 15 });
    expect(deck.target).toBeNull();
    expect(deck.arrive(99)).toBe(false);
  });

  test('back during the very first step returns to the start', () => {
    const deck = new Deck([5, 10], 0);
    deck.next();
    expect(deck.prev()).toEqual({ kind: 'show', t: 0 });
    expect(deck.slide).toBe(-1);
    expect(deck.target).toBeNull();
  });

  test('arrive holds only once the step reaches its stop, and a late report still counts', () => {
    const deck = new Deck([5, 10], 0);
    expect(deck.arrive(5)).toBe(false); // no step is playing
    deck.next();
    expect(deck.arrive(4.999)).toBe(false);
    expect(deck.slide).toBe(-1);
    expect(deck.arrive(5.4)).toBe(true); // the frame that crossed the stop
    expect(deck.slide).toBe(0);
    expect(deck.arrive(10)).toBe(false); // already arrived
  });

  test('forward after finishing a step plays the next one', () => {
    const deck = new Deck([5, 10, 15], 0);
    deck.next();
    deck.next(); // finishes: show 5
    expect(deck.next()).toEqual({ kind: 'play', from: 5, to: 10 });
    expect(deck.target).toBe(1);
  });

  test('sync across slide boundaries: on a stop is that slide, a hair before is the one before', () => {
    const deck = new Deck([5, 10, 15], 0);
    deck.sync(5);
    expect(deck.slide).toBe(0);
    deck.sync(5 - 1e-3);
    expect(deck.slide).toBe(-1);
    deck.sync(5 - 1e-7); // within float noise of the stop
    expect(deck.slide).toBe(0);
    deck.sync(14.999);
    expect(deck.slide).toBe(1);
    deck.sync(1000);
    expect(deck.slide).toBe(2);
  });

  test('sync drops a step in progress', () => {
    const deck = new Deck([5, 10], 0);
    deck.next();
    deck.sync(7);
    expect(deck.target).toBeNull();
    expect(deck.slide).toBe(0);
    expect(deck.next()).toEqual({ kind: 'play', from: 5, to: 10 });
  });

  test('count and stops are the ones given', () => {
    const deck = new Deck([1, 2, 3], 0);
    expect(deck.count).toBe(3);
    expect(deck.stops).toEqual([1, 2, 3]);
  });

  test('upNext: the slide after the one on screen, or after the one being played to; none on the last', () => {
    const deck = new Deck([5, 10, 15], 0);
    expect(deck.upNext()).toBe(0);
    deck.next();
    expect(deck.upNext()).toBe(1);
    deck.arrive(5);
    expect(deck.upNext()).toBe(1);
    deck.go(1);
    expect(deck.upNext()).toBe(2);
    deck.go(2);
    expect(deck.upNext()).toBeNull();
    deck.prev();
    expect(deck.upNext()).toBe(2);
  });

  test('upNext on an empty deck is none; timeOf names a slide\'s time and the start', () => {
    expect(new Deck([], 0).upNext()).toBeNull();
    const deck = new Deck([5, 10], 2);
    expect(deck.timeOf(-1)).toBe(2);
    expect(deck.timeOf(1)).toBe(10);
  });
});
