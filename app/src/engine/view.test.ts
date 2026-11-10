import { afterEach, describe, expect, test } from 'bun:test';
import { AppView, cameraAt, cameraCues, insideWindow, mixCamera, type Camera } from './view';
import { WINDOW_BAR } from './draw';
import { H, W } from './scene';
import { ease } from './util';
import { expectCleanLog, fakeContext, range } from '../testing/fake-canvas';
import { bitmap, box, footage, installFakeOffscreenCanvas, shot } from '../testing/footage';

const wide: Camera = { fx: W / 2, fy: H / 2, zoom: 1 };
const newView = (over = {}) => new AppView(footage(over), 'demo.dev');

describe('AppView layout', () => {
  test('the window is centred, bar and page together', () => {
    const view = newView();
    expect(view.x).toBe((W - 1440) / 2);
    expect(view.y).toBe((H - (900 + WINDOW_BAR)) / 2);
    expect(view.viewportW).toBe(1440);
    expect(view.viewportH).toBe(900);
  });

  test('page px land in the window below its bar, shifted up by the scroll', () => {
    const view = newView();
    expect(view.worldOfPage(0, 0)).toEqual([view.x, view.y + WINDOW_BAR]);
    expect(view.worldOfPage(100, 50)).toEqual([view.x + 100, view.y + WINDOW_BAR + 50]);
    view.scrollY = 300;
    expect(view.worldOfPage(100, 300)).toEqual([view.x + 100, view.y + WINDOW_BAR]);
  });
});

describe('camera maths', () => {
  test('the wide camera is the identity from world to screen', () => {
    const view = newView();
    expect(view.screenOfWorld(123, 456)).toEqual([123, 456]);
    expect(view.wide).toEqual(wide);
  });

  test("the camera's focus is the middle of the screen, and distances scale by the zoom", () => {
    const view = newView();
    view.camera = { fx: 700, fy: 300, zoom: 2 };
    expect(view.screenOfWorld(700, 300)).toEqual([W / 2, H / 2]);
    expect(view.screenOfWorld(800, 300)).toEqual([W / 2 + 200, H / 2]);
    expect(view.screenOfWorld(700, 250)).toEqual([W / 2, H / 2 - 100]);
  });

  test('screenBox keeps a page box\'s corners and scales its size by the zoom', () => {
    const view = newView();
    expect(view.screenBox(box(10, 20, 30, 40))).toEqual({ x: view.x + 10, y: view.y + WINDOW_BAR + 20, w: 30, h: 40 });
    view.camera = { fx: W / 2, fy: H / 2, zoom: 3 };
    const b = view.screenBox(box(10, 20, 30, 40));
    expect(b.w).toBe(90);
    expect(b.h).toBe(120);
  });

  test('magnification is screen px per page px', () => {
    const view = newView();
    expect(view.magnification).toBe(1);
    view.camera = { ...wide, zoom: 2.5 };
    expect(view.magnification).toBe(2.5);
  });

  test('aim centres a page box on the screen at the zoom asked, for any box, zoom and scroll', () => {
    const view = newView();
    for (const scrollY of [0, 250, 1200]) {
      view.scrollY = scrollY;
      for (const b of [box(0, scrollY, 100, 40), box(700, scrollY + 300, 300, 200), box(1300, scrollY + 800, 120, 60)]) {
        for (const zoom of [1, 1.8, 3]) {
          view.camera = view.aim(b, zoom);
          const [sx, sy] = view.screenOfPage(b.x + b.w / 2, b.y + b.h / 2);
          expect(sx).toBeCloseTo(W / 2);
          expect(sy).toBeCloseTo(H / 2);
          expect(view.camera.zoom).toBe(zoom);
        }
      }
    }
  });

  test('aim\'s offset moves what is centred', () => {
    const view = newView();
    view.camera = view.aim(box(500, 300, 100, 100), 2, 40, -20);
    const [sx, sy] = view.screenOfPage(590, 330);
    expect(sx).toBeCloseTo(W / 2);
    expect(sy).toBeCloseTo(H / 2);
  });
});

