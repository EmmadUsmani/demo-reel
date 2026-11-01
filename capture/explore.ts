#!/usr/bin/env bun
// Look at a page before writing its capture: screenshot it and list its controls with their boxes.
//   bun capture/explore.ts <name> <url> [step ...]   (a path is resolved against BASE_URL)
// Steps run in order: click:<accessible name>  (a button, link, radio or tab, exact name or /regex/)   clickAt:<x>,<y>
//                     fill:<placeholder or label>=<text>   wait:<ms>   scroll:<y>   press:<key>
// Writes out/explore/<name>.png and prints the controls (CSS px, document coordinates).
import { mkdirSync } from 'node:fs';
import { baseUrl, launch, settle } from './lib';

const [name = 'page', target, ...steps] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const { browser, page } = await launch();
const matcher = (text: string) => (text.startsWith('/') && text.endsWith('/') ? new RegExp(text.slice(1, -1)) : text);
if (!target) throw new Error('usage: bun capture/explore.ts <name> <url> [step ...]');
try {
  await page.goto(/^https?:/.test(target) ? target : `${baseUrl('http://localhost:3000')}${target}`);
  await settle(page, 1500);
  for (const step of steps) {
    const [kind, ...rest] = step.split(':');
    const arg = rest.join(':');
    if (kind === 'click') {
      const name = matcher(arg);
      const target = page.getByRole('button', { name }).or(page.getByRole('link', { name })).or(page.getByRole('radio', { name })).or(page.getByRole('tab', { name })).first();
      await target.click({ timeout: 15_000 });
    } else if (kind === 'clickAt') {
      const [x, y] = arg.split(',').map(Number);
      await page.mouse.click(x!, y!);
    } else if (kind === 'fill') {
      const [field, value = ''] = arg.split('=');
      await page.getByPlaceholder(field!).or(page.getByLabel(field!)).first().fill(value);
    } else if (kind === 'wait') await page.waitForTimeout(+arg);
    else if (kind === 'scroll') await page.evaluate((y) => window.scrollTo(0, y), +arg);
    else if (kind === 'press') await page.keyboard.press(arg);
    await settle(page, 800);
  }
  mkdirSync('out/explore', { recursive: true });
  await page.screenshot({ path: `out/explore/${name}.png` });
  console.log(`url: ${page.url()}`);
  const found = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, a[href], input, textarea, select, [role=dialog], [role=radio], [role=tab], [role=switch], [role=group], [role=radiogroup], h1, h2, h3, [draggable=true], [data-testid]'))
      .filter((element) => { const r = element.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map((element) => {
        const r = element.getBoundingClientRect();
        const role = element.getAttribute('role') ?? '';
        const testid = element.getAttribute('data-testid');
        const label = element.getAttribute('aria-label') ?? (element as HTMLInputElement).placeholder ?? '';
        const text = (element as HTMLElement).innerText?.replace(/\s+/g, ' ').slice(0, 70) ?? '';
        return `${element.tagName.toLowerCase()}${role ? `[${role}]` : ''}${testid ? `{${testid}}` : ''} ${Math.round(r.left)},${Math.round(r.top + scrollY)} ${Math.round(r.width)}x${Math.round(r.height)}  ${label ? `«${label}» ` : ''}${text}`;
      }),
  );
  console.log(found.join('\n'));
} finally {
  await browser.close();
}
