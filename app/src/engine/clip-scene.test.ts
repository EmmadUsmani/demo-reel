import { afterEach, describe, expect, test } from 'bun:test';
import { ClipScene, displayUrl, type CameraKey } from './clip-scene';
import type { ClipPlayer } from './clip';
import type { Cue, Frame } from './scene';
import { expectCleanLog, fakeContext, range, snapshot } from '../testing/fake-canvas';
import { clip, installFakeNetwork } from '../testing/footage';

describe('displayUrl', () => {
  test('is the fallback until a recorded address is known', () => {
    expect(displayUrl('', 'demo.dev')).toBe('demo.dev');
  });

  test('reads like an address bar: no protocol, no www, no trailing slash', () => {
    expect(displayUrl('https://www.example.com/', 'x')).toBe('example.com');
    expect(displayUrl('http://example.com/pricing/', 'x')).toBe('example.com/pricing');
    expect(displayUrl('https://app.example.com:8080/a/b', 'x')).toBe('app.example.com:8080/a/b');
  });

  test('drops the query, and keeps a hash only when it is a route', () => {
    expect(displayUrl('https://example.com/a?x=1', 'x')).toBe('example.com/a');
    expect(displayUrl('https://example.com/#/board/3', 'x')).toBe('example.com/#/board/3');
    expect(displayUrl('https://example.com/page#section', 'x')).toBe('example.com/page');
  });

  test('a host override stands in for the recorded host (localhost reads as the product)', () => {
    expect(displayUrl('http://localhost:3000/pricing', 'x', 'acme.com')).toBe('acme.com/pricing');
    expect(displayUrl('http://localhost:3000/', 'x', 'acme.com')).toBe('acme.com');
  });
});

const frames = clip(60).frames.map((f, i) => ({ ...f, key: i === 5 || i === 6 ? 'a' : undefined, wheel: i === 30 ? 100 : undefined, url: i === 0 ? 'http://localhost:3000/' : undefined }));
const manifest = (name: string) => ({
  dpr: 2,
  viewport: { width: 1440, height: 900 },
  shots: {},
  clips: { demo: clip(60, { frames, marks: { m: { frame: 30, boxes: { btn: { x: 100, y: 100, w: 200, h: 50 } } } } }) },
});

class Demo extends ClipScene {
  extraCamera: CameraKey[] | undefined;
  alpha = 1;
  protected readonly source = { footage: this.ctx.params.name as string, clip: 'demo', url: 'demo.dev', host: 'acme.com' };
  protected plan(player: ClipPlayer) { player.play('start', 'end').hold(1); }
  protected cameraKeys(): CameraKey[] { return this.extraCamera ?? super.cameraKeys(); }
  protected sounds(): Cue[] { return [{ kind: 'pop', t: 0.4 }]; }
  protected pointerAlpha() { return this.alpha; }
  protected overlay() { this.g.fillRect(1, 2, 3, 4); }
  get v() { return this.view; }
  box_(mark: string, key: string) { return this.box(mark, key); }
  screenBox_(mark: string, key: string) { return this.screenBox(mark, key); }
}

describe('ClipScene defaults', () => {
  let network: ReturnType<typeof installFakeNetwork>;
  afterEach(() => network?.restore());
  class Plain extends ClipScene {
    protected readonly source = { footage: 'csplain', clip: 'demo', url: 'demo.dev' };
    protected plan(player: ClipPlayer) { player.play('start', 'end'); }
    get camera() { return this.cameraKeys(); }
    get view_() { return this.view; }
    address(url: string) { return this.addressOf(url); }
    alphaAt(lt: number) { return this.pointerAlpha(lt); }
  }

  test('hold the whole window, show the pointer, and read the address as recorded', async () => {
    network = installFakeNetwork({ 'footage/csplain/manifest.json': manifest('csplain') });
    const scene = new Plain({ g: fakeContext(), start: 0, end: 0, params: {} });
    await scene.init();
    expect(scene.camera).toEqual([[0, scene.view_.wide]]);
    expect(scene.alphaAt(1)).toBe(1);
    expect(scene.address('https://www.demo.dev/a/')).toBe('demo.dev/a');
    expect(scene.address('')).toBe('demo.dev');
    expect(scene.cues().every((c) => ['click', 'key', 'wheel'].includes(c.kind))).toBe(true);
  });
});

