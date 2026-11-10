// The HTML player's page (app/player.html): plays one edit in the browser, drawn live by the same
// engine that renders the MP4, with the soundtrack scripts/audio.ts mixed. A built player
// (scripts/build.ts) holds one edit; on the dev server, choose one with ?edit=<name>.
//   ?mode=slides    the video as a deck: each step plays to the next stop and holds
//   ?slide=<n>      slides mode: open on slide n (1-based)
//   ?scene=<id>     only this scene (an embed): its own range, stops and sound
//   ?t=<s>          start (and show the poster) at this time
//   ?captions=1     captions on          ?narration=0   the soundtrack without the voice
// A host that passes only a #name to the page (a Claude artifact) can use #slides, #slide-<n> and
// #scene-<id> instead.
import './player.css';
import { loadFonts } from '../engine/assets';
import { Engine } from '../engine/engine';
import { applyTheme } from '../engine/palette';
import { EDITS } from '../timeline';
import { Player } from './player';

const params = new URLSearchParams(location.search);
const hash = location.hash.slice(1);
if (hash === 'slides') params.set('mode', 'slides');
else if (/^slide-\d+$/.test(hash)) { params.set('mode', 'slides'); params.set('slide', hash.slice(6)); }
else if (hash.startsWith('scene-')) params.set('scene', hash.slice(6));
const root = document.getElementById('player')!;

async function boot() {
  const name = params.get('edit') ?? Object.keys(EDITS)[0]!;
  const edit = EDITS[name];
  if (!edit) throw new Error(`no edit '${name}' (edits: ${Object.keys(EDITS).join(', ')})`);
  applyTheme(edit.theme);
  document.title = edit.title ?? name;
  const canvas = document.createElement('canvas');
  const engine = new Engine(canvas, edit.timeline);
  await loadFonts();
  const scene = params.get('scene') ?? undefined;
  await engine.init(scene ? (e) => e.id === scene : undefined);
  if (engine.errors.length) console.error(engine.errors.join('\n\n'));
  // a handle for tests driving the page (e2e/)
  (window as any).__player = new Player(root, canvas, engine, {
    name,
    title: edit.title ?? name,
    mode: params.get('mode') === 'slides' ? 'slides' : 'video',
    scene,
    slide: params.has('slide') ? +params.get('slide')! : undefined,
    t: params.has('t') ? +params.get('t')! : undefined,
    poster: edit.poster ? (engine.timeline.find((e) => e.id === edit.poster!.scene)?.start ?? 0) + edit.poster.at : undefined,
    captions: params.get('captions') === '1',
    narration: params.get('narration') !== '0',
  });
}

boot().catch((error) => {
  console.error(error);
  root.classList.add('failed');
  root.querySelector('.status')!.textContent = `This video failed to load: ${error?.message ?? error}`;
});