describe('insideWindow', () => {
  const view = newView();

  test('leaves a camera that already sits inside the window alone', () => {
    const camera = { fx: view.x + 720, fy: view.y + 400, zoom: 2 };
    expect(insideWindow(view, camera)).toEqual(camera);
  });

  test('moves a close-up near the edge in, never changing its zoom', () => {
    const camera = { fx: view.x - 500, fy: view.y - 500, zoom: 2 };
    const fixed = insideWindow(view, camera);
    expect(fixed.zoom).toBe(2);
    expect(fixed.fx).toBe(view.x + W / 2 / 2);
    expect(fixed.fy).toBe(view.y + H / 2 / 2);
  });

  test('the frame never shows past the window, over a sweep of focuses and zooms', () => {
    for (const zoom of [1.5, 2, 3, 5]) {
      for (const fx of range(-200, W + 200, 12)) {
        for (const fy of range(-200, H + 200, 12)) {
          const c = insideWindow(view, { fx, fy, zoom });
          expect(c.fx - W / 2 / zoom).toBeGreaterThanOrEqual(view.x - 1e-9);
          expect(c.fx + W / 2 / zoom).toBeLessThanOrEqual(view.x + 1440 + 1e-9);
          expect(c.fy - H / 2 / zoom).toBeGreaterThanOrEqual(view.y - 1e-9);
          expect(c.fy + H / 2 / zoom).toBeLessThanOrEqual(view.y + WINDOW_BAR + 900 + 1e-9);
        }
      }
    }
  });

  test('zoomed out past the window\'s own size, it centres on the window', () => {
    const c = insideWindow(view, { fx: 0, fy: 0, zoom: 0.5 });
    expect(c.fx).toBe(view.x + 720);
    expect(c.fy).toBe(view.y + (WINDOW_BAR + 900) / 2);
  });
});

describe('mixCamera and cameraAt', () => {
  const a: Camera = { fx: 100, fy: 200, zoom: 1 }, b: Camera = { fx: 300, fy: 600, zoom: 4 };

  test('mixCamera starts at a, ends at b, and moves the focus linearly', () => {
    expect(mixCamera(a, b, 0)).toEqual(a);
    expect(mixCamera(a, b, 1)).toEqual(b);
    expect(mixCamera(a, b, 0.5)).toMatchObject({ fx: 200, fy: 400 });
  });

  test('mixCamera zooms geometrically, so a push feels even', () => {
    expect(mixCamera(a, b, 0.5).zoom).toBeCloseTo(2);
    expect(mixCamera(a, b, 0.25).zoom).toBeCloseTo(Math.SQRT2);
  });

  test('cameraAt holds the first camera before the first key and the last after the last', () => {
    const frames: [number, Camera, ((t: number) => number)?][] = [[1, a], [3, b]];
    expect(cameraAt(0, frames)).toEqual(a);
    expect(cameraAt(1, frames)).toEqual(a);
    expect(cameraAt(3, frames)).toEqual(b);
    expect(cameraAt(9, frames)).toEqual(b);
  });

  test('cameraAt moves with the second key\'s ease', () => {
    const mid = cameraAt(2, [[1, a], [3, b, ease.linear]]);
    expect(mid.fx).toBeCloseTo(200);
    expect(mid.zoom).toBeCloseTo(2);
  });

  test('hop pulls the zoom back mid-move and not at either end', () => {
    const frames: [number, Camera, ((t: number) => number)?, number?][] = [[0, a], [2, { ...a, fx: 900 }, ease.linear, 0.3]];
    expect(cameraAt(0, frames).zoom).toBe(1);
    expect(cameraAt(1, frames).zoom).toBeCloseTo(0.7);
    expect(cameraAt(2, frames).zoom).toBe(1);
    expect(cameraAt(0.5, frames).zoom).toBeGreaterThan(cameraAt(1, frames).zoom);
  });

  test('stays finite with a positive zoom across a whole keyframed move', () => {
    const frames: [number, Camera, ((t: number) => number)?, number?][] = [[0, wide], [1, b, ease.inOutQuart, 0.2], [2, a, ease.spring], [2.5, wide, ease.outBack]];
    for (const t of range(-1, 4, 300)) {
      const c = cameraAt(t, frames);
      expect(Number.isFinite(c.fx) && Number.isFinite(c.fy) && Number.isFinite(c.zoom)).toBe(true);
      expect(c.zoom).toBeGreaterThan(0);
    }
  });
});

