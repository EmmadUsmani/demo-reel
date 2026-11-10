// News Digest's observability scene as one slide: the pipeline built and its packets flowing, held with
// the flow going on (Frame.ambient). The dashboards that follow in the video fly in on the step to the next slide.
import Observe from '../../news-digest/scenes/observe';

export default class extends Observe {
  /** Once the last edge is drawn, a moment before the diagram fades back for the dashboards (that fade ends this beat's picture). */
  stops() { return [this.E('a6a') - 2.85]; }
  notes() {
    return [{
      at: this.stops()[0]!,
      text: 'Everything it does is observable. Logs and metrics go to a self-hosted stack on the same VM, with alerts, and Grafana on top. The packets are live: that is the data moving.',
    }];
  }
}
