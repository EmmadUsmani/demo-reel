// Hoppscotch: one recorded session between a title card and an end card, in the default theme.
import { entries } from '@engine/edit';
import type { Edit } from '@engine/edit';

const E = entries(import.meta.glob('./scenes/*.ts'));

export default {
  timeline: () => [
    E('title', 'title-card', {
      params: {
        name: 'Hoppscotch',
        subtitle: 'an open-source API client',
        kicker: 'Open source · MIT licensed',
        line: 'Hoppscotch is an open-source client for trying out web APIs.',
        dur: 5.4,
        cards: [
          { footage: 'hoppscotch', clip: 'session', at: 'param2', key: 'key', pad: 150 },
          { footage: 'hoppscotch', clip: 'session', at: 'sent2', key: 'value', pad: 150 },
        ],
      },
    }),
    E('session', 'session', { overlap: 0.5 }),
    E('end', 'end-card', {
      overlap: 0.5,
      params: {
        name: 'Hoppscotch',
        subtitle: 'open source, at hoppscotch.io',
        chips: ['REST', 'Query parameters', 'Instant responses', 'No sign-in'],
        line: 'That’s Hoppscotch. Thanks for watching!',
        card: { footage: 'hoppscotch', clip: 'session', at: 'sent2', key: 'app', pad: 0 },
      },
    }),
  ],
} satisfies Edit;
