// Every browser suite in one run (bun run test:e2e), sharing one build, server and browser, which stop
// when the run ends.
import { afterAll } from 'bun:test';
import { stopServing } from './harness';
import './player.e2e';
import './controls.e2e';
import './links.e2e';
import './layout.e2e';
import './preview.e2e';
import './slides.e2e';
import './presenter.e2e';
import './deck.e2e';
import './export.e2e';
import './single.e2e';
import './pilot.e2e';
import './deck-ui.e2e';

afterAll(stopServing);
