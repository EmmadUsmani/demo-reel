// A virtual clock for the page under capture, installed before any app script runs. Live, it follows
// real time and the app behaves normally. Frozen, nothing moves until the recorder advances it: then
// timers, requestAnimationFrame, performance.now/Date and every CSS / Web Animation step forward by
// exactly one frame, so a recording at 60 fps is 60 real frames of the app's own motion.
//
// It is a function so Playwright can serialise it into an init script; it closes over nothing.
export function installVirtualClock() {
  const w = window as any;
  if (w.__clock) return;
  const real = {
    setTimeout: window.setTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    raf: window.requestAnimationFrame.bind(window),
    perfNow: performance.now.bind(performance),
    fetch: window.fetch.bind(window),
    Date,
  };
  const origin = real.perfNow();
  const dateOrigin = Date.now();
  let frozen = false;
  let offset = 0; // virtual minus real, ms (only moves while frozen)
  let virtual = 0;
  const now = () => (frozen ? virtual : (virtual = real.perfNow() - origin + offset));

  type Timer = { fn: Function; args: unknown[]; due: number; every: number };
  const timers = new Map<number, Timer>();
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const schedule = (fn: unknown, delay: unknown, args: unknown[], repeat: boolean) => {
    if (typeof fn !== 'function') return 0;
    const ms = Math.max(0, Number(delay) || 0);
    const id = nextId++;
    timers.set(id, { fn, args, due: now() + ms, every: repeat ? Math.max(1, ms) : 0 });
    return id;
  };
  w.setTimeout = (fn: unknown, delay?: unknown, ...args: unknown[]) => schedule(fn, delay, args, false);
  w.setInterval = (fn: unknown, delay?: unknown, ...args: unknown[]) => schedule(fn, delay, args, true);
  w.clearTimeout = w.clearInterval = (id: number) => { timers.delete(id); };
  w.requestAnimationFrame = (cb: FrameRequestCallback) => { const id = nextId++; frames.set(id, cb); return id; };
  w.cancelAnimationFrame = (id: number) => { frames.delete(id); };
  performance.now = () => now();
  const VirtualDate = function (this: any, ...args: any[]) {
    if (!new.target) return new real.Date(dateOrigin + now()).toString();
    return args.length ? new (real.Date as any)(...args) : new real.Date(dateOrigin + now());
  } as any;
  VirtualDate.prototype = real.Date.prototype;
  VirtualDate.now = () => dateOrigin + now();
  VirtualDate.parse = real.Date.parse;
  VirtualDate.UTC = real.Date.UTC;
  w.Date = VirtualDate;

  /** Fire every timer due by `until`, in due order, with the clock reading each one's due time. */
  const runTimers = (until: number) => {
    for (let guard = 0; guard < 10_000; guard++) {
      let id = -1, first: Timer | null = null;
      for (const [key, timer] of timers) if (timer.due <= until && (!first || timer.due < first.due)) { id = key; first = timer; }
      if (!first) break;
      if (frozen) virtual = Math.max(virtual, first.due);
      if (first.every) first.due += first.every; else timers.delete(id);
      try { first.fn(...first.args); } catch (error) { console.error(error); }
    }
  };
  const runFrames = () => {
    const due = [...frames.values()];
    frames.clear();
    for (const cb of due) { try { cb(now()); } catch (error) { console.error(error); } }
  };

  // live: a real pump drives the virtual timers and frames
  real.setInterval(() => { if (!frozen) runTimers(now()); }, 4);
  const pump = () => { if (!frozen) runFrames(); real.raf(pump); };
  real.raf(pump);

  // every fetch in flight (and when it started), so a frame can wait for the network to answer
  const inFlight = new Map<number, number>();
  let fetchId = 0;
  w.fetch = (...args: Parameters<typeof fetch>) => {
    const id = fetchId++;
    inFlight.set(id, real.perfNow());
    return real.fetch(...args).finally(() => { inFlight.delete(id); });
  };
  // Waiting is for answers that are coming: a request or an image still pending after a few seconds
  // (a long poll, a lazy image clipped out of view that will never load) is stuck, not slow.
  const STUCK_MS = 2500;
  const pendingSince = new WeakMap<HTMLImageElement, number>();

  // Animations are paused and stepped by hand. A paused animation never finishes on its own — its
  // `finished` promise and finish event wait forever — and UI libraries wait on exactly that before
  // they unmount an exiting tooltip or panel, so one that reaches its end is finished explicitly.
  const controlled = new WeakSet<Animation>();
  const released = new WeakSet<Animation>();
  const takeAnimations = (dt: number) => {
    for (const animation of document.getAnimations()) {
      if (released.has(animation)) continue;
      if (!controlled.has(animation)) {
        controlled.add(animation);
        animation.pause();
      } else if (dt > 0) {
        animation.currentTime = (Number(animation.currentTime) || 0) + dt * animation.playbackRate;
      }
      const end = animation.effect?.getComputedTiming().endTime;
      if (typeof end === 'number' && Number.isFinite(end) && (Number(animation.currentTime) || 0) >= end) {
        released.add(animation);
        try { animation.finish(); } catch { /* an animation that can't finish (zero playback rate) just stays */ }
      }
    }
  };
  const realWait = (ms: number) => new Promise((done) => real.setTimeout(done, ms));

  w.__clock = {
    get frozen() { return frozen; },
    now,
    freeze() { now(); frozen = true; takeAnimations(0); },
    thaw() { offset = virtual - (real.perfNow() - origin); frozen = false; for (const a of document.getAnimations()) if (a.playState === 'paused') a.play(); },
    /** Step the frozen clock: timers due in the step fire, then a frame, then animations move on. */
    advance(dt: number) {
      const target = virtual + dt;
      runTimers(target);
      virtual = target;
      runFrames();
      takeAnimations(dt);
    },
    /**
     * Let the app catch up in real time without the clock moving: React commits, fetches answer,
     * images in view decode. Bounded, so a stuck request can't hang the recording.
     */
    async settle(maxMs = 3000) {
      const start = real.perfNow();
      await realWait(0);
      while (real.perfNow() - start < maxMs) {
        const at = real.perfNow();
        const pendingImages = Array.from(document.images).some((image) => {
          if (image.complete) return false;
          const r = image.getBoundingClientRect();
          if (!(r.bottom > 0 && r.top < innerHeight && r.width > 0)) return false;
          if (!pendingSince.has(image)) pendingSince.set(image, at);
          return at - pendingSince.get(image)! < STUCK_MS;
        });
        const pendingFetches = [...inFlight.values()].some((started) => at - started < STUCK_MS);
        if (!pendingFetches && !pendingImages) break;
        await realWait(10);
      }
      await realWait(8);
      takeAnimations(0);
    },
  };
}
