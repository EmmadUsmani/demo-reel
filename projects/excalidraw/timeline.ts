// Excalidraw: one recorded session between a title card and an end card, in the default theme.
import { entries } from '@engine/edit';
import type { Edit } from '@engine/edit';

const E = entries(import.meta.glob('./scenes/*.ts'));

export default {
  timeline: () => [
    E('title', 'title-card', {
      params: {
        name: 'Excalidraw',
        subtitle: 'a whiteboard that looks hand-drawn',
        kicker: 'Open source · MIT licensed',
        line: 'Excalidraw is an open-source whiteboard for sketching diagrams.',
        dur: 5.4,
        cards: [
          { footage: 'excalidraw', clip: 'session', at: 'done', key: 'idea', pad: 60 },
          { footage: 'excalidraw', clip: 'session', at: 'done', key: 'share', pad: 60 },
        ],
      },
    }),
    E('session', 'session', { overlap: 0.5 }),
    E('end', 'end-card', {
      overlap: 0.5,
      params: {
        name: 'Excalidraw',
        subtitle: 'open source, at excalidraw.com',
        chips: ['Shapes', 'Labels', 'Arrows', 'Saved in the browser'],
        line: 'That’s Excalidraw. Thanks for watching!',
        card: { footage: 'excalidraw', clip: 'session', at: 'done', key: 'canvas', pad: 0 },
      },
    }),
  ],
} satisfies Edit;
