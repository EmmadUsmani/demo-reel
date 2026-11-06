#!/usr/bin/env bun
// Qiyami (qiyami.com): a free prayer-time and last-third-of-the-night (Tahajjud) calculator. One
// recorded session: the dashboard as it loads, then the settings sheet (Asr method + a city
// override), saved.
//   bun projects/qiyami/capture.ts            (BASE_URL films another build)
// Nothing is hidden or edited on the page. The location is the site's own IP guess; the city
// override is typed into the real settings sheet during the recording. Settings live in the
// browser, so a fresh context is the same start every take. Prayer times are live for the day filmed.
import type { Page } from 'playwright-core';
import { baseUrl, Footage, launch, settle } from '../../capture/lib';
import { Recorder } from '../../capture/record';

const URL = baseUrl('https://www.qiyami.com');
const CITY = 'San Jose'; // same time zone as the filming machine: the site shows times in the browser's zone
const footage = new Footage('qiyami');

const region = (page: Page) => page.getByRole('region', { name: /Prayer timeline/ });
const header = (page: Page) => page.getByText(/^\((IP Approximate Location|Override)\)$/).locator('xpath=../..');
const times = (page: Page) => page.getByText('Prayer and Tahajjud Times Today').locator('xpath=..');
const night = (page: Page) => page.getByText('Last 3rd of Night').locator('xpath=../..');
const verses = (page: Page) => page.locator('blockquote').first().locator('xpath=../../..');
const settingsBtn = (page: Page) => page.getByRole('button', { name: 'Open settings' });
const sheet = (page: Page) => page.getByRole('dialog');
const hanafi = (page: Page) => page.getByRole('button', { name: 'Hanafi' });
const cityBox = (page: Page) => page.getByRole('textbox', { name: 'Enter a city name' });
const suggestion = (page: Page) => page.getByRole('button', { name: new RegExp(`^${CITY}, California`) }).first();
const save = (page: Page) => page.getByRole('button', { name: 'Save Settings' });

const { browser, page } = await launch();
try {
  await page.goto(`${URL}/`);
  await region(page).getByText(/begins in/i).waitFor({ timeout: 45_000 });
  await settle(page, 1500);

  const rec = await new Recorder(footage, page, 'session', { from: { x: 1200, y: 700 } }).start();
  await rec.hold(0.6);
  await rec.mark('start', { app: page.locator('main'), region: region(page), times: times(page), night: night(page), verses: verses(page), header: header(page) });
  await rec.moveToElement(region(page), 1.0, 0.7, 0.3);
  await rec.hold(0.4);
  await rec.mark('countdown', { region: region(page) });
  await rec.hold(1.0);
  // rest the pointer in the gap under the two cards so it never sits on a time
  await rec.moveToElement(night(page), 1.0, 0.5, 1.12);
  await rec.hold(0.4);
  await rec.mark('night', { night: night(page), times: times(page) });
  await rec.hold(1.0);
  await rec.moveToElement(verses(page), 1.0, 0.8, 0.8);
  await rec.hold(0.4);
  await rec.mark('verses', { verses: verses(page) });
  await rec.hold(1.0);

  // settings
  await rec.moveToElement(settingsBtn(page), 1.0);
  await rec.hold(0.2);
  await rec.click();
  await rec.until(sheet(page));
  await rec.hold(0.7);
  await rec.mark('settings', { sheet: sheet(page), hanafi: hanafi(page), city: cityBox(page) });
  await rec.moveToElement(hanafi(page), 0.8);
  await rec.hold(0.2);
  await rec.click();
  await rec.hold(0.4);
  await rec.moveToElement(cityBox(page), 0.8);
  await rec.click();
  await rec.type(CITY, 0.06);
  await rec.until(suggestion(page));
  await rec.hold(0.4);
  await rec.mark('city', { sheet: sheet(page), city: cityBox(page), suggestion: suggestion(page) });
  await rec.moveToElement(suggestion(page), 0.7);
  await rec.click();
  await rec.hold(2.0); // the app re-runs its city search after a pick; saving too early drops the choice
  await rec.moveToElement(save(page), 0.8);
  await rec.mark('save', { sheet: sheet(page), save: save(page) });
  await rec.click();
  await rec.until(page.getByText('(Override)'));
  await rec.hold(1.6);
  const shown = await header(page).innerText();
  if (!shown.includes(CITY)) throw new Error(`the header does not show ${CITY} after saving`);
  // wet weather turns the page's backdrop into an animation that flickers frame to frame under the recorder
  if (/drizzle|rain|shower|snow|thunder|storm|fog/i.test(shown)) throw new Error(`the weather is not filmable (${shown.replace(/\s+/g, ' ')}); pick another city or retake later`);
  await rec.moveTo(720, 820, 0.7);
  await rec.hold(0.3);
  await rec.mark('saved', { app: page.locator('main'), header: header(page), region: region(page), times: times(page), night: night(page) });
  await rec.hold(1.0);
  await rec.stop();
  footage.save();
} finally {
  await browser.close();
}
