#!/usr/bin/env bun
// TodoMVC (React), the open-source reference app at todomvc.com: one recorded session that adds
// three todos, completes one and filters to what's left.
//   bun capture/todomvc.ts            (BASE_URL films another build, e.g. a local checkout)
// The page's "learn" sidebar is the TodoMVC site's documentation, not the app, so it is removed
// before filming and the app sits centred. Everything else on screen is the app as it runs; a fresh
// browser context means an empty list every take. Nothing leaves the browser: the app keeps its
// todos in localStorage.
import type { Page } from 'playwright-core';
import { baseUrl, Footage, launch, settle } from './lib';
import { Recorder } from './record';

const URL = baseUrl('https://todomvc.com/examples/react/dist');
const TODOS = ['Record the demo', 'Write the narration', 'Render the video'];

const footage = new Footage('todomvc');

const input = (page: Page) => page.getByTestId('text-input');
const list = (page: Page) => page.getByTestId('todo-list');
const item = (page: Page, text: string) => page.getByTestId('todo-item').filter({ hasText: text });
const toggle = (page: Page, text: string) => item(page, text).getByTestId('todo-item-toggle');
const footer = (page: Page) => page.getByTestId('footer');
const filters = (page: Page) => page.getByTestId('footer-navigation');
const filter = (page: Page, name: string) => filters(page).getByRole('link', { name, exact: true });
const app = (page: Page) => page.locator('section.todoapp');

async function open(page: Page) {
  await page.goto(`${URL}/`);
  await input(page).waitFor({ timeout: 30_000 });
  await page.evaluate(() => { document.querySelector('aside.learn')?.remove(); document.body.classList.remove('learn-bar'); });
  await settle(page, 1200);
  if (await page.getByTestId('todo-item').count()) throw new Error('the list is not empty at the start');
}

const { browser, page } = await launch();
try {
  await open(page);
  const rec = await new Recorder(footage, page, 'session', { from: { x: 1180, y: 640 } }).start();
  await rec.hold(0.6);
  await rec.mark('start', { input: input(page), app: app(page) });

  // add three todos
  await rec.moveToElement(input(page), 0.9, 0.35, 0.5);
  await rec.click();
  await rec.hold(0.25);
  await rec.mark('focused', { input: input(page) });
  for (const [i, text] of TODOS.entries()) {
    await rec.type(text, 0.055);
    await rec.hold(0.15);
    await rec.key('Enter', 6);
    await rec.mark(`added${i}`, { input: input(page), item: item(page, text), list: list(page) });
  }
  await rec.hold(0.5);
  await rec.mark('added', { input: input(page), list: list(page), footer: footer(page), app: app(page) });

  // complete the first one
  await rec.moveToElement(toggle(page, TODOS[0]!), 0.9);
  await rec.hold(0.2);
  await rec.click();
  await rec.hold(0.6);
  if (!(await item(page, TODOS[0]!).evaluate((li) => li.classList.contains('completed')))) throw new Error('the first todo did not complete');
  await rec.mark('done', { item: item(page, TODOS[0]!), toggle: toggle(page, TODOS[0]!), count: footer(page).locator('.todo-count'), footer: footer(page) });
  await rec.hold(0.6);

  // filter to what's left
  await rec.moveToElement(filter(page, 'Active'), 0.9);
  await rec.hold(0.2);
  await rec.click();
  await rec.hold(0.3);
  // the pointer drifts off the filter, so the scene's label beneath it is clear
  await rec.moveTo(1060, 560, 0.7);
  await rec.hold(0.2);
  if ((await page.getByTestId('todo-item').count()) !== 2) throw new Error('the Active filter does not show the two open todos');
  await rec.mark('filtered', { filter: filter(page, 'Active'), filters: filters(page), list: list(page), footer: footer(page), app: app(page) });
  await rec.hold(1.2);
  await rec.stop();
  footage.save();
} finally {
  await browser.close();
}
