// The player's keyboard: which command a key is, in each mode. Pure, so it is tested without a browser
// (keys.test.ts); the player carries the command out.
import type { Mode } from './player';

export type Command =
  | { kind: 'next' } | { kind: 'prev' }
  /** Slides: jump to the first (the start of the video) or the last slide. */
  | { kind: 'slide'; to: 'first' | 'last' }
  | { kind: 'toggle' }
  /** Video: move by this many seconds. */
  | { kind: 'seekBy'; by: number }
  | { kind: 'seekStart' }
  | { kind: 'narration' } | { kind: 'captions' } | { kind: 'notes' } | { kind: 'mode' } | { kind: 'mute' } | { kind: 'fullscreen' }
  | { kind: 'closeShare' };

/** A shift-arrow steps one frame; an arrow, this many seconds. */
export const SEEK_STEP = 5;
export const FRAME_STEP = 1 / 60;

/** The command for a key (KeyboardEvent.key) in this mode, or null when the player ignores it. */
export function keyCommand(key: string, shift: boolean, mode: Mode): Command | null {
  const slides = mode === 'slides';
  if (slides && [' ', 'ArrowRight', 'PageDown', 'Enter'].includes(key)) return { kind: 'next' };
  if (slides && ['ArrowLeft', 'PageUp', 'Backspace'].includes(key)) return { kind: 'prev' };
  if (slides && key === 'Home') return { kind: 'slide', to: 'first' };
  if (slides && key === 'End') return { kind: 'slide', to: 'last' };
  switch (key) {
    case ' ': case 'k': return { kind: 'toggle' };
    case 'ArrowRight': return { kind: 'seekBy', by: shift ? FRAME_STEP : SEEK_STEP };
    case 'ArrowLeft': return { kind: 'seekBy', by: -(shift ? FRAME_STEP : SEEK_STEP) };
    case 'Home': return { kind: 'seekStart' };
    case 'n': return { kind: 'narration' };
    case 'c': return { kind: 'captions' };
    case 's': return { kind: 'notes' };
    case 'v': return { kind: 'mode' };
    case 'm': return { kind: 'mute' };
    case 'f': return { kind: 'fullscreen' };
    case 'Escape': return { kind: 'closeShare' };
    default: return null;
  }
}