describe('cameraCues', () => {
  const at = (fx: number, fy: number, zoom: number): Camera => ({ fx, fy, zoom });

  test('a camera that does not move makes no sound', () => {
    expect(cameraCues([[0, wide], [2, wide], [4, at(W / 2 + 5, H / 2, 1.01)]])).toEqual([]);
  });

  test('a zoom in, a zoom out and a pan are three different whooshes, timed to their move', () => {
    const cues = cameraCues([[0, wide], [1, at(W / 2, H / 2, 2)], [3, at(W / 2, H / 2, 1)], [4, at(W / 2 + 300, H / 2, 1)]]);
    expect(cues).toEqual([
      { kind: 'whoosh-in', t: 0, dur: 1, gain: 1 },
      { kind: 'whoosh-out', t: 1, dur: 2, gain: 1 },
      { kind: 'whoosh-across', t: 3, dur: 1, gain: 1 },
    ]);
  });

  test('the zoom ratio decides in / out / across at 1.15 and 0.87', () => {
    const kind = (ratio: number) => cameraCues([[0, wide], [1, at(W / 2, H / 2, ratio)]])[0]?.kind;
    expect(kind(1.16)).toBe('whoosh-in');
    expect(kind(1.1)).toBe('whoosh-across');
    expect(kind(0.86)).toBe('whoosh-out');
    expect(kind(0.9)).toBe('whoosh-across');
  });

  test('gain is passed through', () => {
    expect(cameraCues([[0, wide], [1, at(0, 0, 1)]], 0.4)[0]!.gain).toBe(0.4);
  });
});

