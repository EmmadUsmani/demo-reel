// News Digest: a slide-led reel for engineers. The hook, the product in thirty seconds, the agent
// factory that builds it (the long middle), then how the product works. See treatment.md.
import monoRegular from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';
import monoMedium from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2?url';
import monoBold from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2?url';
import { entries } from '@engine/edit';
import type { Edit } from '@engine/edit';
import { SCRIPT } from './script';
import VO from './vo-lengths.json';

const E = entries(import.meta.glob('./scenes/*.ts'));
const X = 0.5; // crossfade between slides
/** A shared card's length: its line, plus room for the card to arrive and leave. */
const cardDur = (id: string, extra: number) => ((VO as Record<string, number>)[id] ?? 3) + extra;

const SCENES = () => [
  E('hook', 'hook'),
  E('title', 'title-card', {
    overlap: X,
    params: {
      name: 'News Digest',
      subtitle: 'a daily news briefing',
      kicker: 'Built and run by an agent',
      line: SCRIPT.title,
      dur: cardDur('title', 2.6),
      cards: [
        { footage: 'news-digest', shot: 'admin-overview', key: 'screen', pad: 0 },
        { footage: 'news-digest', shot: 'reader', key: 'screen', pad: 0 },
        { footage: 'news-digest', shot: 'grafana-agent', key: 'screen', pad: 0 },
      ],
    },
  }),
  E('product', 'product', { overlap: X }),
  E('factory', 'chapter', { overlap: X, params: { title: 'The agent factory', subtitle: 'How one agent builds and runs the app, around the clock' } }),
  E('overview', 'overview', { overlap: X }),
  E('fresh', 'fresh', { overlap: X }),
  E('loop', 'loop', { overlap: X }),
  E('prompt', 'prompt', { overlap: X }),
  E('velocity', 'velocity', { overlap: X }),
  E('memory', 'memory', { overlap: X }),
  E('steering', 'steering', { overlap: X }),
  E('github', 'github', { overlap: X }),
  E('pacing', 'pacing', { overlap: X }),
  E('guardrails', 'guardrails', { overlap: X }),
  E('evidence', 'evidence', { overlap: X }),
  E('hood', 'chapter', { overlap: X, params: { title: 'Under the hood', subtitle: 'How News Digest collects, ranks and writes an edition' } }),
  E('runtime', 'runtime', { overlap: X }),
  E('collect', 'collect', { overlap: X }),
  E('pipeline', 'pipeline', { overlap: X }),
  E('budgets', 'budgets', { overlap: X }),
  E('observe', 'observe', { overlap: X }),
  E('end', 'end-card', {
    overlap: X,
    params: {
      name: 'News Digest',
      subtitle: 'built by an agent factory',
      chips: ['Codex, around the clock', '$100 a month', '~200 commits a day', 'Steered, not hand-written'],
      line: SCRIPT.end,
      dur: cardDur('end', 2.0),
      card: { footage: 'news-digest', shot: 'reader', key: 'screen', pad: 0 },
    },
  }),
];

export default {
  timeline: SCENES,
  theme: {
    fontFiles: [
      ['JetBrains Mono', monoRegular, 400],
      ['JetBrains Mono', monoMedium, 500],
      ['JetBrains Mono', monoBold, 700],
    ],
  },
} satisfies Edit;
