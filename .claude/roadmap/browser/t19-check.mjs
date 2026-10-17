// T19: the room type list control of the "Route area" section, through real clicks and selectOption.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/t19-check.mjs
// The scene API is used for setup and for reading state only. Clicks stay inside .mep-modal. No backdrop click.
import { open, setupRooms, screenOf, clipPixels, colorPixelsIn, isPurple, isTeal, baseline, sameAsBaseline } from './r4-lib.mjs';

const PDF1 = '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf';

const KEY = 'mepapp.routeRoomTypes.v1';
const t = await open();
const { page, check, idle } = t;
const R = '.mep-modal--route';
const tid = (id) => page.locator(`[data-testid="${id}"]`);
const view = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__mepSketchScene.getRouteArea())));
const stored = () => page.evaluate((k) => localStorage.getItem(k), KEY);
const sceneTypes = () => page.evaluate(() => window.__mepSketchScene.getRouteAreaRoomTypes());
// The chips follow the library order; the check compares them sorted. The stored list keeps the order of adding.
const chipIds = async () => (await tid('route-area-type').evaluateAll((els) => els.map((e) => e.getAttribute('data-type-id')))).sort();
const firstInt = (s) => Number((s.match(/\d+/) ?? ['-1'])[0]);
const lineCount = (code) => tid(`route-area-line-${code}`).count();

const { rooms, shaftId } = await setupRooms(t, { pdf: PDF1, scale: '50', shaft: true });
check(shaftId !== null, 'setup: a shaft room exists', String(shaftId));
// Setup: one ordinary room becomes an office, on the canvas and left of the dialog.
const officeId = await (async () => {
  const cand = await page.evaluate(() => {
    const s = window.__mepSketchScene;
    return s.listRooms().filter((r) => r.roomTypeId !== 'corridor' && r.roomTypeId !== 'shaft')
      .map((r) => {
        const o = r.polygon.outer;
        const c = o.reduce((a, p) => ({ x: a.x + p.x / o.length, y: a.y + p.y / o.length }), { x: 0, y: 0 });
        return { id: r.id, c };
      });
  });
  for (const c of cand) {
    const s = await screenOf(page, c.c);
    if (s.x > 80 && s.x < 1080 && s.y > 80 && s.y < 920) { c.s = s; return c; }
  }
  return null;
})();
check(officeId !== null, 'setup: a room for the office type is on the canvas');
await page.evaluate((id) => window.__mepSketchScene.setRoomType([id.id], 'office'), officeId);
await idle(600);
const officeScreen = officeId.s;
const base = await baseline(page);

await page.locator('button.mep-menu-btn').click();
await page.locator('button.mep-menu-item', { hasText: /^\s*Route network…\s*$/ }).click();
await page.locator(R).waitFor({ state: 'visible', timeout: 5000 });
await idle(600);

// Step 1
let ids = await chipIds();
check(JSON.stringify(ids) === '["corridor","shaft"]', 'step 1: the chips are Corridor and Shaft', JSON.stringify(ids));
const chipTexts = await tid('route-area-type').allInnerTexts();
console.log('chip texts:', JSON.stringify(chipTexts));
check(chipTexts.some((x) => /Corridor/.test(x)) && chipTexts.some((x) => /Shaft/.test(x)), 'step 1: the chip labels read Corridor and Shaft');
check(((await tid('route-area-types-hint').innerText()).trim()) === 'Entrance and hall can carry a main.', 'step 1: the types hint shows');
const nCount = async () => firstInt((await tid('route-area-summary').innerText()).trim());
const countOf = (types) => page.evaluate((types) => {
  const s = window.__mepSketchScene;
  return s.listRooms().filter((r) => r.pageIndex === s.getPageIndex() && types.includes(r.roomTypeId)).length;
}, types);
check((await nCount()) === (await countOf(['corridor', 'shaft'])), 'step 1: the summary counts corridor and shaft rooms');

// Step 2: add Office with selectOption
const before = await clipPixels(page, officeScreen);
const tealBefore = await colorPixelsIn(page, officeScreen, isTeal);
await tid('route-area-add').selectOption({ label: 'Office' });
await idle(700);
ids = await chipIds();
check(JSON.stringify(ids) === '["corridor","office","shaft"]', 'step 2: a chip Office appears', JSON.stringify(ids));
check((await stored()) === '["corridor","shaft","office"]', 'step 2: localStorage holds the three ids', String(await stored()));
check(JSON.stringify(await sceneTypes()) === '["corridor","shaft","office"]', 'step 2: the scene list holds the three ids');
check((await nCount()) === (await countOf(['corridor', 'shaft', 'office'])), 'step 2: the summary counts corridor, shaft and office rooms', await tid('route-area-summary').innerText());
const after = await clipPixels(page, officeScreen);
const tealAfter = await colorPixelsIn(page, officeScreen, isTeal);
check(JSON.stringify(after) !== JSON.stringify(before), 'step 2: the overlay around the office changed', `teal ${tealBefore} -> ${tealAfter}`);
await tid('route-area').scrollIntoViewIfNeeded();
await t.shot('T19-types');

