// B8-T08 (third run): the editor is used with no building open, then the building is opened (D-B-130 B).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t08-check-c.mjs
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, marksOf, waitMarks } from './b8-t05-lib.mjs';

const M = '.mep-modal';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
const cfg = { withReturn: false, sources1: [0], sources2: [], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
// no building is open now; the shown document is l2.pdf
async function openEditor(name) {
  await page.locator('.mep-dock-tab-label', { hasText: /^MEP$/ }).click();
  await page.locator('button.mep-stamps-subtab-btn', { hasText: 'Network Types' }).click();
  await page.locator('.mep-discipline-btn', { hasText: /^HVAC$/ }).first().click();
  await idle(300);
  await page.locator('.mep-networktype-tile', { hasText: new RegExp(`^\\s*${name}\\s*`) }).first().locator('button[title="Edit"]').click();
  await page.locator(M).waitFor({ timeout: 20000 });
  await idle(250);
}
const docType = () => page.evaluate(() => window.__mepSketchScene.exportProject().networkTypes.find((x) => x.id === 'supply-air')?.flowSense ?? null);
await openEditor('Supply Air');
await page.locator(`${M} [data-testid=nt-flow-sense]`).selectOption('return');
await page.locator(M).getByRole('button', { name: /^Save$/ }).first().click();
await idle(500);
check((await docType()) === 'return', 'no building open: the document of Level 2 now holds Return for Supply Air', String(await docType()));
await loadBuilding(t, buildingJson(uuids, anchors, { withReturn: false }));
const exp = async (name, expected, what) => {
  const r = await waitMarks(page, expected, 4000);
  check(r.ok, `${name}: ${what}`, JSON.stringify(r.got));
};
await exp('building opened, level 2', { rf: '3' }, 'the ring uses the old copy of the riser (Supply): pictogram 3, not 6');
await switchTo(t, 'l0.pdf');
await exp('building opened, level 0', { rf: '2' }, 'level 0: pictogram 2 (Supply)');
await switchTo(t, 'l2.pdf');
// the editor with the building open, Save with no change
await openEditor('Supply Air');
check((await page.locator(`${M} [data-testid=nt-flow-sense]`).inputValue()) === 'return', 'the editor on Level 2 shows Return');
await page.locator(M).getByRole('button', { name: /^Save$/ }).first().click();
await idle(600);
await exp('saved again with the building open, level 2', { rf: '6' }, 'after Save with the building open the ring follows Return: pictogram 6');
await switchTo(t, 'l0.pdf');
await exp('saved again, level 0', { rf: '5' }, 'level 0 follows too: pictogram 5');
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
