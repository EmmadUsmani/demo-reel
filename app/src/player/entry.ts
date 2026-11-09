// The HTML player's page (app/player.html): plays one edit in the browser, drawn live by the same
// engine that renders the MP4, with the soundtrack scripts/audio.ts mixed. A built player
// (scripts/build.ts) holds one edit; on the dev server, choose one with ?edit=<name>.
//   ?t=<s>          start (and show the poster) at this time
//   ?captions=1     captions on          ?narration=0   the soundtrack without the voice
import './player.css';
import { loadFonts } from '../engine/assets';
import { Engine } from '../engine/engine';
import { applyTheme } from '../engine/palette';
import { EDITS } from '../timeline';
import { Player } from './player';

const params = new URLSearchParams(location.search);
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
  await engine.init();
  if (engine.errors.length) console.error(engine.errors.join('\n\n'));
  // a handle for tests driving the page (e2e/)
  (window as any).__player = new Player(root, canvas, engine, {
    name,
    title: edit.title ?? name,
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
