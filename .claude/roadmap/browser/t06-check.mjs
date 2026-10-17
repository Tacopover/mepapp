// T06b: the cascade over a port group and the group toggle, through real DOM inputs.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/t06-check.mjs
import { open, buildMixedGroupProject, screenOf, networkCountText, segmentTypes } from './r3-lib.mjs';

const t = await open();
const { page, check, idle } = t;
const rail = (title) => page.locator(`button.mep-rail-btn[title="${title}"]`).first();
const typeSelect = () => page.locator('.mep-field-row', { hasText: 'Network Type' }).locator('select').first();
const flowCount = () => page.evaluate(() => (window.__mepSketchScene.getFlowResult() ?? []).length);
const clickSeg = async (point, shift = false) => {
  if (!shift) {
    await page.mouse.click(110, 150);
    await idle(300);
  }
  const q = await screenOf(page, point);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(q.x, q.y);
  if (shift) await page.keyboard.up('Shift');
  await idle(400);
};
const clickStamp = async (pos) => {
  await page.mouse.click(110, 150);
  await idle(300);
  const q = await screenOf(page, pos);
  await page.mouse.click(q.x, q.y);
  await idle(400);
};
const linked = (name) => page.locator('label.mep-checkbox-row', { hasText: name }).locator('input[type=checkbox]');

await t.start();
await t.openPdf();

// Step 0: the group toggle (A4).
let b = await buildMixedGroupProject(t, 'group');
await rail('Select').click();
await clickStamp(b.aPos);
check((await networkCountText(page)) === '1 network', 'group setup: the status bar says 1 network', await networkCountText(page));
const f0 = await flowCount();
await linked('Return in').waitFor({ timeout: 10000 });
await linked('Return in').click();
await idle(400);
check((await networkCountText(page)) === '2 networks', 'unchecking a group port: 2 networks at once', await networkCountText(page));
const f1 = await flowCount();
check(f1 === 2, 'getFlowResult has 2 results after the uncheck', `${f0} -> ${f1}`);
await linked('Return in').click();
await idle(400);
check((await networkCountText(page)) === '1 network', 'checking the port again: 1 network', await networkCountText(page));
check((await flowCount()) === 1, 'getFlowResult has 1 result after the check', String(await flowCount()));

// Step 1: the mixed setup.
b = await buildMixedGroupProject(t, 'mixed');
let types = await segmentTypes(page);
check(b.supplySegmentIds.every((id) => types[id] === 'supply-air') && b.returnSegmentIds.every((id) => types[id] === 'return-air'), 'mixed setup: segment types as built', JSON.stringify(types));
check((await networkCountText(page)) === '2 networks', 'mixed setup: 2 networks', await networkCountText(page));
await rail('Select').click();
await t.shot('T06-two-networks');

// Step 2: select a supply segment, change the type with the real select.
await clickSeg(b.clickPoints['segment-2']);
check((await typeSelect().count()) > 0, 'Properties shows the Network Type select');
await typeSelect().selectOption({ label: 'Heating Water' });
await idle(600);
types = await segmentTypes(page);
check(b.supplySegmentIds.every((id) => types[id] === 'heating-water'), 'all supply segments are heating-water', JSON.stringify(types));
check(b.returnSegmentIds.every((id) => types[id] === 'return-air'), 'return segments stay return-air', JSON.stringify(types));

// Step 3: adopted, and not the default colour.
const adopted = await page.evaluate(() => window.__mepSketchScene.getNetworkTypes().map((x) => x.id));
check(adopted.includes('heating-water'), 'heating-water is adopted', JSON.stringify(adopted));
check((await networkCountText(page)) === '2 networks', 'still 2 networks', await networkCountText(page));
await t.shot('T06-after-cascade');

// Step 4: the return network to heating-water: the networks join at the group.
await clickSeg(b.clickPoints['segment-4']);
await typeSelect().selectOption({ label: 'Heating Water' });
await idle(600);
types = await segmentTypes(page);
check(Object.values(types).every((x) => x === 'heating-water'), 'all segments are heating-water', JSON.stringify(types));
check((await networkCountText(page)) === '1 network', 'step 4: 1 network', await networkCountText(page));

// Step 5: Undo twice.
await rail('Undo').click();
await idle(500);
types = await segmentTypes(page);
check(b.returnSegmentIds.every((id) => types[id] === 'return-air') && (await networkCountText(page)) === '2 networks', 'Undo gives step 4 back (2 networks)', `${await networkCountText(page)} ${JSON.stringify(types)}`);
await rail('Undo').click();
await idle(500);
types = await segmentTypes(page);
check(b.supplySegmentIds.every((id) => types[id] === 'supply-air') && b.returnSegmentIds.every((id) => types[id] === 'return-air'), 'second Undo gives step 2 back', JSON.stringify(types));

// Step 6: multi-select one segment of each network, change the type.
await clickSeg(b.clickPoints['segment-2']);
await clickSeg(b.clickPoints['segment-4'], true);
await typeSelect().selectOption({ label: 'Heating Water' });
await idle(600);
types = await segmentTypes(page);
check(Object.values(types).every((x) => x === 'heating-water'), 'multi-select: both networks change', JSON.stringify(types));

await t.finish();