describe('ClipScene', () => {
  let network: ReturnType<typeof installFakeNetwork>;
  afterEach(() => network?.restore());

  // loadFootage caches by name for the life of the process, so every scene gets its own footage name
  let count = 0;
  const served = (name: string, over = {}) => ({
    [`footage/${name}/manifest.json`]: { ...manifest(name), ...over },
    ...Object.fromEntries(frames.map((f) => [`footage/${name}/clips/demo/${f.file}`, {}])),
  });
  const make = async (setup?: (s: Demo) => void) => {
    const name = `cs${++count}`;
    network = installFakeNetwork(served(name));
    const g = fakeContext();
    const scene = new Demo({ g, start: 0, end: 0, params: { name } });
    setup?.(scene);
    await scene.init();
    return { scene, g };
  };
  const frame = (lt: number, dur = 60 / 60 + 1): Frame => ({ t: lt + 10, lt, p: lt / dur, dur });

  test('its length is the planned playback', async () => {
    const { scene } = await make();
    expect(scene.duration()).toBeCloseTo(59 / 60 + 1);
  });

  test('the page starts at the clip\'s scroll', async () => {
    const name = `cs${++count}`;
    network = installFakeNetwork(served(name, { clips: { demo: clip(60, { scrollY: 240 }) } }));
    const scene = new Demo({ g: fakeContext(), start: 0, end: 0, params: { name } });
    await scene.init();
    expect(scene.v.scrollY).toBe(240);
  });

  test('makes the sounds a recording makes: a click per press, a tap per key, a notch per wheel step, plus its own', async () => {
    const { scene } = await make();
    const cues = scene.cues();
    const of = (kind: string) => cues.filter((c) => c.kind === kind);
    expect(of('click').map((c) => c.t)).toEqual([10 / 60]);
    expect(of('key').length).toBe(2);
    expect(of('wheel').length).toBe(1);
    expect(of('wheel')[0]!.t).toBeCloseTo(0.5);
    expect(of('pop')).toEqual([{ kind: 'pop', t: 0.4 }]);
  });

  test('key taps vary in pitch within a small range, the same way every time', async () => {
    const { scene } = await make();
    const pitches = scene.cues().filter((c) => c.kind === 'key').map((c) => c.pitch!);
    for (const pitch of pitches) { expect(pitch).toBeGreaterThanOrEqual(0.92); expect(pitch).toBeLessThanOrEqual(1.08); }
    expect(pitches[0]).not.toBe(pitches[1]);
    expect(scene.cues().filter((c) => c.kind === 'key').map((c) => c.pitch)).toEqual(pitches);
  });

  test('a camera move adds a whoosh; a still camera adds none', async () => {
    const { scene } = await make();
    expect(scene.cues().some((c) => c.kind.startsWith('whoosh'))).toBe(false);
    const { scene: moving } = await make((s) => { s.extraCamera = [[0, { fx: 960, fy: 540, zoom: 1 }], [1, { fx: 960, fy: 540, zoom: 2 }]]; });
    expect(moving.cues().filter((c) => c.kind.startsWith('whoosh')).map((c) => c.kind)).toEqual(['whoosh-in']);
  });

  test('element boxes come from the clip\'s marks, and an unknown one says where', async () => {
    const { scene } = await make();
    expect(scene.box_('m', 'btn')).toEqual({ x: 100, y: 100, w: 200, h: 50 });
    expect(() => scene.box_('m', 'nope')).toThrow("clip 'demo' mark 'm' has no box 'nope'");
    expect(() => scene.screenBox_('m', 'nope')).toThrow("has no box 'nope'");
    const b = scene.screenBox_('m', 'btn');
    expect(b.w).toBe(200);
  });

  describe('render', () => {
    test('is the same call log for the same frame, and clean, from the first frame to past the end', async () => {
      const { scene, g } = await make();
      for (const lt of [...range(0, 2, 60), -1, 10]) {
        g.clear();
        scene.render(frame(lt));
        const first = snapshot(g);
        expectCleanLog(g);
        g.clear();
        scene.render(frame(lt));
        expect(snapshot(g)).toEqual(first);
      }
    });

    test('shows the recorded address, through the host override', async () => {
      const { scene } = await make();
      scene.render(frame(0.2));
      expect(scene.v.url).toBe('acme.com');
    });

    test('draws the decoded frame in the window once it is prepared, and none before', async () => {
      const { scene, g } = await make();
      scene.render(frame(0.5));
      expect(g.calls('drawImage')).toEqual([]);
      await scene.prepare(frame(0.5));
      g.clear();
      scene.render(frame(0.5));
      expect(g.calls('drawImage').length).toBe(1);
      expect(g.calls('drawImage')[0]!.args.slice(1)).toEqual([0, 0, 1440, 900]);
    });

    test('draws the callouts, the cursor and a ripple within 0.6 s of a click', async () => {
      const { scene, g } = await make();
      scene.render(frame(10 / 60 + 0.1));
      expect(g.calls('fillRect').some((c) => (c.args as number[]).join() === '1,2,3,4')).toBe(true);
      expect(g.calls('moveTo').length).toBeGreaterThan(0); // the cursor's outline
      const rippleArcs = (lt: number) => { g.clear(); scene.render(frame(lt)); return g.calls('arc').length; };
      expect(rippleArcs(10 / 60 + 0.1)).toBeGreaterThan(rippleArcs(10 / 60 + 0.9));
    });

    test('a pointer faded to nothing is not drawn at all', async () => {
      const { scene, g } = await make((s) => { s.alpha = 0; });
      scene.render(frame(0.2));
      expect(g.calls('moveTo').length).toBe(0);
    });

    test('the pointer is drawn where the recording had it', async () => {
      const { scene, g } = await make();
      scene.render(frame(5 / 60)); // frame 5: x = 50, y = 100
      const tip = g.calls('moveTo').at(-1)!.matrix; // the cursor's outline starts at its tip
      const [sx, sy] = scene.v.screenOfPage(50, 100);
      expect(tip[4]).toBeCloseTo(sx);
      expect(tip[5]).toBeCloseTo(sy);
    });
  });
});
