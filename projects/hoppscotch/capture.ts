#!/usr/bin/env bun
// Hoppscotch (hoppscotch.io), the open-source API client: one recorded session that adds a query
// parameter to the pre-filled echo request, sends it, adds a second parameter and sends again, so the
// response visibly reflects what was typed.
//   bun capture/hoppscotch.ts          (BASE_URL films another build, e.g. a self-hosted one)
// The request goes to Hoppscotch's own public echo endpoint (echo.hoppscotch.io), which mirrors back
// the request. Below the first few lines the echo lists this browser's request headers, so scenes only
// ever show the top of the response and the capture never scrolls it. No account, nothing saved:
// the app is used signed out, in a fresh browser context.
import type { Page } from 'playwright-core';
import { baseUrl, Footage, launch, settle } from '../../capture/lib';
import { Recorder } from '../../capture/record';

const URL = baseUrl('https://hoppscotch.io');
const footage = new Footage('hoppscotch');

const send = (page: Page) => page.locator('button').filter({ hasText: /^\s*Send\s*$/ }).first();
const keyCell = (page: Page, row: number) => page.locator('[placeholder^="Key"]').nth(row);
const valueCell = (page: Page, row: number) => page.locator('[placeholder^="Value"]').nth(row);
const status = (page: Page) => page.getByText(/^Status:/).first();
// the smallest element holding the whole Status / Time / Size row
const statusRow = (page: Page) => page.locator('div').filter({ has: page.getByText(/^Status:/) }).filter({ has: page.getByText(/^Size:/) }).last();
const token = (page: Page, text: string) => page.getByText(text, { exact: true }).first();

async function addParam(rec: Recorder, page: Page, row: number, key: string, value: string) {
  await rec.moveToElement(keyCell(page, row), 0.8, 0.3, 0.5);
  await rec.hold(0.15);
  await rec.click();
  await rec.hold(0.2);
  await rec.type(key, 0.07);
  await rec.hold(0.15);
  await rec.moveToElement(valueCell(page, row), 0.5, 0.3, 0.5);
  await rec.click();
  await rec.hold(0.2);
  await rec.type(value, 0.07);
  await rec.hold(0.4);
}

const { browser, page } = await launch();
try {
  await page.goto(`${URL}/`);
  await send(page).waitFor({ timeout: 30_000 });
  await settle(page, 2000);
  if ((await page.getByText('echo.hoppscotch.io').count()) < 1) throw new Error('the echo request is not pre-filled');

  const rec = await new Recorder(footage, page, 'session', { from: { x: 1250, y: 760 } }).start();
  await rec.hold(0.7);
  await rec.mark('start', { send: send(page), url: page.getByText('https://echo.hoppscotch.io').first(), app: page.locator('body') });

  // first parameter, then send
  await addParam(rec, page, 0, 'greeting', 'hello');
  await rec.mark('param1', { key: keyCell(page, 0), value: valueCell(page, 0), send: send(page) });
  await rec.moveToElement(send(page), 0.8);
  await rec.hold(0.2);
  await rec.click();
  await rec.until(token(page, '"greeting"'));
  await rec.moveTo(980, 560, 0.7); // clear of the response
  await rec.hold(0.6);
  if (!(await token(page, '"hello"').isVisible())) throw new Error('the echo did not reflect the first parameter');
  await rec.mark('sent1', { status: statusRow(page), method: token(page, '"method"'), hello: token(page, '"hello"'), greeting: token(page, '"greeting"') });
  await rec.hold(0.5);

  // second parameter, then send again
  await addParam(rec, page, 1, 'from', 'demo-reel');
  await rec.mark('param2', { key: keyCell(page, 1), value: valueCell(page, 1), send: send(page) });
  await rec.moveToElement(send(page), 0.8);
  await rec.hold(0.2);
  await rec.click();
  await rec.until(token(page, '"from"'));
  await rec.moveTo(980, 560, 0.7);
  await rec.hold(0.6);
  if (!(await token(page, '"demo-reel"').isVisible())) throw new Error('the echo did not reflect the second parameter');
  await rec.mark('sent2', { status: status(page), from: token(page, '"from"'), value: token(page, '"demo-reel"'), greeting: token(page, '"greeting"'), app: page.locator('body') });
  await rec.hold(1.2);
  await rec.stop();
  footage.save();
} finally {
  await browser.close();
}
