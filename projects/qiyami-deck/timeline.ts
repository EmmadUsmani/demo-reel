// Qiyami as narrated slides: a condensed version of the qiyami reel that opens in slides mode with its
// soundtrack (Edit.mode), each step playing the real recording, narration included, to the next slide.
// Made from qiyami's own scenes and footage; speaker notes are authored per slide. See treatment.md.
// The narration lines respell Arabic words for the voice; the screen keeps the real spelling (qiyami/treatment.md).
import { entries } from '@engine/edit';
import type { Edit } from '@engine/edit';

const E = entries(import.meta.glob('./scenes/*.ts'));
const X = 0.5; // crossfade between slides

export default {
  timeline: () => [
    E('title', 'title-card', {
      params: {
        name: 'Qiyami',
        subtitle: 'prayer times and the last third of the night',
        kicker: 'Free · in your browser',
        line: 'Keeyaami shows today’s prayer times, and when the last third of the night begins.',
        caption: 'Qiyami shows today’s prayer times, and when the last third of the night begins.',
        notes: 'Qiyami is a free prayer-time calculator that runs in the browser. Besides the five daily prayers, it shows Islamic midnight and the last third of the night.',
        dur: 6.4,
        cards: [
          { footage: 'qiyami', clip: 'session', at: 'start', key: 'region', pad: 2 },
          { footage: 'qiyami', clip: 'session', at: 'start', key: 'night', pad: 2 },
        ],
      },
    }),
    E('session', 'session', { overlap: X }),
    E('end', 'end-card', {
      overlap: X,
      params: {
        name: 'Qiyami',
        subtitle: 'at qiyami.com',
        chips: ['Prayer times', 'Last third of the night', 'Any city', 'Calculation methods'],
        line: 'That’s Keeyaami, at keeyaami dot com.',
        caption: 'That’s Qiyami, at qiyami.com.',
        notes: 'That is Qiyami: today’s prayer times, the last third of the night, any city and your own calculation method. It is free at qiyami.com.',
        card: { footage: 'qiyami', clip: 'session', at: 'saved', key: 'app', pad: 20 },
      },
    }),
  ],
  title: 'Qiyami (slides)',
  mode: 'slides',
} satisfies Edit;
