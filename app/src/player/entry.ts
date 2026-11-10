// The HTML player's page (app/player.html): plays one edit in the browser, drawn live by the same
// engine that renders the MP4, with the soundtrack scripts/audio.ts mixed. A built player
// (scripts/build.ts) holds one edit; on the dev server, choose one with ?edit=<name>.
//   ?mode=slides    the video as a deck: each step plays to the next stop and holds
//   ?slide=<n>      slides mode: open on slide n (1-based)
//   ?scene=<id>     only this scene (an embed): its own range, stops and sound
//   ?t=<s>          start (and show the poster) at this time
//   ?captions=1     captions on          ?narration=0|1 the soundtrack without the voice (or with it)
//   ?view=presenter the presenter's view of the deck: this slide, the next, notes, timer (presenter.ts)
// An edit that is a deck (Edit.deck) opens in slides mode with the narration off and asks for no
// soundtrack; ?mode=video or ?narration=1 chooses otherwise. A host that passes only a #name to the
// page (a Claude artifact) can use #slides, #slide-<n>, #scene-<id>, #presenter and #presenter-<n> instead.
import './player.css';
import { loadFonts } from '../engine/assets';
import { Engine } from '../engine/engine';
import { applyTheme } from '../engine/palette';
import { EDITS } from '../timeline';
import { parseParams, startOf } from './params';
import { Player } from './player';
import { Presenter } from './presenter';

const params = parseParams(location.search, location.hash);
const root = document.getElementById('player')!;
// A host that passes only a #name (a Claude artifact) changes it on the open page, as an address bar does:
// start again on the view it names. The page never writes the hash itself, so this can't loop.
window.addEventListener('hashchange', () => location.reload());

async function boot() {
  const name = params.edit ?? Object.keys(EDITS)[0]!;
  const edit = EDITS[name];
  if (!edit) throw new Error(`no edit '${name}' (edits: ${Object.keys(EDITS).join(', ')})`);
  applyTheme(edit.theme);
  document.title = edit.title ?? name;
  const canvas = document.createElement('canvas');
  const engine = new Engine(canvas, edit.timeline);
  await loadFonts();
  const { scene } = params;
  await engine.init(scene ? (e) => e.id === scene : undefined);
  if (engine.errors.length) console.error(engine.errors.join('\n\n'));
  const poster = edit.poster ? (engine.timeline.find((e) => e.id === edit.poster!.scene)?.start ?? 0) + edit.poster.at : undefined;
  const sound = !edit.deck;
  // a handle for tests driving the page (e2e/)
  (window as any).__player = params.view === 'presenter'
    ? new Presenter(root, canvas, engine, { name, title: edit.title ?? name, scene, slide: params.slide, poster, sound })
    : new Player(root, canvas, engine, {
      name,
      title: edit.title ?? name,
      ...startOf(params, edit),
      scene,
      slide: params.slide,
      t: params.t,
      poster,
      captions: params.captions,
      sound,
    });
}

boot().catch((error) => {
  console.error(error);
  root.classList.add('failed');
  root.querySelector('.status')!.textContent = `This video failed to load: ${error?.message ?? error}`;
});
