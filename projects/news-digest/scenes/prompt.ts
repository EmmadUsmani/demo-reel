// The prompt every iteration gets: ops/agent-control/ITERATION_PROMPT.md, abridged (wording kept,
// lines shortened). The two slots that change are filled with real values from the VM's prompt logs:
// iteration 1003's Budget line and the start of iteration 1557's summary.
import { backdrop } from '@engine/draw';
import { C } from '@engine/palette';
import type { Cue, Frame } from '@engine/scene';
import { clamp, prog } from '@engine/util';
import { codeCard, heading, Narrated, paper, pops, tag, text } from '../kit';

const LINES = [
  'You are iteration {{N}} of an unattended, continuous build.',
  'No human is watching; do not ask questions.',
  'You have a fresh session. State lives in repo files and git.',
  '',
  '1. Orient cheaply: STEERING.md, open TASKS.md items,',
  '   the tail of PROGRESS.md, the summary below.',
  '2. git status, git log -5: finish or discard leftovers.',
  '3. Triage before new work: failing tests or build,',
  '   crashed services, a stalled source, a failed digest run.',
  '4. Complete one meaningful, verifiable step.',
  '5. Verify: typecheck, lint, tests, restart, Playwright.',
  '6. Update TASKS.md and PROGRESS.md.',
  '7. Commit each verified step; git push origin main.',
  '8. End with a summary of 10 lines or less.',
  '',
  'Budget: {{BUDGET}}',
  'Previous iteration summary: {{LAST_SUMMARY}}',
];

export default class Prompt extends Narrated {
  protected ids = ['f4b', 'f4c', 'f4d', 'f4f'];
  protected lead = 0.8;
  protected hold = { f4d: 0.6, f4f: 2.6 };

  cues(): Cue[] {
    return [{ kind: 'land', t: 0.5, gain: 0.6 }, ...pops([this.T('f4b') + 1.2, this.T('f4f') + 0.8, this.T('f4f') + 2.2])];
  }

  render(f: Frame) {
    const g = this.g;
    const lt = f.lt;
    backdrop(g, f.t);
    heading(g, 'Every iteration', 'The same short prompt', prog(lt, 0.1, 0.9), 110, 130, 64);
    const hl = (a: number, b: number, from: number, to: number): [number, number, number] => [a, b, clamp(prog(lt, from, from + 0.4) - prog(lt, to - 0.3, to))];
    codeCard(g, 110, 190, 1010, LINES, prog(lt, 0.3, 2.0), {
      title: 'ops/agent-control/ITERATION_PROMPT.md  (abridged)',
      px: 23,
      lineH: 37,
      hl: [
        hl(4, 5, this.T('f4b') + 0.4, this.E('f4b')),
        hl(7, 8, this.T('f4c') + 0.2, this.E('f4c')),
        hl(9, 12, this.T('f4d') + 0.2, this.E('f4d')),
        hl(15, 16, this.T('f4f') + 0.2, this.duration()),
      ],
      dimOthers: prog(lt, this.T('f4b'), this.T('f4b') + 0.5),
    });

    // the standing instructions Codex loads on its own
    const agents = prog(lt, this.T('f4b') + 1.2, this.T('f4b') + 1.8) * (1 - prog(lt, this.T('f4f') - 0.2, this.T('f4f') + 0.2));
    paper(g, 1180, 230, 640, 210, agents, () => {
      text(g, 'Also loaded every time', 1215, 285, { px: 24, weight: 700, color: C.accent600 });
      text(g, 'AGENTS.md: standing rules', 1215, 335, { px: 30, weight: 600 });
      text(g, 'verification, token efficiency, git,', 1215, 380, { px: 24, color: C.gray600 });
      text(g, 'hard limits, the owner’s files', 1215, 414, { px: 24, color: C.gray600 });
    });

    // the two slots, with real values
    const budget = prog(lt, this.T('f4f') + 0.8, this.T('f4f') + 1.4);
    paper(g, 1180, 470, 640, 240, budget, () => {
      tag(g, 1215, 515, '{{BUDGET}}  ·  iteration 1003', 1, 'owner', { px: 22, align: 'left' });
      text(g, 'Codex usage: weekly 58% used', 1215, 580, { px: 26, family: 'mono', weight: 500 });
      text(g, 'vs 57% of the week elapsed.', 1215, 618, { px: 26, family: 'mono', weight: 500 });
      text(g, 'Status: on pace.', 1215, 668, { px: 26, family: 'mono', weight: 700, color: '#166534' });
    });
    const summary = prog(lt, this.T('f4f') + 2.2, this.T('f4f') + 2.8);
    paper(g, 1180, 740, 640, 250, summary, () => {
      tag(g, 1215, 785, '{{LAST_SUMMARY}}  ·  iteration 1557', 1, 'agent', { px: 22, align: 'left' });
      text(g, 'Pushed 85326f3c; working tree clean.', 1215, 848, { px: 22, family: 'mono' });
      text(g, '- Verified 10 real X embeds under', 1215, 886, { px: 22, family: 'mono', color: C.gray700 });
      text(g, '  prepared public CSP across desktop/', 1215, 920, { px: 22, family: 'mono', color: C.gray700 });
      text(g, '  mobile light/dark; saved 40 screenshots.', 1215, 954, { px: 22, family: 'mono', color: C.gray700 });
    });
  }
}
