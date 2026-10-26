// T18: the "Route area" section of the Route network dialog (show switch, summary, lines, legend, pending note), through real DOM inputs.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/t18-check.mjs
// The scene API is used for setup and for reading state only. Clicks stay inside .mep-modal. No backdrop click.
import { open, setupRooms, screenOf, colorPixelsIn, isPurple, baseline, sameAsBaseline } from './r4-lib.mjs';
const PDF1 = '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf';

const t = await open();
const { page, check, idle } = t;
const R = '.mep-modal--route';
const tid = (id) => page.locator(`[data-testid="${id}"]`);
const flag = () => page.evaluate(() => window.__mepSketchScene.isRouteAreaVisible());
const view = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__mepSketchScene.getRouteArea())));
const openDialog = async () => {
  await t.openRoute();
  await page.locator(R).waitFor({ state: 'visible', timeout: 5000 });
  await idle(500);
};
const closeWithEscape = async () => {
  await page.keyboard.press('Escape');
  await idle(400);
};
const firstInt = (s) => Number((s.match(/\d+/) ?? ['-1'])[0]);

const { rooms, shaftId } = await setupRooms(t, { pdf: PDF1, scale: '50', shaft: true });
check(shaftId !== null && rooms.length > 0, 'setup: rooms and a shaft room exist', `rooms ${rooms.length}, shaft ${shaftId}`);
const base = await baseline(page);
const keysBefore = await page.evaluate(() => Object.keys(localStorage).sort());
const v0 = await view();
check(v0.area.status === 'ok', 'setup: the route area is ok', v0.area.status);
check(!(await flag()), 'the flag is false before the dialog');

// A center node on the canvas, left of where the dialog will be.
const nodes = v0.area.nodes.filter((n) => n.kind !== 'wall' && n.kind !== 'shaft');
let q = null;
for (const n of nodes) {
  const s = await screenOf(page, n.point);
  if (s.x > 60 && s.x < 1100 && s.y > 60 && s.y < 940) { q = s; if (n.kind === 'junction') break; }
}
check(q !== null, 'setup: a center node is left of the dialog area', JSON.stringify(q));
const purpleOff = await colorPixelsIn(page, q, isPurple);
check(purpleOff === 0, 'no purple pixel before the dialog', String(purpleOff));

// Step 6 and 1: open the dialog
await openDialog();
check(await tid('route-area').isVisible(), 'step 1: route-area is visible');
check((await tid('route-body').locator('[data-testid="route-area"]').count()) === 1, 'the section is inside route-body');
check(/equipment stamp/i.test(await page.locator(R).innerText()), 'step 6: the R2 text "Place an equipment stamp first" shows too');
check(await flag(), 'step 1: the flag is true');
const purpleOn = await colorPixelsIn(page, q, isPurple);
check(purpleOn > 0, 'step 1: purple pixels around a center node', String(purpleOn));
check(await tid('route-area-show').isChecked(), 'the show check box is checked');
const types = await page.evaluate(() => window.__mepSketchScene.getRouteAreaRoomTypes());
const expected = await page.evaluate((types) => {
  const s = window.__mepSketchScene;
  return s.listRooms().filter((r) => r.pageIndex === s.getPageIndex() && types.includes(r.roomTypeId)).length;
}, types);
const summary = (await tid('route-area-summary').innerText()).trim();
check(firstInt(summary) === expected && expected === v0.area.rooms.length, 'step 1: summary count equals the independent count', `"${summary}" expected ${expected}`);

// Step 2: the lines
const lineText = async (code) => ((await tid(`route-area-line-${code}`).count()) > 0 ? (await tid(`route-area-line-${code}`).first().innerText()).trim() : null);
const draft = await lineText('draft-2d');
check(draft !== null && (await tid('route-area-line-draft-2d').getAttribute('data-severity')) === 'info', 'step 2: draft-2d line with severity info', String(draft));
check(draft !== null && draft.startsWith('Note') && draft.includes('Draft in 2D. Check height, clashes, clearances and slope yourself.'), 'step 2: draft-2d text starts with Note and holds the sentence', String(draft));
const wall = await lineText('wall-crossings');
const wallCount = v0.area.entries.filter((e) => e.primary && !e.shaft).length + v0.area.links.filter((l) => !l.shaft).length;
check(wall !== null && (await tid('route-area-line-wall-crossings').getAttribute('data-severity')) === 'warning' && wall.startsWith('Warning'), 'step 2: wall-crossings line with Warning', String(wall));
check(wall !== null && firstInt(wall.replace(/^Warning/, '')) === wallCount, 'step 2: the wall-crossings count equals the independent count', `${wall} vs ${wallCount}`);
check((await page.locator(R).innerText()).includes('Check which of these walls are fire walls.'), 'step 2: the fire hint shows');
const allLines = await tid('route-area-lines').innerText();
check(!/door/i.test(allLines) && !/crossing/i.test(allLines), 'step 2: no line holds "door" or "crossing"');
const openRooms = v0.area.rooms.filter((r) => r.open).length;
check((await lineText('open-room')) !== null || openRooms === 0, 'step 2: open-room line shows (open route rooms: ' + openRooms + ')');
const stairRooms = v0.area.rooms.filter((r) => /trap/i.test(r.name ?? ''));
if (stairRooms.length > 0) {
  const st = await lineText('stair-name');
  check(st !== null && st.startsWith('Note'), 'step 2: stair-name line shows with Note', String(st));
} else {
  console.log('NOTE no route-area room name holds "trap": the stair-name line is not checked before step 9');
}
const legend = (await tid('route-area-legend').innerText()).trim();
console.log('legend text:', JSON.stringify(legend));
check(await tid('route-area-legend').locator('.mep-route-area-swatch').count() === 4, 'step 2: the legend has four swatches');
check(legend.includes('Route area') && legend.includes('center line') && legend.includes('possible place for a branch') && legend.includes('shaft place'), 'step 2: the legend holds four labels');
check((await page.locator(R).innerText()).includes('The center line is a guide.'), 'step 2: "The center line is a guide." shows');
await tid('route-area').scrollIntoViewIfNeeded();
await t.shot('T18-section');

