// A beat played from a recorded clip: the footage in the browser window, the recorded pointer, and
// the sounds every recording makes (a click for each press, a tap for each key, a notch for each
// wheel step, air for each camera move). A subclass plans the playback and adds its own narration,
// camera and callouts.
import { loadFootage } from './assets';
import { ClipPlayer } from './clip';
import { sinceClick } from './cursor';
import { backdrop, clickRipple, cursor } from './draw';
import { Scene, type Cue, type Frame } from './scene';
import { AppView, cameraAt, cameraCues, type Camera } from './view';
import type { Ease } from './util';

export type CameraKey = [number, Camera, Ease?, number?];

/**
 * The address bar the way a visitor would read it: host and path, no protocol, no `www.`, no
 * trailing slash. `host` replaces the recorded host, so a local dev server (localhost:3000) reads as
 * the product's real domain.
 */
export function displayUrl(url: string, fallback: string, host?: string) {
  if (!url) return fallback;
  const parsed = new URL(url);
  const shown = host ?? parsed.host.replace(/^www\./, '');
  return `${shown}${parsed.pathname}${parsed.hash.startsWith('#/') ? parsed.hash : ''}`.replace(/\/$/, '');
}

export abstract class ClipScene extends Scene {
  protected view!: AppView;
  protected player!: ClipPlayer;
  /**
   * Which recording: footage/<footage>/, clip <clip>. `url` is what the address bar reads before the
   * recording's first URL is known; `host`, if set, replaces the recorded host in the address bar.
   */
  protected abstract readonly source: { footage: string; clip: string; url: string; host?: string };
  /** Lay out the playback with player.play() / hold(). */
  protected abstract plan(player: ClipPlayer): void;
  /** Scene times of every press in the recording that plays. */
  protected presses: number[] = [];

  async init() {
    const footage = await loadFootage(this.source.footage);
    this.player = new ClipPlayer(footage, this.source.clip);
    this.view = new AppView(footage, this.source.url);
    this.view.scrollY = this.player.clip.scrollY;
    this.plan(this.player);
    this.presses = this.player.events('press');
  }

  duration() { return this.player.duration; }
  async prepare(f: Frame) { await this.player.prepare(f.lt); }

  /** Camera keys in scene time; the default holds the whole window. */
  protected cameraKeys(): CameraKey[] { return [[0, this.view.wide]]; }
  /** Callouts, drawn in screen space over the app. */
  protected overlay(_f: Frame) {}
  /** Extra sounds beyond clicks, keys and camera moves. */
  protected sounds(): Cue[] { return []; }
  /** What the address bar reads for a recorded URL. */
  protected addressOf(url: string) { return displayUrl(url, this.source.url, this.source.host); }
  /** How visible the pointer is (1 by default): fade it out under a card that covers the app. */
  protected pointerAlpha(_lt: number) { return 1; }

  /** A mark's element box as the viewer sees it now. */
  protected screenBox(mark: string, key: string) {
    const box = this.player.boxes(mark)[key];
    if (!box) throw new Error(`clip '${this.source.clip}' mark '${mark}' has no box '${key}'`);
    return this.view.screenBox(box);
  }

  protected box(mark: string, key: string) {
    const box = this.player.boxes(mark)[key];
    if (!box) throw new Error(`clip '${this.source.clip}' mark '${mark}' has no box '${key}'`);
    return box;
  }

  cues(): Cue[] {
    return [
      ...this.presses.map((t): Cue => ({ kind: 'click', t })),
      ...this.player.events('key').map((t, i): Cue => ({ kind: 'key', t, pitch: 0.92 + 0.16 * ((i * 7) % 5) / 4 })),
      ...this.player.events('wheel').map((t): Cue => ({ kind: 'wheel', t })),
      ...cameraCues(this.cameraKeys()),
      ...this.sounds(),
    ];
  }

  render(f: Frame) {
    const { g, view, player } = this;
    view.camera = cameraAt(f.lt, this.cameraKeys());
    view.url = this.addressOf(player.url(f.lt));
    backdrop(g, f.t);
    const bitmap = player.bitmap(f.lt);
    view.draw(g, (page) => { if (bitmap) view.image(page, bitmap, player.clip.scrollY); });
    this.overlay(f);
    const pointer = player.pointer(f.lt);
    const [sx, sy] = view.screenOfPage(pointer.x, pointer.y);
    const size = Math.sqrt(view.magnification);
    const alpha = this.pointerAlpha(f.lt);
    if (alpha <= 0) return;
    g.save();
    g.globalAlpha = alpha;
    clickRipple(g, sx, sy, sinceClick(f.lt, this.presses), size);
    cursor(g, sx, sy, size, pointer.down ? 1 : 0);
    g.restore();
  }
}
