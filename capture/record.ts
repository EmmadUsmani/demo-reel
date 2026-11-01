// Recording the app's own motion, frame by frame, on the virtual clock (clock.ts). The recorder
// moves the real mouse and types real keys; after each input the clock steps exactly one frame and
// the frame is shot. Headless screenshots carry no OS pointer, so every frame logs where the mouse
// was and whether it was pressed: the renderer draws its cursor exactly there. Keystrokes and wheel
// notches are logged on the frame that shows them, for the renderer's sounds.
import type { Locator, Page } from 'playwright-core';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { boxOf, DPR, type Box, type Footage } from './lib';

export type ClipFrame = { file: string; x: number; y: number; down: boolean; url?: string; key?: string; wheel?: number };
export type Clip = { dir: string; fps: number; scrollY: number; frames: ClipFrame[]; marks: Record<string, { frame: number; scrollY: number; boxes: Record<string, Box> }> };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// Where the pointer was when the last clip stopped: the next clip of a session starts from there, so
// cuts between consecutive clips don't jump the cursor (or change what it hovers).
let lastPointer: { x: number; y: number } | null = null;

export class Recorder {
  readonly clip: Clip;
  private x: number;
  private y: number;
  private down = false;
  private readonly dir: string;
  private readonly dry: boolean;
  private startedAt = 0;
  private lastUrl = '';
  private pendingKey: string | undefined;
  private pendingWheel: number | undefined;

  /**
   * `dry`: rehearse the same inputs live, without freezing the clock or shooting frames, to reach a
   * later clip's starting state quickly. A dry run leaves the clip's existing footage alone.
   */
  constructor(private footage: Footage, private page: Page, readonly id: string, { fps = 60, from = lastPointer ?? { x: 1300, y: 860 }, dry = false } = {}) {
    this.dry = dry;
    this.dir = path.join(footage.dir, id);
    if (!dry) {
      rmSync(this.dir, { recursive: true, force: true });
      mkdirSync(this.dir, { recursive: true });
    }
    this.clip = { dir: id, fps, scrollY: 0, frames: [], marks: {} };
    this.x = from.x;
    this.y = from.y;
  }

  get dt() { return 1000 / this.clip.fps; }

  async start() {
    await this.page.mouse.move(this.x, this.y);
    await this.page.evaluate(() => (window as any).__clock.settle());
    if (this.dry) return this;
    this.clip.scrollY = await this.page.evaluate(() => window.scrollY);
    await this.page.evaluate(() => (window as any).__clock.freeze());
    this.startedAt = performance.now();
    await this.shoot();
    return this;
  }

  /** Advance one frame and shoot it. */
  async step() {
    if (this.dry) { await this.page.waitForTimeout(this.dt); return; }
    await this.page.evaluate((dt) => (window as any).__clock.advance(dt), this.dt);
    await this.page.evaluate(() => (window as any).__clock.settle());
    await this.shoot();
  }

  /**
   * Keep recording until `locator` is visible (at most `seconds`). Never `waitFor` mid-recording:
   * the clock is frozen between frames, so anything waiting on a timer (a debounced search) waits
   * forever.
   */
  async until(locator: Locator, seconds = 12) {
    for (let i = 0; i < Math.round(seconds * this.clip.fps); i++) {
      if (await locator.isVisible().catch(() => false)) return;
      await this.step();
    }
    throw new Error(`${this.id}: still waiting for ${locator} after ${seconds}s of recording`);
  }

  async hold(seconds: number) {
    for (let i = 0; i < Math.round(seconds * this.clip.fps); i++) await this.step();
  }

  /** Glide the pointer to (x, y) in viewport px over `seconds`, bowing slightly like a hand. */
  async moveTo(x: number, y: number, seconds: number) {
    const n = Math.max(1, Math.round(seconds * this.clip.fps));
    const x0 = this.x, y0 = this.y;
    for (let i = 1; i <= n; i++) {
      const k = ease(i / n), bow = 0.1 * Math.sin(Math.PI * k);
      this.x = x0 + (x - x0) * k - (y - y0) * bow;
      this.y = y0 + (y - y0) * k + (x - x0) * bow;
      await this.page.mouse.move(this.x, this.y);
      await this.step();
    }
  }

  /** A fresh session: the pointer starts from the default corner again. */
  static resetPointer() { lastPointer = null; }