// Step 3: the check box
await tid('route-area-show').uncheck();
await idle(500);
check(!(await flag()), 'step 3: the flag is false after the real click');
check((await colorPixelsIn(page, q, isPurple)) === 0, 'step 3: the purple pixels are gone');
await tid('route-area-show').check();
await idle(500);
check(await flag(), 'step 3: the flag is true again');
check((await colorPixelsIn(page, q, isPurple)) > 0, 'step 3: the purple pixels are back');

// Step 4 and 8: close with Escape
await closeWithEscape();
check((await page.locator(R).count()) === 0, 'step 4: the dialog is closed');
check(!(await flag()), 'step 4: the flag is false again');
check((await colorPixelsIn(page, q, isPurple)) === 0, 'step 4: the buffer has no purple again');
check(await sameAsBaseline(page, base), 'step 8: project JSON, canUndo and isDirty are unchanged after the close');
// switch on through the menu first
await t.toggleRouteArea();
await idle(500);
check(await flag(), 'step 4: the menu switch sets the flag');
await openDialog();
check(await tid('route-area-show').isChecked(), 'step 4: the check box is checked when the flag was true before');
await closeWithEscape();
check(await flag(), 'step 4: the flag stays true after the close');
await t.toggleRouteArea();
await idle(500);
check(!(await flag()), 'step 4: the menu switch resets the flag');
check(await sameAsBaseline(page, base), 'step 8: project JSON, canUndo and isDirty equal after the menu round');
const keysAfter = await page.evaluate(() => Object.keys(localStorage).sort());
console.log('localStorage keys before:', keysBefore.join(','), '| after:', keysAfter.join(','));

// Step 9: the pending note (setup use of the scene API; the project changes after this point)
await openDialog();
const target = await page.evaluate(() => {
  const s = window.__mepSketchScene;
  const r = s.listRooms().find((x) => x.roomTypeId !== 'corridor' && x.roomTypeId !== 'shaft');
  return r ? r.id : null;
});
check(target !== null, 'step 9: a room to change exists');
await page.evaluate((id) => window.__mepSketchScene.setRoomType([id], 'corridor'), target);
let shown = true;
const tPending = Date.now();
try { await tid('route-area-calculating').waitFor({ state: 'visible', timeout: 1000 }); } catch { shown = false; }
const shownAfter = Date.now() - tPending;
check(shown, 'step 9: route-area-calculating shows (plan: within 100 ms; measured value printed)', `${shownAfter} ms after the call`);
await idle(2500);
check((await tid('route-area-calculating').count()) === 0, 'step 9: the note is gone after 2.5 s');
const v1 = await view();
const summary1 = (await tid('route-area-summary').innerText()).trim();
check(firstInt(summary1) === v1.area.rooms.length && v1.area.rooms.length === expected + 1, 'step 9: the summary matches getRouteArea() after the change', `"${summary1}" rooms ${v1.area.rooms.length} before ${expected}`);
const wall1 = await lineText('wall-crossings');
const wallCount1 = v1.area.entries.filter((e) => e.primary && !e.shaft).length + v1.area.links.filter((l) => !l.shaft).length;
check(wall1 === null ? wallCount1 === 0 : firstInt(wall1.replace(/^Warning/, '')) === wallCount1, 'step 9: the wall-crossings line matches getRouteArea()', `${wall1} vs ${wallCount1}`);

const stairAfter = await lineText('stair-name');
const stairNow = (await view()).area.rooms.some((r) => /trap/i.test(r.name ?? ''));
check(stairNow === (stairAfter !== null), 'step 9: the stair-name line matches the route-area room names', String(stairAfter));

// Narrow width, English: no horizontal overflow
await page.setViewportSize({ width: 400, height: 900 });
await idle(500);
await tid('route-area').scrollIntoViewIfNeeded();
const dims = await page.evaluate(() => {
  const m = document.querySelector('.mep-modal--route');
  return { scrollWidth: m.scrollWidth, clientWidth: m.clientWidth };
});
check(dims.scrollWidth <= dims.clientWidth, 'narrow 400 px: scrollWidth <= clientWidth of .mep-modal--route', JSON.stringify(dims));
await tid('route-area-legend').scrollIntoViewIfNeeded();
await t.shot('T18-section-narrow');
await closeWithEscape();
check(t.errors.length === 0, 'no page error', JSON.stringify(t.errors));
await t.finish();
