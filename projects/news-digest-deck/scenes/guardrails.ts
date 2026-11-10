// News Digest's guardrails scene with a speaker note on its one slide.
import Guardrails from '../../news-digest/scenes/guardrails';

export default class extends Guardrails {
  notes() {
    return [{
      at: this.stops()[0]!,
      text: 'The agent works inside fences it cannot move. Tests never call paid APIs, one command gates every commit, owner files are reverted after every run, and the providers enforce the spend caps.',
    }];
  }
}
