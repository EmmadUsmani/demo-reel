// Vite's homepage: a shots-only reel from one full-page plate, in the default theme.
import { entries } from '@engine/edit';
import type { Edit } from '@engine/edit';

const E = entries(import.meta.glob('./scenes/*.ts'));

export default {
  timeline: () => [
    E('title', 'title-card', {
      params: {
        name: 'Vite',
        subtitle: 'the build tool for the web',
        kicker: 'Open source · MIT licensed',
        line: 'Vite is an open-source build tool for the web.',
        dur: 4.6,
        cards: [
          { footage: 'vite', shot: 'page', key: 'headline', pad: 14 },
          { footage: 'vite', shot: 'page', key: 'install', pad: 40 },
        ],
      },
    }),
    E('page', 'page', { overlap: 0.5 }),
    E('end', 'end-card', {
      overlap: 0.5,
      params: {
        name: 'Vite',
        subtitle: 'open source, at vite.dev',
        chips: ['Instant server start', 'Fast HMR', 'Optimized builds'],
        line: 'That’s Vite. Thanks for watching!',
        card: { footage: 'vite', shot: 'page', key: 'headline', pad: 14 },
      },
    }),
  ],
} satisfies Edit;
