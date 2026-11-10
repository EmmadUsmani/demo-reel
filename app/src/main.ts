// Entry: preview player (default) or export mode (?export=1, driven by scripts/render.ts).
import { loadFonts } from './engine/assets';
import { Engine } from './engine/engine';
import { applyTheme } from './engine/palette';
import { PH, PW, SCALE } from './engine/scene';
import { EDITS } from './timeline';

const params = new URLSearchParams(location.search);
const EXPORT = params.has('export');
const ONLY = params.get('only');
const EDIT = params.get('edit') ?? Object.keys(EDITS)[0]!;
const edit = EDITS[EDIT];
if (!edit) throw new Error(`no edit '${EDIT}' (edits: ${Object.keys(EDITS).join(', ')})`);
applyTheme(edit.theme);
document.title = `${EDIT} — demo-reel`;
const FROM = params.get('t') ? parseFloat(params.get('t')!) : null;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const engine = new Engine(canvas, edit.timeline);

declare global {
  interface Window { __video: any }
}

async function boot() {
  await loadFonts();
  const only = ONLY ? new Set(ONLY.split(',')) : null;
  await engine.init(only ? (e) => only.has(e.id) : undefined);
  if (EXPORT) setupExport();
  else setupPlayer();
}

// ------------------------------------------------------------------ export API
function setupExport() {
  document.body.classList.add('export');
  window.__video = {
    engine,
    duration: engine.duration,
    errors: engine.errors,
    scale: SCALE,
    width: PW,
    height: PH,
    timeline: engine.timeline.map(({ id, start, end }) => ({ id, start, end })),
    cues: engine.cues(),
    narration: engine.narration(),
    stops: engine.stops(),
    async still(t: number, samples = 1, shutter = 0.5) { await engine.prepare(t, samples, shutter); engine.render(t, samples, shutter); },
    async png() {
      const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), 'image/png'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    /**
     * Render [from, to) at fps and stream raw RGBA frames (top row first) over a WebSocket. The
     * receiver acks each frame it hands to the encoder; at most `inflight` go unacknowledged.
     */
    async stream(opts: { from: number; to: number; fps: number; ws: string; samples?: number; shutter?: number; inflight?: number }) {
      const ws = new WebSocket(opts.ws);
      ws.binaryType = 'arraybuffer';
      let acked = 0;
      ws.onmessage = (e) => { if (typeof e.data === 'string') acked = Math.max(acked, +e.data || 0); };
      await new Promise<void>((resolve, reject) => { ws.onopen = () => resolve(); ws.onerror = (e) => reject(e); });
      const n0 = Math.round(opts.from * opts.fps), n1 = Math.round(opts.to * opts.fps);
      for (let n = n0; n < n1; n++) {
        await engine.prepare(n / opts.fps, opts.samples ?? 1, opts.shutter ?? 0.5, opts.fps);
        engine.render(n / opts.fps, opts.samples ?? 1, opts.shutter ?? 0.5, opts.fps);
        const pixels = engine.pixels();
        while (n - n0 - acked >= (opts.inflight ?? 4)) await new Promise((r) => setTimeout(r, 2));
        ws.send(pixels.buffer as ArrayBuffer);
      }
      while (ws.bufferedAmount > 0) await new Promise((r) => setTimeout(r, 5));
      ws.close();
    },
  };
  window.__video.ready = true;
}

// ------------------------------------------------------------------ preview player
function setupPlayer() {
  const ui = document.getElementById('ui')!;
  const scrub = document.getElementById('scrub') as HTMLInputElement;
  const info = document.getElementById('info')!;
  const marks = document.getElementById('marks')!;
  const errs = document.getElementById('errs')!;
  scrub.max = String(engine.duration);
  scrub.step = '0.001';

  for (const entry of engine.timeline) {
    const mark = document.createElement('div');
    mark.className = 'mark';
    mark.style.left = `${(entry.start / engine.duration) * 100}%`;
    mark.style.width = `${((entry.end - entry.start) / engine.duration) * 100}%`;
    mark.textContent = entry.id;
    mark.onclick = () => seek(entry.start);
    marks.appendChild(mark);
  }

  let t = FROM ?? 0;
  let playing = false;
  let loop: [number, number] | null = null;
  let playedFrom = 0, playedAt = 0;
  const seek = (x: number) => { t = Math.max(0, Math.min(engine.duration - 0.001, x)); playedFrom = t; playedAt = performance.now(); };
  const toggle = () => { playing = !playing; seek(t); };
  canvas.onclick = toggle;
  scrub.oninput = () => seek(parseFloat(scrub.value));
  window.addEventListener('keydown', (ev) => {
    if (ev.key === ' ') { ev.preventDefault(); toggle(); }
    if (ev.key === 'ArrowRight') seek(t + (ev.shiftKey ? 5 : 1));
    if (ev.key === 'ArrowLeft') seek(t - (ev.shiftKey ? 5 : 1));
    if (ev.key === '.') seek(t + 1 / 60);
    if (ev.key === ',') seek(t - 1 / 60);
    if (ev.key === 'l') { const e = engine.timeline.find((x) => t >= x.start && t < x.end); loop = loop ? null : e ? [e.start, e.end] : null; }
    if (ev.key === 'h') ui.classList.toggle('hidden');
    if (ev.key === ']') { const e = engine.timeline.find((x) => x.start > t + 0.01); if (e) seek(e.start); }
    if (ev.key === '[') { const es = engine.timeline.filter((x) => x.start < t - 0.3); const e = es[es.length - 1]; if (e) seek(e.start); }
  });

  let frames = 0, fpsAt = performance.now(), fps = 0;
  const tick = async () => {
    if (playing) {
      t = playedFrom + (performance.now() - playedAt) / 1000;
      if (loop && t >= loop[1]) seek(loop[0]);
      if (t >= engine.duration) { t = engine.duration - 0.001; playing = false; }
    }
    await engine.prepare(t);
    engine.render(t);
    scrub.value = String(t);
    if (engine.errors.length) { errs.textContent = engine.errors.join('\n\n'); errs.style.display = 'block'; }
    frames++;
    const now = performance.now();
    if (now - fpsAt > 500) { fps = (frames * 1000) / (now - fpsAt); frames = 0; fpsAt = now; }
    const e = engine.timeline.filter((x) => t >= x.start && t < x.end).map((x) => x.id).join(' + ');
    info.textContent = `${t.toFixed(2)}s  [${e || '—'}]  ${fps.toFixed(0)}fps${loop ? '  LOOP' : ''}   space play · ←/→ seek · ,/. frame · [/] scene · l loop · h hide`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

boot().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f55;position:fixed;top:0;left:0">${String(error?.stack ?? error)}</pre>`);
  window.__video = { error: String(error?.stack ?? error) };
});
