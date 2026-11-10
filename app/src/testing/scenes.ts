// Checks every scene has to pass, whatever it draws.
import { expect } from 'bun:test';
import type { Scene } from '../engine/scene';
import { expectCleanLog, fakeContext, range, snapshot, type FakeContext } from './fake-canvas';

/** Render `scene` at scene-local time `lt` on a fresh fake context. */
export function renderAt(scene: Scene, lt: number, dur: number, start = 7): FakeContext {
  const g = fakeContext();
  (scene as any).ctx.g = g;
  scene.render({ t: start + lt, lt, p: lt / dur, dur });
  return g;
}

/**
 * Over `n` steps across the scene (and a little before and past it): no NaN or Infinity reaches the
 * context, every alpha is within [0, 1], the state stack ends where it began, and drawing the same
 * time twice gives the identical call log.
 */
export function expectPureRender(scene: Scene, dur: number, n = 90) {
  for (const lt of [-0.5, ...range(0, dur, n), dur + 0.5]) {
    const first = renderAt(scene, lt, dur);
    expectCleanLog(first);
    expect(snapshot(renderAt(scene, lt, dur)), `at ${lt}`).toEqual(snapshot(first));
  }
}

/** The alpha every text or image the frame drew was drawn at. */
export const visibleAlphas = (g: FakeContext) => g.log.filter((c) => c.op === 'fillText' || c.op === 'drawImage').map((c) => c.alpha);
