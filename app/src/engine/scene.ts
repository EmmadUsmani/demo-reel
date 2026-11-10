// Scenes lay out in logical 1920x1080 px; the engine scales the context for ?scale=2 (4K).
export const W = 1920;
export const H = 1080;
/** The render scale a page's query string asks for (`?scale=2`): a whole number, at least 1. */
export const scaleFromSearch = (search: string) => {
  const scale = Math.round(+(new URLSearchParams(search).get('scale') ?? 1));
  return Number.isFinite(scale) ? Math.max(1, scale) : 1;
};
export const SCALE = scaleFromSearch(typeof location === 'undefined' ? '' : location.search);
export const PW = W * SCALE;
export const PH = H * SCALE;

export type Frame = {
  /** Video time, s. */
  t: number;
  /**
   * A clock for motion that should keep going while a deck holds a slide (a drifting backdrop, a pulse,
   * packets flowing). It equals t in the video, every export and still; in the player's slides mode and
   * the presenter view it keeps advancing while a held slide's t stays on its stop (player/ambient.ts).
   */
  ambient: number;
  /** Time since this entry started, s. */
  lt: number;
  /** Entry progress, 0..1. */
  p: number;
  /** Entry length, s. */
  dur: number;
};

export type SceneContext = {
  g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  start: number;
  end: number;
  params: Record<string, any>;
};

export abstract class Scene {
  constructor(protected ctx: SceneContext) {}
  get g() { return this.ctx.g; }
  async init(): Promise<void> {}
  /** Draw the whole frame: the output must be a pure function of f.t and f.ambient (which is f.t in the video). */
  abstract render(f: Frame): void;
  cues(): Cue[] { return []; }
  narration(): Line[] { return []; }
  /**
   * Speaker notes for a deck, written per slide (see engine/notes.ts). A slide's notes are the notes
   * timed on the way to it; a slide with none shows the narration said on the way instead.
   */
  notes(): Note[] { return []; }
  /**
   * Where a deck pauses in this scene (scene-local, s): the moments each beat is fully built, a frame
   * before what follows starts to move. None means the scene's last frame (engine/stops.ts).
   */
  stops(): number[] { return []; }
  /** How long the scene wants to run, s, when its timeline entry leaves that to it. */
  duration(): number | undefined { return undefined; }
  /** Load whatever frame t needs (decoded clip frames) before render(t) draws it. */
  async prepare(_f: Frame): Promise<void> {}
}

export type SceneClass = new (ctx: SceneContext) => Scene;

/**
 * A sound a scene makes, at a time local to the scene. Scenes derive cues from the same constants
 * their animation uses, so a sound lands on its motion by construction. `scripts/audio.ts`
 * synthesises them (see its SFX table for what each kind sounds like).
 */
export type Cue = {
  kind: 'click' | 'key' | 'drop' | 'whoosh-in' | 'whoosh-out' | 'whoosh-across' | 'pop' | 'swish' | 'land' | 'chime' | 'tick' | 'wheel';
  t: number;
  /** Length of a sound that follows a motion (a whoosh over a camera move), s. */
  dur?: number;
  /** -1 (left) .. 1 (right) */
  pan?: number;
  /** Linear gain on the kind's default level. */
  gain?: number;
  /** Pitch multiplier, so repeats of a kind don't sound identical. */
  pitch?: number;
};

/**
 * A narration line: spoken from `at`, it must have finished by `until` (both scene-local), or
 * `scripts/audio.ts` refuses to mix and says by how much it overruns.
 */
export type Line = {
  id: string;
  at: number;
  until: number;
  /** What the narrator says, written for the ear (respellings, numbers in words). */
  text: string;
  /** The same line as it should read on screen (captions, speaker notes), when it differs from `text`. */
  caption?: string;
};

/** A speaker note, written for the presenter: shown from `at` (scene-local, s) like a narration line, but never spoken. */
export type Note = { at: number; text: string };