  /** Move onto the centre of an element (or a point inside it, as fractions of its box). */
  async moveToElement(locator: Locator, seconds: number, fx = 0.5, fy = 0.5) {
    const box = (await locator.boundingBox())!;
    await this.moveTo(box.x + box.width * fx, box.y + box.height * fy, seconds);
  }

  async press() { this.down = true; await this.page.mouse.down(); await this.step(); }
  async release() { this.down = false; await this.page.mouse.up(); await this.step(); }

  /** A click: press, two frames held, release. */
  async click() {
    await this.press();
    await this.step();
    await this.release();
  }

  /**
   * A click that loads a new page (a link, a form submit, a server redirect). The new document comes
   * up with a live clock, so the load is not filmed: the frame after the press is the new page, once
   * it has loaded, `ready` has run on it (scroll it into place, wait for an element), and its clock is
   * frozen again. Returns the new page's URL.
   */
  async clickThrough(ready?: () => Promise<void>) {
    await this.press();
    await this.step();
    this.down = false;
    const loaded = this.page.waitForEvent('load', { timeout: 60_000 });
    await this.page.mouse.up();
    await loaded;
    if (ready) await ready();
    await this.page.evaluate(() => (window as any).__clock.settle());
    if (this.dry) return this.page.url();
    await this.page.evaluate(() => (window as any).__clock.freeze());
    await this.shoot();
    return this.page.url();
  }

  /**
   * One wheel notch of `deltaY` CSS px over the pointer, then `frames` frames for the page to react.
   * Chrome divides a synthetic wheel delta by the device pixel ratio, so it is sent scaled up.
   */
  async wheel(deltaY: number, frames = 3) {
    await this.page.mouse.wheel(0, deltaY * DPR);
    this.pendingWheel = deltaY;
    for (let i = 0; i < frames; i++) await this.step();
  }

  /** Type text a key at a time, `seconds` apart. */
  async type(text: string, seconds = 0.07) {
    for (const char of text) {
      await this.page.keyboard.type(char);
      this.pendingKey = char;
      for (let i = 0; i < Math.max(1, Math.round(seconds * this.clip.fps)); i++) await this.step();
    }
  }

  /** Press one named key (Enter, Escape, Tab, ArrowDown...), then `frames` frames for the page to react. */
  async key(name: string, frames = 3) {
    await this.page.keyboard.press(name);
    this.pendingKey = name;
    for (let i = 0; i < Math.max(1, frames); i++) await this.step();
  }

  /** Record where elements are at the current frame (document px), for the scene to aim at. */
  async mark(name: string, boxes: Record<string, Locator> = {}) {
    if (this.dry) return;
    const measured: Record<string, Box> = {};
    for (const [key, locator] of Object.entries(boxes)) measured[key] = await boxOf(locator.first());
    // the page's own scroll at the mark: a clip that navigates changes it mid-recording
    this.clip.marks[name] = { frame: this.clip.frames.length - 1, scrollY: await this.page.evaluate(() => window.scrollY), boxes: measured };
  }

  async stop() {
    lastPointer = { x: this.x, y: this.y };
    if (this.dry) { await this.page.evaluate(() => (window as any).__clock.settle()); console.log(`  ${this.id}: rehearsed (dry)`); return; }
    await this.page.evaluate(() => (window as any).__clock.thaw());
    this.footage.clips[this.id] = this.clip;
    const perFrame = (performance.now() - this.startedAt) / this.clip.frames.length;
    console.log(`  ${this.id}: ${this.clip.frames.length} frames (${(this.clip.frames.length / this.clip.fps).toFixed(2)} s), ${perFrame.toFixed(0)} ms per frame to record`);
  }

  private async shoot() {
    const file = `${String(this.clip.frames.length).padStart(4, '0')}.jpg`;
    await this.page.screenshot({ path: path.join(this.dir, file), type: 'jpeg', quality: 90, caret: 'hide' });
    // the address bar, recorded where it changes; a keystroke, on the frame that shows it
    const url = this.page.url();
    this.clip.frames.push({ file, x: this.x, y: this.y, down: this.down, ...(url !== this.lastUrl ? { url } : {}), ...(this.pendingKey ? { key: this.pendingKey } : {}), ...(this.pendingWheel ? { wheel: this.pendingWheel } : {}) });
    this.lastUrl = url;
    this.pendingKey = undefined;
    this.pendingWheel = undefined;
    if (this.clip.frames.length % 120 === 0) process.stdout.write(`    ${this.id}: ${this.clip.frames.length} frames, ${((performance.now() - this.startedAt) / this.clip.frames.length).toFixed(0)} ms each\n`);
  }
}
