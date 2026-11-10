import { describe, expect, test } from 'bun:test';
import { embedFiles, jsonSafe, mimeType, scriptSafe, singlePage, sizeWarnings, ARTIFACT_LIMIT } from './single-lib';
import { installShim, type EmbeddedFiles } from './single-shim';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('mimeType', () => {
  test('knows the types the player fetches, whatever the case, and falls back to octet-stream', () => {
    expect(['a.png', 'a.jpg', 'a.JPEG', 'manifest.json', 'mix.mp3', 'a.woff2'].map(mimeType)).toEqual(['image/png', 'image/jpeg', 'image/jpeg', 'application/json', 'audio/mpeg', 'font/woff2']);
    expect(mimeType('a.xyz')).toBe('application/octet-stream');
    expect(mimeType('noextension')).toBe('application/octet-stream');
  });
});

describe('embedFiles', () => {
  test('keys each file by its URL, with its type and its bytes as base64', () => {
    const files = embedFiles([{ as: 'footage/x/a.png', bytes: new Uint8Array([0, 255, 10]) }, { as: 'audio/x/captions.json', bytes: bytes('[]') }]);
    expect(files).toEqual({
      'footage/x/a.png': { type: 'image/png', data: 'AP8K' },
      'audio/x/captions.json': { type: 'application/json', data: 'W10=' },
    });
  });
});

describe('script-safe text', () => {
  test('code and data can hold </script> without ending the page\'s script', () => {
    expect(scriptSafe('a = "</script><script>"; </SCRIPT >')).not.toMatch(/<\/script/i);
    expect(scriptSafe('x = "<!-- y"')).not.toContain('<!--');
    expect(eval(scriptSafe('"</script>"'))).toBe('</script>');
    const json = jsonSafe(JSON.stringify({ a: '</script><!-- x' }));
    expect(json).not.toContain('<');
    expect(JSON.parse(json)).toEqual({ a: '</script><!-- x' });
  });
});

describe('singlePage', () => {
  const built = `<!doctype html><html><head><meta charset="utf-8" />
<script type="module" crossorigin src="./assets/player-1.js"></script>
<link rel="modulepreload" crossorigin href="./assets/chunk.js">
<link rel="stylesheet" crossorigin href="./assets/player-1.css">
</head><body><div id="player"></div></body></html>`;
  const assets: Record<string, string> = { './assets/player-1.js': 'console.log("a $& </script> b");', './assets/player-1.css': 'body{margin:0}' };
  const page = singlePage(built, (url) => assets[url]!, { 'a.png': { type: 'image/png', data: 'AA==' }, 'x.json': { type: 'application/json', data: btoa('</script>') } });

  test('inlines the code and CSS, and leaves no reference to a file', () => {
    expect(page).not.toMatch(/\ssrc=|<link/);
    expect(page).toContain('<style>body{margin:0}</style>');
    expect(page).toContain('console.log("a $& <\\/script> b");');
  });

  test('is parsed as one script of each kind: the data, the shim, then the app\'s module, with none cut short', () => {
    const scripts = [...page.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts.map((m) => m[1])).toEqual([' type="application/json" id="embedded-files"', '', ' type="module"']);
    expect(JSON.parse(scripts[0]![2]!)['a.png'].data).toBe('AA==');
    expect(scripts[2]![2]).toContain('console.log');
    expect(page.indexOf('embedded-files')).toBeLessThan(page.indexOf('type="module"'));
    expect(page.indexOf('.fetch')).toBeLessThan(page.indexOf('type="module"'));
  });

  test('refuses a player.html with no module script', () => {
    expect(() => singlePage('<html><head></head><body></body></html>', () => '', {})).toThrow('no module script');
  });
});

