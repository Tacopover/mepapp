// B7-T13: a recent building whose file does not answer must not freeze Manage Buildings or the Building menu.
// Real web store (mepapp.realStore only). Stored handles are fakes over OPFS (same method as b6-t01-noflag-check.mjs).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b7-t13-check.mjs <mode>
// mode: hang (getFile of "Stale B" never settles, default), notfound (getFile throws NotFoundError), ok (control, all files answer).
// The check waits about 11 s for the wait limit of the controller (10 s). It has no override of the limit.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';

const MODE = process.argv[2] ?? 'hang';
const t = await open({ seed: { 'mepapp.realStore': '1', '__mode': 'ok' } });
const { page, check, shot, idle, menu } = t;
await t.context.addInitScript(() => {
  window.showSaveFilePicker = async (o) => await (await navigator.storage.getDirectory()).getFileHandle(o?.suggestedName ?? 'x.json', { create: true });
  const proto = FileSystemHandle.prototype;
  proto.queryPermission = async () => 'granted';
  proto.requestPermission = async () => 'granted';
  const proxy = (name) => {
    const real = async () => (await navigator.storage.getDirectory()).getFileHandle(name);
    return {
      kind: 'file',
      name,
      getFile: async () => {
        const mode = localStorage.getItem('__mode');
        const stale = name.startsWith('Stale');
        if (stale && mode === 'notfound') throw new DOMException('A requested file or directory could not be found', 'NotFoundError');
        if (stale && mode === 'hang') return new Promise(() => {});
        return (await real()).getFile();
      },
      createWritable: async () => (await real()).createWritable(),
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
    };
  };
  const origPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    if (this.name === 'pdfHandles') throw new DOMException('no handle store', 'DataError');
    if (this.name === 'handles' && value && typeof value.getFile === 'function') return origPut.call(this, { __fakeHandle: value.name }, key);
    return origPut.call(this, value, key);
  };
  const resultGet = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'result').get;
  Object.defineProperty(IDBRequest.prototype, 'result', {
    get() {
      const value = resultGet.call(this);
      return value && value.__fakeHandle ? proxy(value.__fakeHandle) : value;
    },
  });
});
await t.start();
page.on('crash', () => console.log('PAGE CRASHED'));
page.on('close', () => console.log('PAGE CLOSED'));
const errors = [];
page.on('pageerror', (e) => {
  errors.push(String(e));
  console.log('PAGEERROR', String(e));
});
const dlg = page.locator('.mep-modal');
async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(600);
}
const buildingMenu = () => page.locator('.mep-buildings-menu button.mep-menu-btn');
async function itemsState() {
  await buildingMenu().click();
  const out = {};
  for (const name of ['New building…', 'Open building…']) {
    const item = page.locator('.mep-buildings-menu [role="menuitem"]', { hasText: name });
    out[name] = (await item.count()) === 0 ? 'missing' : (await item.isEnabled()) ? 'enabled' : 'DISABLED';
  }
  await page.keyboard.press('Escape');
  return out;
}
const dialogText = async () => (await dlg.innerText()).replace(/\s+/g, ' ');
async function makeBuilding(name) {
  await buildingMenu().click();
  await page.locator('.mep-buildings-menu [role="menuitem"]', { hasText: 'New building…' }).click();
  await dlg.locator('input[aria-label="Building name"]').fill(name);
  await dlg.locator('input[aria-label="Building name"]').press('Enter');
  await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
  await idle(800);
}

const NO_ANSWER = (name) => `The building file "${name}" did not answer. Check that the file exists and that its folder is online. Use Open building… to find it.`;
const NOT_FOUND = (name) => `The building file "${name}" was not found. Use Open building… to find it.`;

await openDialog();
await makeBuilding('Stale B');
await dlg.getByRole('button', { name: 'Close', exact: true }).click();
await idle(500);
await openDialog();
await makeBuilding('Good C');
await dlg.getByRole('button', { name: 'Close', exact: true }).click();
await idle(500);

await page.evaluate((mode) => {
  localStorage.setItem('__mode', mode);
  const list = JSON.parse(localStorage.getItem('mepapp.buildings.v2') ?? '[]');
  list.push({ id: 'ghost-no-handle', name: 'Ghost A', location: 'C:\\gone\\ghost.building.json' });
  localStorage.setItem('mepapp.buildings.v2', JSON.stringify(list));
}, MODE);
await page.reload();
await page.locator('button.mep-onboarding-start').click({ timeout: 60000 }).catch(() => {});
await page.waitForFunction(() => window.__mepSketchScene !== undefined);
await openDialog();
console.log('MODE', MODE, 'menu at open:', JSON.stringify(await itemsState()));
const open0 = await itemsState();
check(open0['Open building…'] === 'enabled' && open0['New building…'] === 'enabled', 'menu items enabled when the dialog opens');

