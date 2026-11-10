// The faint controls at the top left of a slide, in slides mode and on the presenter's current slide:
// back, play/pause and next. They stay out of the way (low opacity until hovered or focused) so a shared
// screen is not distracted by them.
import { ICON } from './icons';

export const CORNER_HTML = `<div class="corner" role="group" aria-label="Slide controls">
  <button class="c-back" aria-label="Previous slide">${ICON.prev}</button>
  <button class="c-pause" aria-label="Pause">${ICON.pause}</button>
  <button class="c-next" aria-label="Next slide">${ICON.next}</button>
</div>`;

export type CornerState = { paused: boolean; canBack: boolean; canNext: boolean };

/** What the corner shows: pause while something moves (a step, or ambient motion on a held slide), play while frozen. */
export function paintCorner(corner: HTMLElement, state: CornerState) {
  const pause = corner.querySelector<HTMLButtonElement>('.c-pause')!;
  const label = state.paused ? 'Play' : 'Pause';
  if (pause.getAttribute('aria-label') !== label) {
    pause.setAttribute('aria-label', label);
    pause.innerHTML = state.paused ? ICON.play : ICON.pause;
  }
  corner.querySelector<HTMLButtonElement>('.c-back')!.disabled = !state.canBack;
  corner.querySelector<HTMLButtonElement>('.c-next')!.disabled = !state.canNext;
}
