// Repro of the user report: a stale building in Manage Buildings disables the Building menu.
// The real web store (mepapp.realStore only). Stored handles are fakes over OPFS (same method as b6-t01-noflag-check.mjs).
// MODE env: notfound (getFile throws NotFoundError), hang (getFile never settles), ok (control).
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';

const MODE = process.argv[2] ?? 'notfound';
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
        if (mode === 'notfound') throw new DOMException('A requested file or directory could not be found', 'NotFoundError');
        if (mode === 'hang') return new Promise(() => {});
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
page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
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

await openDialog();
await dlg.getByRole('button', { name: 'New building' }).first().click();
await dlg.locator('input[aria-label="Building name"]').fill('Stale B');
await dlg.locator('input[aria-label="Building name"]').press('Enter');
await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
await idle(800);
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

for (const name of ['Ghost A', 'Stale B']) {
  await dlg.locator('[role="treeitem"]', { hasText: name }).first().click();
  await idle(2500);
  const state = await itemsState();
  console.log(`after click ${name}:`, JSON.stringify(state));
  console.log('  dialog text:', (await dlg.innerText()).replace(/\s+/g, ' ').slice(0, 330));
  check(state['Open building…'] === 'enabled', `${name}: Open building… still enabled`);
  check(state['New building…'] === 'enabled', `${name}: New building… still enabled`);
  await shot(`stale-${MODE}-${name.replace(' ', '')}`);
}
await t.finish?.();