async function clickBuilding(name) {
  await dlg.locator('[role="treeitem"]', { hasText: name }).first().click();
}
async function waitForText(text, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if ((await dialogText()).includes(text)) return Date.now() - start;
    await page.waitForTimeout(250);
  }
  return -1;
}
async function dismiss() {
  const btn = dlg.getByRole('button', { name: 'Dismiss' });
  if ((await btn.count()) > 0) await btn.first().click();
  await idle(300);
}

if (MODE === 'hang') {
  await clickBuilding('Stale B');
  const waited = await waitForText(NO_ANSWER('Stale B'), 16000);
  console.log('message after (ms):', waited);
  check(waited >= 9000 && waited <= 15000, 'the message "did not answer" shows after about the wait limit (10 s)', String(waited));
  await shot('b7-t13-hang-message');
  const state = await itemsState();
  console.log('menu after the limit:', JSON.stringify(state));
  check(state['Open building…'] === 'enabled', 'Open building… enabled after the limit');
  check(state['New building…'] === 'enabled', 'New building… enabled after the limit');
  check((await dialogText()).includes(NO_ANSWER('Stale B')), 'the dialog shows the exact message');
  check((await dlg.locator('[role="treeitem"]', { hasText: 'Stale B' }).count()) > 0, 'the stale entry stays in the list');
  await dismiss();
  // another building works
  await clickBuilding('Good C');
  await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
  await idle(800);
  const afterGood = await dialogText();
  check(!afterGood.includes('did not answer'), 'the message goes away when another building opens');
  const treeItems = await dlg.locator('[role="treeitem"]').count();
  console.log('tree items:', treeItems);
  check(treeItems >= 3, 'the tree lists the buildings and the open building', String(treeItems));
  const afterOpen = await itemsState();
  check(afterOpen['Open building…'] === 'enabled' && afterOpen['New building…'] === 'enabled', 'menu enabled with Good C open');
  await shot('b7-t13-hang-good-open');
  // the not-found entry still gives its old message at once
  await clickBuilding('Ghost A');
  const ghost = await waitForText(NOT_FOUND('Ghost A'), 4000);
  check(ghost >= 0, 'a building with no stored handle gives the not-found message at once', String(ghost));
  // a click on the stale entry a second time works the same way and keeps Good C open
  await dismiss();
  await clickBuilding('Stale B');
  const again = await waitForText(NO_ANSWER('Stale B'), 16000);
  check(again >= 9000 && again <= 15000, 'a second click on the stale entry gives the message again', String(again));
  const state2 = await itemsState();
  check(state2['Open building…'] === 'enabled' && state2['New building…'] === 'enabled', 'menu enabled after the second limit');
  check((await dialogText()).includes('Levels and sheets'), 'the open building stays open after the second limit');
  // forget works
  await dlg.locator('[role="treeitem"]', { hasText: 'Stale B' }).first().hover();
  const forget = dlg.locator('[role="treeitem"]', { hasText: 'Stale B' }).first().locator('button');
  console.log('forget buttons:', await forget.count());
  if ((await forget.count()) > 0) {
    await forget.first().click();
    await idle(500);
    check((await dlg.locator('[role="treeitem"]', { hasText: 'Stale B' }).count()) === 0, 'the x button removes the stale entry');
  } else {
    check(false, 'a forget button exists on the stale entry');
  }
  await shot('b7-t13-hang-end');
} else if (MODE === 'notfound') {
  await clickBuilding('Stale B');
  const found = await waitForText(NOT_FOUND('Stale B'), 5000);
  check(found >= 0 && found < 4000, 'notfound: the old not-found message shows at once', String(found));
  const state = await itemsState();
  check(state['Open building…'] === 'enabled' && state['New building…'] === 'enabled', 'notfound: menu enabled');
  check(!(await dialogText()).includes('did not answer'), 'notfound: no "did not answer" text');
  await shot('b7-t13-notfound');
} else {
  await clickBuilding('Stale B');
  await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
  await idle(800);
  const text = await dialogText();
  check(!text.includes('did not answer') && !text.includes('was not found'), 'ok: a good building opens with no message');
  await clickBuilding('Good C');
  await idle(1500);
  check((await dialogText()).includes('Levels and sheets'), 'ok: a second good building opens');
  const state = await itemsState();
  check(state['Open building…'] === 'enabled' && state['New building…'] === 'enabled', 'ok: menu enabled');
  await shot('b7-t13-ok');
}
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish?.();
