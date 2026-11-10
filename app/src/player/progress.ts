// The progress bar of a step: a thin bar along the top of the slide that fills as the step plays, shows
// when it is paused and turns a different colour once the slide has arrived. It is also a slider: drag it
// to move within the step, or focus it and use ← / →. The player (slides mode) and the presenter both
// carry one; the fraction and state come from Deck.progress, the seeking from Deck.scrub.
import type { Progress } from './deck';

export const PROGRESS_HTML = '<div class="progress" role="slider" tabindex="0" aria-label="Step progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="Not started" data-state="empty" data-fraction="0"><i></i></div>';

/** How far a ← / → on the focused bar moves it, as a fraction of the step. */
export const NUDGE = 0.05;

const SPOKEN = { empty: 'Not started', playing: 'Playing', paused: 'Paused', done: 'Done' };

/** Show `progress` on the bar `bar` (made from PROGRESS_HTML): its fill, and its state for the stylesheet, the tests and screen readers. */
export function paintProgress(bar: HTMLElement, progress: Progress) {
  const fraction = progress.fraction.toFixed(3);
  if (bar.dataset.fraction !== fraction) {
    bar.dataset.fraction = fraction;
    (bar.firstElementChild as HTMLElement).style.transform = `scaleX(${fraction})`;
    bar.setAttribute('aria-valuenow', String(Math.round(progress.fraction * 100)));
  }
  if (bar.dataset.state !== progress.state) {
    bar.dataset.state = progress.state;
    bar.setAttribute('aria-valuetext', SPOKEN[progress.state]);
  }
}

/** The fraction of a bar `width` px wide at `left` that the pointer at `x` is over: 0..1, whatever the pointer does outside it. */
export function fractionAt(x: number, left: number, width: number): number {
  return width > 0 ? Math.min(1, Math.max(0, (x - left) / width)) : 0;
}

export type Scrub = {
  /** A drag begins. */
  start(): void;
  /** The pointer is at this fraction of the bar. */
  to(fraction: number): void;
  /** The drag is over (released or cancelled). */
  end(): void;
  /** ← (-NUDGE) or → (NUDGE) on the focused bar. */
  nudge(by: number): void;
};

/** Let the bar be dragged, and moved with ← / → while it has focus (the arrows then are not slide navigation). */
export function attachScrub(bar: HTMLElement, scrub: Scrub) {
  let dragging = false;
  const fraction = (event: PointerEvent) => { const box = bar.getBoundingClientRect(); return fractionAt(event.clientX, box.left, box.width); };
  bar.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    bar.setPointerCapture(event.pointerId);
    event.preventDefault(); // no focus from a drag: the arrows stay slide navigation until the bar is tabbed to
    scrub.start();
    scrub.to(fraction(event));
  });
  bar.addEventListener('pointermove', (event) => { if (dragging) scrub.to(fraction(event)); });
  const finish = () => { if (dragging) { dragging = false; scrub.end(); } };
  bar.addEventListener('pointerup', finish);
  bar.addEventListener('pointercancel', finish);
  bar.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    scrub.nudge(event.key === 'ArrowRight' ? NUDGE : -NUDGE);
  });
}
