// Shared driver helpers for the browser checks of auto-routing.md (copied from the room-type-calculations checks).
import { readFileSync } from 'node:fs';

export const REPO = '/root/MepApp/.claude/worktrees/auto-routing';
export const BASE = 'http://127.0.0.1:5462/';
export const PDF = '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf';
export const SP = '/tmp/claude-0/-root-MepApp/b8d93002-0ef6-45fd-91e3-9f5b7239773a/scratchpad';
export const D = '.mep-modal--auto-place';
const { chromium } = await import(`${REPO}/node_modules/playwright/index.mjs`);

/** Opens a page. `seed` is a record of localStorage values to set before the first load. */
export async function open({ width = 1600, height = 1000, seed = {}, dark = false } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light' });
  await context.addInitScript((s) => {
    window.showOpenFilePicker = async () => [await (await navigator.storage.getDirectory()).getFileHandle(window.__nextFile ?? 'drawing.pdf')];
    window.showSaveFilePicker = async () => await (await navigator.storage.getDirectory()).getFileHandle('export.json', { create: true });
    if (!localStorage.getItem('__seeded')) {
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
      localStorage.setItem('__seeded', '1');
    }
  }, seed);
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  let pass = 0;
  const fails = [];
  const check = (ok, what, extra = '') => {
    if (ok) pass++;
    else fails.push(`${what} ${extra}`);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${what} ${ok ? '' : extra}`);
  };
  const statusText = () => page.evaluate(() => document.querySelector('.mep-header-status')?.textContent ?? '');
  async function menu(item) {
    await page.locator('button.mep-menu-btn').click({ timeout: 180000 });
    await page.locator('button.mep-menu-item', { hasText: new RegExp(`^\\s*${item}\\s*$`) }).click({ timeout: 180000 });
  }
  async function until(test, what, ms = 240000) {
    const deadline = Date.now() + ms;
    while (!(await test())) {
      if (Date.now() > deadline) throw new Error(`${what}: timed out; status "${await statusText()}"`);
      await page.waitForTimeout(250);
    }
  }
  async function idle(ms = 450) {
    await page.waitForTimeout(Math.max(ms, 300));
    await page.waitForFunction(() => !document.querySelector('[data-testid=pg-busy]') && !document.querySelector('[data-testid=ap-busy]'), null, { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(50);
  }
  async function start() {
    await page.goto(BASE, { timeout: 180000 });
    await page.locator('button.mep-onboarding-start').click({ timeout: 180000 });
    await page.waitForFunction(() => window.__mepSketchScene !== undefined);
  }
  async function openPdf(path = PDF, name = 'drawing.pdf') {
    await page.evaluate(
      async ([b64, n]) => {
        const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
        await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
        await w.close();
        window.__nextFile = n;
      },
      [readFileSync(path).toString('base64'), name],
    );
    await menu('Open…');
    await until(async () => /Loaded|Could not open/.test(await statusText()), 'open');
    await idle(1000);
  }
  async function openAutoPlace() {
    await menu('Auto-place stamps…');
    await idle(800);
  }
  async function detect(scale = '50') {
    await page.locator(`${D} select.mep-scale-select`).selectOption(scale);
    await idle(400);
    await page.locator('#ap-detect').click();
    await until(async () => (await page.evaluate(() => window.__mepSketchScene.listRooms().length)) > 0 && !/Detecting/i.test(await statusText()), 'detect');
    await idle(1000);
  }
  async function finish() {
    check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
    console.log(`\n${pass} passed, ${fails.length} failed`);
    for (const f of fails) console.log('  - ' + f);
    await browser.close();
  }
  const nav = `${D} nav[data-testid=ap-nav]`;
  return { browser, context, page, errors, check, menu, until, idle, start, openPdf, openAutoPlace, detect, finish, statusText, nav };
}
