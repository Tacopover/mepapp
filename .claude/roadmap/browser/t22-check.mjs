// T22: the "Limits of this network" section of the Size dialog, through the real menu and real inputs.
// The type gets its method through the scene API (the editor change is T23). Run:
// node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/t22-check.mjs
import { open, buildSizingProject } from './r5-lib.mjs';

const t = await open();
const { page, check, idle, shot } = t;
const Z = '.mep-modal--route';
const q = (id) => page.locator(`${Z} [data-testid=${id}]`);
const count = (id) => q(id).count();
const entries = () => page.evaluate(() => window.__mepSketchScene.exportProject().networkSizing);
const typeInto = async (id, value) => {
  await q(id).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(value);
  await page.keyboard.press('Tab');
  await idle(500);
};

await t.start();
await t.openPdf();
const b = await buildSizingProject(t, { type: 'air', sizingMethod: 'air' });
await page.evaluate(() => window.__mepSketchScene.updateNetworkType('supply-air', { flowUnit: 'dm³/s' }));
await t.menu('Size network…');
await page.locator(Z).waitFor({ timeout: 20000 });
await idle(500);

check((await count('size-limits')) === 1, '1: the limits section shows');
check((await count('size-line-no-sizing')) === 1 && (await count('size-edit-type')) === 0, '1: no-sizing shows and there is no editor button');
check((await q('size-limits-clear').isDisabled()), '1: Clear limits is disabled with no entry');
check((await q('size-air-max-velocity').inputValue()) === '', '1: the fields are empty');
await shot('T22-limits-empty');

// suggested
await q('size-limits-suggest').click();
await idle(500);
check((await q('size-air-max-velocity').inputValue()) === '5' && (await q('size-air-max-drop').inputValue()) === '1', '2: Use suggested values fills 5 and 1');
let e = await entries();
check(e.length === 1 && e[0].startStampId === b.equipmentId && e[0].settings.maxVelocityMs === 5, '2: the export holds the entry', JSON.stringify(e));
check((await count('size-line-no-sizing')) === 0 && !(await q('size-apply').isDisabled()), '2: no-sizing goes and Size network is enabled');
await shot('T22-limits-suggested');

// typed value, writes at once
await typeInto('size-air-max-velocity', '3');
e = await entries();
check(e[0].settings.maxVelocityMs === 3, '3: a typed 3 is saved', JSON.stringify(e));
check((await q('size-air-max-velocity').inputValue()) === '3', '3: the typed text stays in the field');

// invalid
await typeInto('size-air-max-velocity', '0');
check((await count('size-error-air-max-velocity')) === 1, '4: an error line shows for 0');
check((await entries())[0].settings.maxVelocityMs === 3, '4: the entry keeps the last valid value');
await shot('T22-limits-error');
await typeInto('size-air-max-velocity', 'abc');
check((await entries())[0].settings.maxVelocityMs === 3, '4: abc writes nothing');

// rectangular shape shows the aspect field
await typeInto('size-air-max-velocity', '5');
await q('size-air-shape').selectOption('rectangular');
await idle(400);
check((await count('size-air-aspect')) === 1, '5: the aspect field shows for rectangular');
e = await entries();
check(e[0].settings.shape === 'rectangular', '5: the shape is saved', JSON.stringify(e));
await q('size-air-shape').selectOption('round');
await idle(300);

// clear
await q('size-limits-clear').click();
await idle(500);
check((await entries()).length === 0 && (await count('size-line-no-sizing')) === 1, '6: Clear limits removes the entry');
check((await q('size-air-max-velocity').inputValue()) === '', '6: the fields are empty again');

// narrow
await q('size-limits-suggest').click();
await idle(400);
await page.setViewportSize({ width: 400, height: 800 });
await idle(500);
const fit = await page.evaluate(() => { const el = document.querySelector('.mep-modal--route'); return el.scrollWidth <= el.clientWidth; });
check(fit, '7: no horizontal scroll at 400 px');
await shot('T22-limits-narrow');
await page.setViewportSize({ width: 1600, height: 1000 });
await t.finish();
