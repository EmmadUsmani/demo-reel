// Qiyami (qiyami.com): a title card, one recorded session, an end card.
import { entries } from '@engine/edit';
import type { Edit } from '@engine/edit';

const E = entries(import.meta.glob('./scenes/*.ts'));

export default {
  timeline: () => [
    E('title', 'title-card', {
      params: {
        name: 'Qiyami',
        subtitle: 'prayer times and the last third of the night',
        kicker: 'Free · in your browser',
        line: 'Qiyami shows today’s prayer times, and when the last third of the night begins.',
        dur: 6,
        cards: [
          { footage: 'qiyami', clip: 'session', at: 'start', key: 'region', pad: 2 },
          { footage: 'qiyami', clip: 'session', at: 'start', key: 'night', pad: 2 },
        ],
      },
    }),
    E('session', 'session', { overlap: 0.5 }),
    E('end', 'end-card', {
      overlap: 0.5,
      params: {
        name: 'Qiyami',
        subtitle: 'at qiyami.com',
        chips: ['Prayer times', 'Last third of the night', 'Any city', 'Calculation methods'],
        line: 'That’s Qiyami, at qiyami dot com.',
        card: { footage: 'qiyami', clip: 'session', at: 'saved', key: 'app', pad: 20 },
      },
    }),
  ],
} satisfies Edit;
