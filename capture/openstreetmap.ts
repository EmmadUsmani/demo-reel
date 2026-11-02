#!/usr/bin/env bun
// OpenStreetMap (openstreetmap.org), the open map of the world: one recorded session that searches
// for a city, shows the pinned result, and zooms in from the city to its streets. (The result's own
// "object" page lists raw ids and tags, so the session never opens it.)
//   bun capture/openstreetmap.ts          (BASE_URL films another instance)
// Everything on screen is the site as a signed-out visitor sees it, in a fresh browser context; map
// tiles come from OpenStreetMap's own tile servers, so a network connection is needed. The map's
// fly-to and zoom animations play on the virtual clock, and `settle` waits for tiles in view.
import type { Page } from 'playwright-core';
import { baseUrl, Footage, launch, settle } from './lib';
import { Recorder } from './record';

const URL = baseUrl('https://www.openstreetmap.org');
const QUERY = 'Berkeley, California';
const footage = new Footage('openstreetmap');

const search = (page: Page) => page.locator('input[name=query]:visible').first();
const firstResult = (page: Page) => page.locator('a.set_position').first();
const zoomIn = (page: Page) => page.locator('.zoom').locator('a, button').first();
const map = (page: Page) => page.locator('.leaflet-container');
const sidebar = (page: Page) => page.locator('#sidebar');

const { browser, page } = await launch();
try {
  await page.goto(`${URL}/`);
  await search(page).waitFor({ timeout: 30_000 });
  await settle(page, 2500);

  const rec = await new Recorder(footage, page, 'session', { from: { x: 1200, y: 700 } }).start();
  await rec.hold(0.8);
  await rec.mark('start', { search: search(page), map: map(page), zoom: page.locator('.zoom') });

  // search
  await rec.moveToElement(search(page), 0.9, 0.4, 0.5);
  await rec.hold(0.2);
  await rec.click();
  await rec.hold(0.3);
  await rec.mark('focused', { search: search(page) });
  await rec.type(QUERY, 0.06);
  await rec.hold(0.2);
  await rec.key('Enter', 6);
  await rec.until(firstResult(page), 15);
  await rec.hold(0.7);
  await rec.mark('results', { search: search(page), result: firstResult(page), sidebar: sidebar(page) });
  await rec.hold(0.5);

  // the map has flown to the city and dropped a pin; give the tiles time to arrive
  await rec.hold(1.0);
  await rec.mark('found', { map: map(page), pin: page.locator('.leaflet-marker-icon').first(), sidebar: sidebar(page), zoom: page.locator('.zoom') });
  await rec.hold(0.8);

  // zoom in, a level at a time
  await rec.moveToElement(zoomIn(page), 0.9);
  await rec.hold(0.2);
  for (let i = 0; i < 3; i++) {
    await rec.click();
    await rec.hold(1.4);
  }
  await rec.mark('zoomed', { map: map(page), zoom: page.locator('.zoom'), sidebar: sidebar(page), pin: page.locator('.leaflet-marker-icon').first() });
  await rec.moveTo(900, 560, 0.7);
  await rec.hold(1.4);
  await rec.mark('done', { map: map(page), sidebar: sidebar(page), attribution: page.locator('.leaflet-control-attribution'), app: page.locator('body') });
  await rec.stop();
  footage.save();
} finally {
  await browser.close();
}
