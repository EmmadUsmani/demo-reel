// News Digest as a slide deck: a short pilot of the deck mode, made from news-digest's own scenes.
// Speaker notes are authored per slide (scenes/, and the cards' `notes` param). See treatment.md.
import monoRegular from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';
import monoMedium from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2?url';
import monoBold from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2?url';
import { entries } from '@engine/edit';
import type { Edit } from '@engine/edit';

const E = entries(import.meta.glob('./scenes/*.ts'));
const X = 0.5; // crossfade between slides

const SCENES = () => [
  E('title', 'title-card', {
    params: {
      name: 'News Digest',
      subtitle: 'a daily news briefing',
      kicker: 'Built and run by an agent',
      notes: 'This is News Digest, a daily news briefing. Every line of its code was written by an AI agent.',
      dur: 4.6,
      cards: [
        { footage: 'news-digest', shot: 'admin-overview', key: 'screen', pad: 0 },
        { footage: 'news-digest', shot: 'reader', key: 'screen', pad: 0 },
        { footage: 'news-digest', shot: 'grafana-agent', key: 'screen', pad: 0 },
      ],
    },
  }),
  E('product', 'product', { overlap: X }),
  E('factory', 'chapter', {
    overlap: X,
    params: {
      title: 'The agent factory',
      subtitle: 'How one agent builds and runs the app, around the clock',
      notes: 'Now the factory: one Codex agent, in a loop, on one VM, paid for by a $100-a-month ChatGPT plan.',
    },
  }),
  E('guardrails', 'guardrails', { overlap: X }),
  E('observe', 'observe', { overlap: X }),
  E('end', 'end-card', {
    overlap: X,
    params: {
      name: 'News Digest',
      subtitle: 'built by an agent factory',
      chips: ['Codex, around the clock', '$100 a month', '~200 commits a day', 'Steered, not hand-written'],
      notes: 'One VM, one agent, one subscription, and a steering file. That is the factory behind News Digest.',
      card: { footage: 'news-digest', shot: 'reader', key: 'screen', pad: 0 },
    },
  }),
];

export default {
  timeline: SCENES,
  title: 'News Digest: the agent factory (deck pilot)',
  deck: true,
  theme: {
    fontFiles: [
      ['JetBrains Mono', monoRegular, 400],
      ['JetBrains Mono', monoMedium, 500],
      ['JetBrains Mono', monoBold, 700],
    ],
  },
} satisfies Edit;
