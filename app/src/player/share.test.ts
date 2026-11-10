import { describe, expect, test } from 'bun:test';
import { shareLinks } from './share';

const at = { origin: 'https://example.com', pathname: '/demo/', search: '' };
const input = { title: 'News Digest', sceneOnScreen: 'pacing', t: 123.456, slide: 4 };

describe('shareLinks', () => {
  test('the moment link carries the time to two decimals', () => {
    expect(shareLinks(at, input).moment).toBe('https://example.com/demo/?t=123.46');
    expect(shareLinks(at, { ...input, t: 0 }).moment).toBe('https://example.com/demo/?t=0.00');
  });

  test('the slide link is 1-based, in slides mode', () => {
    expect(shareLinks(at, input).slide).toBe('https://example.com/demo/?mode=slides&slide=5');
  });

  test('the presenter link opens the presenter view on the slide, 1-based', () => {
    expect(shareLinks(at, input).presenter).toBe('https://example.com/demo/?view=presenter&slide=5');
    expect(shareLinks(at, { ...input, slide: -1 }).presenter).toContain('slide=1');
  });

  test('links made from a presenter URL drop its view; the presenter link replaces it', () => {
    const from = { ...at, search: '?edit=news&view=presenter&slide=2' };
    const links = shareLinks(from, input);
    expect(links.moment).toBe('https://example.com/demo/?edit=news&t=123.46');
    expect(links.slide).toBe('https://example.com/demo/?edit=news&mode=slides&slide=5');
    expect(links.presenter).toBe('https://example.com/demo/?edit=news&view=presenter&slide=5');
  });

  test('before the first slide, the slide link names slide 1', () => {
    expect(shareLinks(at, { ...input, slide: -1 }).slide).toContain('slide=1');
  });

  test('the embed is an iframe of the scene on screen', () => {
    const { embed } = shareLinks(at, input);
    expect(embed).toBe('<iframe src="https://example.com/demo/?scene=pacing" width="960" height="540" style="border:0" allow="autoplay; fullscreen" allowfullscreen title="News Digest: pacing"></iframe>');
  });

  test('on an embed, the links stay on its scene, and the embed is that scene', () => {
    const links = shareLinks({ ...at, search: '?scene=pacing&t=9' }, { ...input, scene: 'pacing', sceneOnScreen: 'pacing' });
    expect(links.moment).toBe('https://example.com/demo/?scene=pacing&t=123.46');
    expect(links.slide).toBe('https://example.com/demo/?scene=pacing&mode=slides&slide=5');
    expect(links.presenter).toBe('https://example.com/demo/?scene=pacing&view=presenter&slide=5');
    expect(links.embed).toContain('src="https://example.com/demo/?scene=pacing"');
  });

  test('it keeps parameters that are not about the moment (edit, captions, narration), and drops t, slide, mode and scene', () => {
    const links = shareLinks({ ...at, search: '?edit=news-digest&captions=1&narration=0&t=9&slide=3&mode=slides&scene=x' }, input);
    expect(links.moment).toBe('https://example.com/demo/?edit=news-digest&captions=1&narration=0&t=123.46');
    expect(links.slide).toBe('https://example.com/demo/?edit=news-digest&captions=1&narration=0&mode=slides&slide=5');
    expect(links.embed).toContain('?edit=news-digest&#38;captions=1');
  });

  test('inside a frame without an origin (an artifact), the links are relative to the page', () => {
    const links = shareLinks({ origin: 'null', pathname: '/frame.html', search: '' }, input);
    expect(links.moment).toBe('/frame.html?t=123.46');
    expect(links.embed).toContain('src="/frame.html?scene=pacing"');
  });

  test('the embed escapes the URL and title it puts in attributes', () => {
    const { embed } = shareLinks({ ...at, search: '?edit=a%22b' }, { ...input, title: 'A "quoted" <title>' });
    expect(embed).not.toContain('"quoted"');
    expect(embed).toContain('title="A &#34;quoted&#34; &#60;title&#62;: pacing"');
    expect(embed).toMatch(/src="[^"]*"/);
  });

  test('a link made for a moment round-trips through the URL parser', async () => {
    const { parseParams } = await import('./params');
    const links = shareLinks({ ...at, search: '?edit=news-digest&captions=1' }, input);
    const parse = (url: string) => { const u = new URL(url); return parseParams(u.search, u.hash); };
    expect(parse(links.moment)).toMatchObject({ edit: 'news-digest', captions: true, t: 123.46, view: 'player' });
    expect(parse(links.slide)).toMatchObject({ edit: 'news-digest', mode: 'slides', slide: 5 });
    expect(parse(links.presenter)).toMatchObject({ edit: 'news-digest', view: 'presenter', slide: 5 });
    expect(parse(links.embed.match(/src="([^"]+)"/)![1]!.replaceAll('&#38;', '&'))).toMatchObject({ scene: 'pacing', edit: 'news-digest' });
  });
});
