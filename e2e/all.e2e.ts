// Every browser suite in one run (bun run test:e2e), sharing one build, server and browser, which stop
// when the run ends.
import { afterAll } from 'bun:test';
import { stopServing } from './harness';
import './player.e2e';
import './controls.e2e';
import './slides.e2e';
import './export.e2e';

afterAll(stopServing);