describe('sizeWarnings', () => {
  test('warns past the artifact limit and for clips, and otherwise says nothing', () => {
    expect(sizeWarnings(ARTIFACT_LIMIT, 0)).toEqual([]);
    expect(sizeWarnings(ARTIFACT_LIMIT + 1, 0)[0]).toContain('over the 20 MiB');
    expect(sizeWarnings(100, 2)[0]).toContain('2 clips');
    expect(sizeWarnings(100, 1)[0]).toContain('1 clip:');
  });
});

/** A fake window: a recording real fetch, a media element, and the classes the shim uses. */
function fakeWindow(baseURI = 'file:///deck/index.html') {
  const real: string[] = [];
  let srcValue = '';
  class Media { get src() { return srcValue; } set src(v: string) { srcValue = v; } }
  const win: any = {
    document: { baseURI },
    fetch: async (input: any) => { real.push(typeof input === 'string' ? input : input.href ?? input.url); return new Response('network'); },
    Response, Blob, URL: Object.assign(URL, { createObjectURL: () => 'blob:fake' }),
    HTMLMediaElement: Media,
  };
  return { win, real, Media };
}
const files: EmbeddedFiles = embedFiles([
  { as: 'footage/x/a b.png', bytes: bytes('PNG') },
  { as: 'audio/x/mix.mp3', bytes: bytes('MP3') },
  { as: 'footage/x/manifest.json', bytes: bytes('{"shots":{}}') },
]);

describe('the fetch shim', () => {
  test('answers relative URLs from the embedded files, in every form the player writes them', async () => {
    const { win, real } = fakeWindow();
    installShim(files, win);
    for (const url of ['footage/x/manifest.json', './footage/x/manifest.json', 'footage/x/manifest.json?v=1', 'footage/x/manifest.json#h', 'file:///deck/footage/x/manifest.json', '/deck/footage/x/manifest.json']) {
      const response = await win.fetch(url);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/json');
      expect(await response.json()).toEqual({ shots: {} });
    }
    expect(await (await win.fetch('footage/x/a%20b.png')).text()).toBe('PNG');
    expect(await (await win.fetch(new URL('audio/x/mix.mp3', 'file:///deck/index.html'))).text()).toBe('MP3');
    expect(await (await win.fetch({ url: './audio/x/mix.mp3' })).text()).toBe('MP3');
    expect(real).toEqual([]);
  });

  test('answers a relative URL it does not hold with 404, never from the network', async () => {
    const { win, real } = fakeWindow();
    installShim(files, win);
    expect((await win.fetch('footage/x/missing.png')).status).toBe(404);
    expect(real).toEqual([]);
  });

  test('passes absolute URLs of other places on to the real fetch', async () => {
    const { win, real } = fakeWindow();
    installShim(files, win);
    for (const url of ['https://example.com/footage/x/a.png', 'data:text/plain,hi', 'blob:null/123', 'file:///elsewhere/a.png']) expect(await (await win.fetch(url)).text()).toBe('network');
    expect(real).toHaveLength(4);
  });

  test('works on a page whose base is not a hierarchical URL (an artifact frame)', async () => {
    const { win, real } = fakeWindow('about:srcdoc');
    installShim(files, win);
    expect((await win.fetch('audio/x/mix.mp3')).status).toBe(200);
    expect(await (await win.fetch('https://example.com/a')).text()).toBe('network');
    expect(real).toEqual(['https://example.com/a']);
  });

  test('plays an embedded file set as a media src from a blob, and leaves other srcs alone', () => {
    const { win, Media } = fakeWindow();
    installShim(files, win);
    const media = new Media();
    media.src = 'audio/x/mix.mp3';
    expect(media.src).toBe('blob:fake');
    media.src = 'https://example.com/x.mp3';
    expect(media.src).toBe('https://example.com/x.mp3');
    media.src = 'audio/x/nope.mp3';
    expect(media.src).toBe('audio/x/nope.mp3');
  });

  test('is a self-contained function: the page runs its source, not this module', async () => {
    const { win } = fakeWindow();
    new Function(`return (${installShim.toString()})`)()(files, win);
    expect((await win.fetch('audio/x/mix.mp3')).status).toBe(200);
  });
});
