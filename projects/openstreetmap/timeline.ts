// OpenStreetMap: one recorded session between a title card and an end card, in the default theme.
import { entries } from '@engine/edit';
import type { Edit } from '@engine/edit';

const E = entries(import.meta.glob('./scenes/*.ts'));

export default {
  timeline: () => [
    E('title', 'title-card', {
      params: {
        name: 'OpenStreetMap',
        subtitle: 'the free map of the world',
        kicker: 'Open data · made by its community',
        line: 'OpenStreetMap is a free map of the world, made by its community.',
        dur: 5.4,
        cards: [
          { footage: 'openstreetmap', clip: 'session', at: 'found' },
          { footage: 'openstreetmap', clip: 'session', at: 'done' },
        ],
      },
    }),
    E('session', 'session', { overlap: 0.5 }),
    E('end', 'end-card', {
      overlap: 0.5,
      params: {
        name: 'OpenStreetMap',
        subtitle: 'open data, at openstreetmap.org',
        chips: ['Search', 'Pan and zoom', 'Open data', 'Free to use'],
        line: 'That’s OpenStreetMap. Thanks for watching!',
        card: { footage: 'openstreetmap', clip: 'session', at: 'done' },
      },
    }),
  ],
} satisfies Edit;
