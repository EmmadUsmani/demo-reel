// The fetch shim of a single-file player. The file carries the player's data (footage, captions, sound)
// as embedded files; this answers the page's requests for them, so nothing needs a server or a network.
// `installShim` is written out into the page (Function.toString), so it must stay one self-contained
// function with no imports; the tests run this very source against a fake window.

export type EmbeddedFile = { type: string; data: string };
export type EmbeddedFiles = Record<string, EmbeddedFile>;

export function installShim(files: EmbeddedFiles, win: any) {
  const realFetch = win.fetch.bind(win);
  const absolute = /^([a-z][a-z0-9+.-]*:|\/)/i;

  /** The embedded path a URL names, or undefined for a URL that isn't the page's own (those go to the network). */
  function pathOf(url: string): string | undefined {
    let rest = url;
    if (absolute.test(url)) {
      try {
        const base = new URL('.', win.document.baseURI).href;
        const full = new URL(url, win.document.baseURI).href;
        if (!full.startsWith(base)) return undefined;
        rest = full.slice(base.length);
      } catch { return undefined; }
    }
    rest = rest.split(/[?#]/)[0]!.replace(/^(\.\/)+/, '');
    try { return decodeURIComponent(rest); } catch { return rest; }
  }

  const bytes = (file: EmbeddedFile) => Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
  const blobUrl = (file: EmbeddedFile) => win.URL.createObjectURL(new win.Blob([bytes(file)], { type: file.type }));

  win.fetch = (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input instanceof win.URL ? input.href : input.url;
    const path = pathOf(url);
    if (path === undefined) return realFetch(input, init);
    const file = files[path];
    if (!file) return Promise.resolve(new win.Response(`${path}: not in this file`, { status: 404 }));
    return Promise.resolve(new win.Response(bytes(file), { status: 200, headers: { 'content-type': file.type } }));
  };

  // an <audio> pointed at an embedded file plays it from memory (a page may allow media only from blob: URLs)
  const proto = win.HTMLMediaElement?.prototype;
  const src = proto && Object.getOwnPropertyDescriptor(proto, 'src');
  if (src?.set) {
    Object.defineProperty(proto, 'src', {
      ...src,
      set(this: any, value: string) {
        const path = pathOf(String(value));
        src.set!.call(this, path !== undefined && files[path] ? blobUrl(files[path]!) : value);
      },
    });
  }
}
