// News Digest's product scene with speaker notes: one note per beat, each at that beat's stop.
import Product from '../../news-digest/scenes/product';

const NOTES = [
  'Every morning at seven it publishes an edition. Each topic gets a short brief, the top stories, and the best posts from X and Bluesky.',
  'Behind it is an admin console. It tracks the sources, the spend, and what every edition cost.',
  'That is the whole product. The interesting part is how it gets built.',
];

export default class extends Product {
  notes() { return this.stops().map((at, i) => ({ at, text: NOTES[i]! })); }
}