describe('AppView drawing', () => {
  let canvases: ReturnType<typeof installFakeOffscreenCanvas>;
  afterEach(() => canvases?.restore());

  test('draw: what the layers paint in page px lands where screenOfPage says, at any camera and scroll', () => {
    const view = newView();
    for (const [camera, scrollY] of [[wide, 0], [{ fx: 900, fy: 500, zoom: 2.2 }, 0], [{ fx: 700, fy: 400, zoom: 1.4 }, 640]] as [Camera, number][]) {
      view.camera = camera;
      view.scrollY = scrollY;
      const g = fakeContext();
      let seen: [number, number][] = [];
      view.draw(g, (page) => { seen = [[0, scrollY], [400, scrollY + 120], [1440, scrollY + 900]].map(([px, py]) => (page as any).toDevice(px, py)); });
      expect(seen.length).toBe(3);
      [[0, scrollY], [400, scrollY + 120], [1440, scrollY + 900]].forEach(([px, py], i) => {
        const [sx, sy] = view.screenOfPage(px!, py!);
        expect(seen[i]![0]).toBeCloseTo(sx);
        expect(seen[i]![1]).toBeCloseTo(sy);
      });
      expectCleanLog(g);
    }
  });

  test('draw clips the page to the window, so a layer cannot paint over the bar or outside', () => {
    const view = newView();
    const g = fakeContext();
    let clipsWhenPainting = -1;
    view.draw(g, () => { clipsWhenPainting = g.calls('clip').length; });
    expect(clipsWhenPainting).toBe(1);
  });

  test('plate paints the whole shot when it fills the viewport, at 2x resolution', () => {
    const view = newView();
    const g = fakeContext();
    const s = shot();
    view.plate(g, s);
    expect(g.calls('drawImage')[0]!.args).toEqual([s.image, 0, 0, 2880, 1800, 0, 0, 1440, 900]);
  });

  test('plate paints only the part of a tall shot that is in view', () => {
    const view = newView();
    view.scrollY = 400;
    const g = fakeContext();
    const s = shot({ h: 3000, image: bitmap('tall', 2880, 6000) });
    view.plate(g, s);
    expect(g.calls('drawImage')[0]!.args.slice(1)).toEqual([0, 800, 2880, 1800, 0, 400, 1440, 900]);
  });

  test('plate places a viewport shot taken at another scroll offset at that offset', () => {
    const view = newView();
    view.scrollY = 0;
    const g = fakeContext();
    view.plate(g, shot({ scrollY: 300, h: 900 }));
    expect(g.calls('drawImage')[0]!.args.slice(1)).toEqual([0, 0, 2880, 1200, 0, 300, 1440, 600]);
  });

  test('plate paints nothing for a shot out of view, or at alpha 0 or less', () => {
    const view = newView();
    const g = fakeContext();
    view.plate(g, shot({ scrollY: 5000, h: 900 }));
    view.plate(g, shot(), 0);
    view.plate(g, shot(), -1);
    expect(g.calls('drawImage')).toEqual([]);
  });

  test('plate and image multiply the alpha already in force, and restore it', () => {
    const view = newView();
    const g = fakeContext();
    g.globalAlpha = 0.5;
    view.plate(g, shot(), 0.5);
    expect(g.calls('drawImage')[0]!.alpha).toBeCloseTo(0.25);
    view.image(g, bitmap(), 0, 0.2);
    expect(g.calls('drawImage')[1]!.alpha).toBeCloseTo(0.1);
    expect(g.globalAlpha).toBe(0.5);
    expectCleanLog(g);
  });

  test('image fits a frame to the viewport at a page offset', () => {
    const view = newView();
    const g = fakeContext();
    const frame = bitmap('frame');
    view.image(g, frame, 120);
    expect(g.calls('drawImage')[0]!.args).toEqual([frame, 0, 120, 1440, 900]);
    view.image(g, frame, 0, 0);
    expect(g.calls('drawImage').length).toBe(1);
  });

  describe('marquee', () => {
    const rail = box(100, 200, 800, 60);
    const extras = { marquee: { file: 'm.png', loopSeconds: 20, copyWidth: 1000, height: 40 } };
    const withTrack = () => newView({ extras, images: { 'm.png': bitmap('track', 4000, 80) } });

    test('is an error to ask for a track the capture did not lift', () => {
      expect(() => newView().marquee(fakeContext(), rail, 0)).toThrow("has no marquee extra 'marquee'");
    });

    test('draws nothing while the track image is missing', () => {
      const g = fakeContext();
      newView({ extras }).marquee(g, rail, 0);
      expect(g.log).toEqual([]);
    });

    test('slides one copy per loop and repeats every loop', () => {
      canvases = installFakeOffscreenCanvas(() => fakeContext());
      const view = withTrack();
      const g = fakeContext();
      const shift = (t: number) => {
        view.marquee(g, rail, t);
        const buffer = canvases.made[0]!.ctx as ReturnType<typeof fakeContext>;
        const x = buffer.calls('drawImage').at(-1)!.args[1] as number;
        buffer.clear();
        return x;
      };
      expect(shift(0)).toBeCloseTo(0);
      expect(shift(5)).toBeCloseTo(-1000 / 4 * 2); // a quarter loop = a quarter copy, at dpr 2
      expect(shift(10)).toBeCloseTo(-1000);
      expect(shift(20)).toBeCloseTo(0);
      expect(shift(25)).toBeCloseTo(shift(5));
    });

    test('fades the ends under a mask and draws the buffer into the rail', () => {
      canvases = installFakeOffscreenCanvas(() => fakeContext());
      const view = withTrack();
      const g = fakeContext();
      view.marquee(g, rail, 3);
      const buffer = canvases.made[0]!.ctx as ReturnType<typeof fakeContext>;
      expect(buffer.calls('createLinearGradient').length).toBe(1);
      expect(buffer.calls('set:globalCompositeOperation').map((c) => c.args[0])).toEqual(['source-over', 'destination-in']);
      expect(g.calls('drawImage')[0]!.args.slice(1)).toEqual([100, 200, 800, 40]);
      expectCleanLog(g);
    });

    test('keeps one buffer per rail size', () => {
      canvases = installFakeOffscreenCanvas(() => fakeContext());
      const view = withTrack();
      const g = fakeContext();
      view.marquee(g, rail, 1);
      view.marquee(g, rail, 2);
      view.marquee(g, box(0, 0, 400, 60), 2);
      expect(canvases.made.length).toBe(2);
      expect([canvases.made[0]!.width, canvases.made[0]!.height]).toEqual([1600, 80]);
    });
  });
});
