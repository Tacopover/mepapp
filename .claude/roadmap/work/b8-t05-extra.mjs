// B8-T05 extra probes: (a) names of 80 characters for levels and risers, (b) what the other open drawing shows after a type edit (D-B-130, accepted: described for the user).
// Usage: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t05-extra.mjs <width>
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, marksOf, waitMarks, applyLevel, screenOf, focusRings } from './b8-t05-lib.mjs';

const width = Number(process.argv[2] ?? 1600);
const height = width === 1600 ? 1000 : 900;
const tag = `w${width}`;
const t = await open({ width, height, seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, shot } = t;
await t.start();
const cfg = { withReturn: true, sources1: [0], sources2: [0], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
const long = (s) => (s + ' ' + 'long name segment '.repeat(6)).slice(0, 80);
const json = JSON.parse(buildingJson(uuids, anchors, { withReturn: true }));
json.levels.forEach((l, i) => { l.name = long(`Level ${i}`); });
json.risers.forEach((r, i) => { r.name = long(`Riser R${i + 1}`); });
console.log('names', json.levels[0].name.length, json.risers[0].name.length);
await loadBuilding(t, JSON.stringify(json));
await applyLevel(t, 0, cfg);
await applyLevel(t, 1, cfg);
await switchTo(t, 'l1.pdf');
const r = await waitMarks(page, { rf: '1', rf2: '4' }, 4000);
check(r.ok, 'long names: arrows show on level 1 (1 and 4)', JSON.stringify(r.got));
// select the ring (real click) so the label and the Properties panel show
await page.locator('button.mep-rail-btn[title="Select"]').click();
await focusRings(page);
const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
const at = await screenOf(page, { x: 300, y: H - 300 });
await page.mouse.click(at.x, at.y);
await idle(600);
await shot(`B8-T05-journey-${tag}-extra-long-names-selected`);
await page.mouse.move(at.x + 5, at.y + 5);
await idle(300);
await shot(`B8-T05-journey-${tag}-extra-long-names-hover`);
const sw = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
check(sw, 'long names: no horizontal page scroll');

// (b) type edit on level 1 flips only the open drawing; what does level 0 show?
async function flip(value) {
  await page.locator('.mep-dock-tab-label', { hasText: /^MEP$/ }).click();
  await page.locator('button.mep-stamps-subtab-btn', { hasText: 'Network Types' }).click();
  await page.locator('.mep-discipline-btn', { hasText: 'HVAC' }).first().click();
  await idle(400);
  await page.locator('.mep-networktype-tile', { hasText: /^\s*Supply Air\s*/ }).first().locator('button[title="Edit"]').click();
  await page.locator('.mep-modal').waitFor({ timeout: 20000 });
  await page.locator('.mep-modal .mep-field-row', { hasText: /^\s*Flow direction/i }).locator('select').selectOption({ label: value });
  await page.locator('.mep-modal').getByRole('button', { name: /^Save$/ }).first().click();
  await idle(900);
}
await flip('Return');
const l1 = await marksOf(page);
console.log('INFO editor on level 1 set Return: level 1 shows', JSON.stringify(l1.rf?.arrows));
await shot(`B8-T05-journey-${tag}-extra-flip-on-l1`);
await switchTo(t, 'l0.pdf');
await page.waitForTimeout(800);
const l0 = await marksOf(page);
console.log('INFO then level 0 (own copy of type, still Supply) shows', JSON.stringify(l0.rf?.arrows));
await shot(`B8-T05-journey-${tag}-extra-other-drawing-l0`);
await switchTo(t, 'l1.pdf');
await page.waitForTimeout(800);
console.log('INFO back on level 1 shows', JSON.stringify((await marksOf(page)).rf?.arrows));
await t.finish();
