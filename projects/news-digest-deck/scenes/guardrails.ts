// News Digest's guardrails scene with a speaker note, and its one stop moved to after the fourth fence has
// landed (the scene's own stop, a beat's end less 0.7 s, falls before it and shows three).
import Guardrails from '../../news-digest/scenes/guardrails';

export default class extends Guardrails {
  stops() { return [this.E('f10a') + 0.15]; }

  notes() {
    return [{
      at: this.stops()[0]!,
      text: 'The agent works inside fences it cannot move. Tests never call paid APIs, one command gates every commit, owner files are reverted after every run, and the providers enforce the spend caps.',
    }];
  }
}