// Step 3: remove Office with a real click
const removeOffice = page.locator('[data-testid="route-area-type"][data-type-id="office"] [data-testid="route-area-remove"]');
check((await removeOffice.getAttribute('aria-label')) === 'Remove Office', 'step 3: the remove button has the label "Remove Office"', String(await removeOffice.getAttribute('aria-label')));
await removeOffice.click();
await idle(700);
check(JSON.stringify(await chipIds()) === '["corridor","shaft"]', 'step 3: the chip is gone');
check((await stored()) === '["corridor","shaft"]', 'step 3: localStorage is back', String(await stored()));
check((await nCount()) === (await countOf(['corridor', 'shaft'])), 'step 3: the count is back');
check(JSON.stringify(await clipPixels(page, officeScreen)) === JSON.stringify(before), 'step 3: the overlay is back to the first buffer');

// Step 4: remove both chips
await page.locator('[data-testid="route-area-type"][data-type-id="corridor"] [data-testid="route-area-remove"]').click();
await idle(500);
await page.locator('[data-testid="route-area-type"][data-type-id="shaft"] [data-testid="route-area-remove"]').click();
await idle(700);
check((await chipIds()).length === 0, 'step 4: no chip is left');
check((await stored()) === '[]', 'step 4: localStorage holds []', String(await stored()));
const noTypes = tid('route-area-line-no-types');
check((await noTypes.count()) === 1 && (await noTypes.getAttribute('data-severity')) === 'warning' && (await noTypes.innerText()).startsWith('Warning'), 'step 4: the no-types line shows with Warning');
check((await colorPixelsIn(page, officeScreen, isPurple)) === 0 && (await colorPixelsIn(page, officeScreen, isTeal)) === 0, 'step 4: the overlay shows nothing');
await tid('route-area-reset').click();
await idle(700);
check(JSON.stringify(await chipIds()) === '["corridor","shaft"]', 'step 4: reset brings Corridor and Shaft back', JSON.stringify(await chipIds()));
check((await stored()) === '["corridor","shaft"]', 'step 4: localStorage holds the default list');
check((await lineCount('no-types')) === 0, 'step 4: the no-types line is gone');

// Step 5: remove Corridor only
await page.locator('[data-testid="route-area-type"][data-type-id="corridor"] [data-testid="route-area-remove"]').click();
await idle(700);
const v = await view();
const codes = v.warnings.map((w) => w.code);
console.log('step 5: status', v.area.status, 'codes', JSON.stringify(codes));
let ok5 = true;
for (const code of ['no-route-rooms', 'no-types', 'wall-crossings', 'shaft-crossing', 'open-room', 'parts', 'unreached', 'draft-2d']) {
  const expectedLines = codes.includes(code) ? 1 : 0;
  const n = await lineCount(code);
  if (code === 'shaft-crossing' ? (n >= 1) !== codes.includes(code) : n !== expectedLines && !(code === 'stair-name')) ok5 = false;
}
check(ok5, 'step 5: the lines match getRouteArea()', JSON.stringify(codes));
check(JSON.stringify(await chipIds()) === '["shaft"]', 'step 5: only the Shaft chip is left');
await tid('route-area-reset').click();
await idle(600);

// Narrow width, English
await page.setViewportSize({ width: 400, height: 900 });
await idle(500);
await tid('route-area').scrollIntoViewIfNeeded();
const dims = await page.evaluate(() => {
  const m = document.querySelector('.mep-modal--route');
  return { scrollWidth: m.scrollWidth, clientWidth: m.clientWidth };
});
check(dims.scrollWidth <= dims.clientWidth, 'narrow 400 px: scrollWidth <= clientWidth of .mep-modal--route', JSON.stringify(dims));
await tid('route-area-legend').scrollIntoViewIfNeeded();
await t.shot('T19-types-narrow');
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(400);

// Step 7: close, state equal
await page.keyboard.press('Escape');
await idle(500);
check((await page.locator(R).count()) === 0, 'step 7: the dialog is closed');
check(await sameAsBaseline(page, base), 'step 7: project JSON, canUndo and isDirty are unchanged after the close');
check((await stored()) === '["corridor","shaft"]', 'step 7: the stored list is the default list');
await t.finish();
