// T23: the network type editor keeps only the flow unit and the sizing method, through real DOM inputs.
// The editor opens from the Size dialog ("Edit network type..."). Run:
// node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/t23-check.mjs
import { open, buildSizingProject } from './r5-lib.mjs';

const t = await open();
const { page, check, idle, shot } = t;
const Z = '.mep-modal--route';
const M = '.mep-modal';
const q = (id) => page.locator(`${Z} [data-testid=${id}]`);
const f = (id) => page.locator(`${M} [data-testid=${id}]`);
const saveBtn = () => page.locator(`${M} button`, { hasText: /^Save$/ }).first();
const types = () => page.evaluate(() => window.__mepSketchScene.exportProject().networkTypes);
const typeOf = async (id) => (await types()).find((x) => x.id === id);
const hoverTip = async (id) => { await page.locator(`${M} [data-testid=${id}] .mep-infotip`).hover(); await idle(250); };

await t.start();
await t.openPdf();

async function openEditor() {
  await t.openSize();
  await page.locator(Z).waitFor({ timeout: 20000 });
  await idle(500);
  await q('size-edit-type').click();
  await f('nt-flow-unit').waitFor({ timeout: 20000 });
  await idle(400);
}

// 1: the type has no method: the editor shows the flow unit and the method only.
await buildSizingProject(t, { type: 'air' });
await openEditor();
check((await f('nt-flow-unit').count()) === 1 && (await f('nt-sizing-method').count()) === 1, '1: the unit select and the method select show');
const gone = await page.evaluate(() => document.querySelectorAll('[data-testid^="nt-air-"], [data-testid^="nt-water-"], [data-testid="nt-suggest"]').length);
check(gone === 0, '1: no air field, no water field and no suggest button', String(gone));
await shot('T23-editor');
await page.setViewportSize({ width: 400, height: 800 });
await idle(400);
const fit = await page.evaluate(() => { const el = [...document.querySelectorAll('.mep-modal')].pop(); return el.scrollWidth <= el.clientWidth; });
check(fit, '1: no horizontal scroll at 400 px');
await shot('T23-editor-narrow');
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(300);

// 2: dm3/s and Air, Save.
await f('nt-flow-unit').selectOption('dm³/s');
await f('nt-sizing-method').selectOption({ label: 'Air' });
await idle(300);
await hoverTip('nt-limits-note');
check((await f('nt-limits-note').count()) === 1 && /Size dialog/.test(await f('nt-limits-note').innerText()), '2: the note points to the Size dialog');
await page.mouse.move(5, 5);
await idle(200);
await saveBtn().click();
await idle(800);
let type = await typeOf('supply-air');
check(type?.flowUnit === 'dm³/s' && type?.sizingMethod === 'air' && !('sizing' in type), '2: the export holds flowUnit and sizingMethod and no sizing', JSON.stringify(type));
await q('size-close').click();
await idle(300);

// 3: Not sized removes the method (a second project: method set, no unit, so the editor button shows).
await buildSizingProject(t, { type: 'air', sizingMethod: 'air' });
await openEditor();
await f('nt-sizing-method').selectOption({ label: 'Not sized' });
await f('nt-flow-unit').selectOption('l/s');
await saveBtn().click();
await idle(800);
type = await typeOf('supply-air');
check(type?.sizingMethod === undefined && type?.flowUnit === 'l/s', '3: Not sized removes sizingMethod', JSON.stringify(type));
await q('size-close').click();
await idle(300);

// 4: the discipline rule and the thickness save.
await buildSizingProject(t, { type: 'air', sizingMethod: 'air' });
await openEditor();
const disc = page.locator(`${M} .mep-field-row`, { has: page.locator('label', { hasText: /^Discipline$/ }) }).locator('select');
await disc.selectOption('plumbing');
await idle(300);
await hoverTip('nt-discipline-note');
check((await f('nt-discipline-note').count()) === 1 && (await f('nt-sizing-method').inputValue()) === 'none', '4: plumbing shows the discipline note and Not sized');
await page.mouse.move(5, 5);
await idle(200);
await shot('T23-editor-plumbing');
await disc.selectOption('ventilation');
await idle(200);
const thick = page.locator(`${M} .mep-field-row`, { has: page.locator('label', { hasText: /^Thickness/ }) }).locator('input');
await thick.click();
await page.keyboard.press('Control+A');
await page.keyboard.type('3');
await saveBtn().click();
await idle(800);
type = await typeOf('supply-air');
check(type?.lineWidthPt === 3, '4: a visual change still saves', JSON.stringify(type));
await q('size-close').click();
await idle(300);

// 5: the conversion panel.
await buildSizingProject(t, { type: 'air' });
await page.evaluate(() => window.__mepSketchScene.updateNetworkType('supply-air', { flowUnit: 'dm³/s' }));
const caps = () => page.evaluate(() => Object.values(window.__mepSketchScene.exportProject().terminalCapacities).reduce((a, b) => a + b, 0));
const before = await caps();
await openEditor();
await f('nt-flow-unit').selectOption('m³/h');
await saveBtn().click();
await idle(500);
check((await f('nt-convert-panel').count()) === 1, '5: changing the unit with stored capacities shows the conversion panel');
await shot('T23-editor-convert');
await f('nt-convert-yes').click();
await idle(800);
const after = await caps();
check(Math.abs(after - before * 3.6) < 1e-6 * Math.max(1, after), '5: Convert changes the capacities (dm3/s to m3/h)', `${before} -> ${after}`);
type = await typeOf('supply-air');
check(type?.flowUnit === 'm³/h', '5: the type holds the new unit', JSON.stringify(type));

await t.finish();
