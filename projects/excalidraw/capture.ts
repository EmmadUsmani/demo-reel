#!/usr/bin/env bun
// Excalidraw (excalidraw.com), the open-source virtual whiteboard: one recorded session that draws a
// three-step flow (a rectangle, a diamond and an ellipse, each labelled) and joins them with arrows.
//   bun capture/excalidraw.ts          (BASE_URL films another build, e.g. a self-hosted one)
// A fresh browser context means an empty canvas. The "Try Excalidraw+" promo button is hidden for
// filming. Shapes are canvas pixels, so the scene's labels aim at invisible marker elements placed at
// the exact rectangle each drag drew; the markers add no pixels. Nothing leaves the browser.
import type { Page } from 'playwright-core';
import { baseUrl, Footage, launch, settle } from '../../capture/lib';
import { Recorder } from '../../capture/record';

const URL = baseUrl('https://excalidraw.com');
const footage = new Footage('excalidraw');

// Where each shape is dragged out, in viewport px.
const SHAPES = [
  // clear of the style panel that opens down the left edge (about 215 px wide) when a tool is picked
  { id: 'idea', tool: 'rectangle', text: 'Idea', x: 290, y: 400, w: 250, h: 130 },
  { id: 'sketch', tool: 'diamond', text: 'Sketch', x: 640, y: 380, w: 250, h: 170 },
  { id: 'share', tool: 'ellipse', text: 'Share', x: 990, y: 400, w: 250, h: 130 },
] as const;

const tool = (page: Page, name: string) => page.getByTestId(`toolbar-${name}`);
const canvas = (page: Page) => page.locator('canvas.interactive');

async function marker(page: Page, id: string, x: number, y: number, w: number, h: number) {
  await page.evaluate(([id, x, y, w, h]) => {
    const el = document.createElement('div');
    el.id = `mark-${id}`;
    el.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;pointer-events:none;visibility:hidden`;
    document.body.append(el);
  }, [id, x, y, w, h] as const);
}

const { browser, page } = await launch({ hide: ['a[href*="plus.excalidraw.com"]'] });
try {
  await page.goto(`${URL}/`);
  await tool(page, 'rectangle').waitFor({ timeout: 30_000 });
  await settle(page, 1500);
  for (const s of SHAPES) await marker(page, s.id, s.x, s.y, s.w, s.h);

  const rec = await new Recorder(footage, page, 'session', { from: { x: 1180, y: 700 } }).start();
  await rec.hold(0.6);
  await rec.mark('start', { toolbar: page.getByTestId('toolbar-selection').locator('xpath=ancestor::div[contains(@class,"Island")][1]'), canvas: canvas(page) });

  for (const [i, s] of SHAPES.entries()) {
    await rec.moveToElement(tool(page, s.tool), i === 0 ? 0.9 : 0.7);
    await rec.hold(0.15);
    await rec.click();
    await rec.hold(0.2);
    if (i === 0) await rec.mark('tool', { tool: tool(page, s.tool), toolbar: page.getByTestId('toolbar-selection').locator('xpath=ancestor::div[contains(@class,"Island")][1]') });
    await rec.moveTo(s.x, s.y, 0.6);
    await rec.press();
    await rec.moveTo(s.x + s.w, s.y + s.h, 0.7);
    await rec.release();
    await rec.hold(0.25);
    if (i === 0) await rec.mark('drawn', { shape: page.locator(`#mark-${s.id}`), canvas: canvas(page) });
    await rec.key('Enter', 6);
    await rec.type(s.text, 0.09);
    await rec.hold(0.2);
    await rec.key('Escape', 6);
    await rec.hold(0.3);
    await rec.mark(s.id, { shape: page.locator(`#mark-${s.id}`) });
  }
  await rec.mark('shapes', { idea: page.locator('#mark-idea'), sketch: page.locator('#mark-sketch'), share: page.locator('#mark-share'), canvas: canvas(page) });

  // join them with arrows (the arrow tool binds to the shapes under each end)
  for (const [i, [a, b]] of [[SHAPES[0], SHAPES[1]], [SHAPES[1], SHAPES[2]]].entries()) {
    await rec.moveToElement(tool(page, 'arrow'), 0.7);
    await rec.hold(0.15);
    await rec.click();
    await rec.hold(0.2);
    const y = a!.y + a!.h / 2;
    await rec.moveTo(a!.x + a!.w - 40, y, 0.6);
    await rec.press();
    await rec.moveTo(b!.x + 40, y, 0.8);
    await rec.release();
    await rec.hold(0.4);
    if (i === 0) await rec.mark('arrow', { idea: page.locator('#mark-idea'), sketch: page.locator('#mark-sketch'), canvas: canvas(page) });
  }

  // click empty canvas to drop the selection, and drift clear of the diagram
  await rec.moveTo(720, 700, 0.8);
  await rec.click();
  await rec.hold(0.8);
  await rec.mark('done', { idea: page.locator('#mark-idea'), sketch: page.locator('#mark-sketch'), share: page.locator('#mark-share'), canvas: canvas(page) });
  await rec.hold(1.2);
  await rec.stop();
  footage.save();
} finally {
  await browser.close();
}
