#!/usr/bin/env bun
// Vite's homepage (vite.dev), the open-source frontend build tool: plates for a short shots-only
// reel. The page's own promo banner is dismissed with its close button, as a visitor would.
//   bun capture/vite.ts               (BASE_URL films another build of the site)
// The hero's illustration animates; the plates freeze it at whatever frame the shot lands on.
import type { Page } from 'playwright-core';
import { baseUrl, Footage, launch, loadWholePage, settle } from './lib';

const URL = baseUrl('https://vite.dev');
const footage = new Footage('vite');

const headline = (page: Page) => page.getByRole('heading', { level: 1, name: /The Build Tool/ });
const intro = (page: Page) => page.getByText('Vite is a blazing fast', { exact: false }).first();
const install = (page: Page) => page.getByText('npm create vite@latest').first();
const actions = (page: Page) => page.getByRole('link', { name: 'Get Started' }).first();
const devx = (page: Page) => page.getByRole('heading', { level: 2, name: 'Redefining developer experience' });

const { browser, page } = await launch();
try {
  await page.goto(`${URL}/`);
  await headline(page).waitFor({ timeout: 30_000 });
  const close = page.getByRole('button', { name: 'Close banner' });
  if (await close.count()) { await close.click(); await page.waitForTimeout(500); }
  await settle(page, 1500);
  await loadWholePage(page);
  if (await close.isVisible().catch(() => false)) throw new Error('the promo banner is still open');

  const sectionAfter = devx(page).locator('xpath=ancestor::section[1]/following-sibling::section[1]');
  await footage.shot(page, 'page', {
    headline: headline(page), intro: intro(page), install: install(page), actions: actions(page),
    devx: devx(page), devxGrid: sectionAfter,
  }, { fullPage: true, maxHeight: 2600 });
  footage.save();
} finally {
  await browser.close();
}
