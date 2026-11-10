// The parts of a single-file build that decide things: which files are embedded and as what, how the
// page is put together, and when to warn about its size. scripts/build.ts --single does the file work.
import { installShim, type EmbeddedFiles } from './single-shim';

/** The most a Claude artifact's page can be: a bigger one won't publish. */
export const ARTIFACT_LIMIT = 16 * 1024 * 1024;

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp',
  json: 'application/json', mp3: 'audio/mpeg', wav: 'audio/wav', woff2: 'font/woff2',
};
export const mimeType = (file: string) => MIME[file.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream';

/** The files the page fetches by relative URL, keyed by that URL, as base64 with their type. */
export function embedFiles(files: { as: string; bytes: Uint8Array }[]): EmbeddedFiles {
  return Object.fromEntries(files.map(({ as, bytes }) => [as, { type: mimeType(as), data: Buffer.from(bytes).toString('base64') }]));
}

/** Text safe inside a <script>: no `</script`, and no `<!--` that opens a comment, whatever it contains. */
export const scriptSafe = (text: string) => text.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
/** The same for JSON data, where the escape must be a valid JSON one (`<`) wherever the `<` sits. */
export const jsonSafe = (json: string) => json.replaceAll('<', '\\u003c');

/** What the built player.html loads: its module script, its stylesheets, and anything it preloads. */
const MODULE = /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>\s*/g;
const SHEET = /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>\s*/g;
const PRELOAD = /<link rel="modulepreload"[^>]*>\s*/g;

/**
 * One HTML file from a built player.html: its code and CSS inlined (`read` gives a built asset's text by the URL
 * the page names), the embedded files as JSON, and the fetch shim ahead of the code, which is a module and so
 * runs after the page is parsed, the shim and the data before it.
 */
export function singlePage(html: string, read: (url: string) => string, files: EmbeddedFiles): string {
  const shim = `<script>(${installShim.toString()})(JSON.parse(document.getElementById('embedded-files').textContent), window);</script>`;
  const data = `<script type="application/json" id="embedded-files">${jsonSafe(JSON.stringify(files))}</script>`;
  const sheets: string[] = [];
  let code = '';
  const body = html
    .replace(PRELOAD, '')
    .replace(SHEET, (_, url: string) => { sheets.push(`<style>${read(url).replace(/<\/(style)/gi, '<\\/$1')}</style>\n`); return ''; })
    .replace(MODULE, (_, url: string) => { code += `<script type="module">${scriptSafe(read(url))}</script>\n`; return ''; });
  if (!code) throw new Error('no module script in the built player.html');
  return body.replace('</head>', () => `${sheets.join('')}${data}\n${shim}\n</head>`).replace('</body>', () => `${code}</body>`);
}

/** Warnings about a single file's size, and about clips (every frame of them would be in the file). */
export function sizeWarnings(bytes: number, clips: number): string[] {
  const warnings: string[] = [];
  if (bytes > ARTIFACT_LIMIT) warnings.push(`${(bytes / 1048576).toFixed(1)} MiB is over the 16 MiB a Claude artifact's page can be`);
  if (clips) warnings.push(`the edit records ${clips} clip${clips === 1 ? '' : 's'}: every frame is embedded, and a file that size is not suited to be one page`);
  return warnings;
}
