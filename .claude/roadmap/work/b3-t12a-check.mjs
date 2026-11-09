// B3-T12a: levels sit in order of elevation, buildings sit in alphabetical order, no Move or Sort buttons. Empty profile, real clicks and typing.
// Web stand-in: the dev store holds ONE building file. A switch between buildings first puts the target's JSON into the store (store.load), then clicks the tree item once.
import { open } from '../browser/lib.mjs';

const t = await open();
const { page, check, shot, idle, menu } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const items = (kind) => dlg.locator(`[role="treeitem"][data-kind="${kind}"]`);
const readStore = () => page.evaluate(async () => (await window.__mepBuilding.read()).json);
const loadStore = (json) => page.evaluate((j) => window.__mepBuilding.store.load(j), json);
const labels = async (kind) => (await items(kind).locator('.mep-tree-label').allInnerTexts()).map((text) => text.trim());
const selectedLevelName = () => dlg.locator('input[aria-label="Level name"]').inputValue();

async function buildingMenu(item) {
  await dlg.locator('button.mep-menu-btn').click();
  await dlg.locator('[role="menuitem"]', { hasText: item }).click();
  await idle(300);
}
async function addLevel(name, elevation) {
  await dlg.locator('[data-testid="tree-add-level"]').click();
  await idle(400);
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  await idle(300);
  const elev = dlg.locator('input[aria-label="Elevation (mm)"]');
  await elev.fill(String(elevation));
  await elev.press('Enter');
  await idle(500);
}
async function newBuilding(name, first) {
  if (first) await dlg.locator('button', { hasText: /^New building$/ }).click();
  else await buildingMenu('New building…');
  const nameIn = dlg.locator('input[aria-label="Building name"]');
  await nameIn.fill(name);
  await nameIn.press('Enter');
  await dlg.locator('.mep-buildings-open-name', { hasText: name }).waitFor({ timeout: 8000 });
  await idle(500);
}

await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(700);

// Levels: added in the order 10 m, 0 m, 5 m.
await newBuilding('Zeta', true);
await addLevel('Ten', 10000);
await addLevel('Zero', 0);
await addLevel('Five', 5000);
let names = await labels('level');
check(JSON.stringify(names) === JSON.stringify(['Zero', 'Five', 'Ten']), 'levels added as 10 m, 0 m, 5 m show 0, 5, 10', JSON.stringify(names));
check((await selectedLevelName()) === 'Five', 'the selection stays on the level that was just edited', await selectedLevelName());
let stored = JSON.parse(await readStore());
check(JSON.stringify(stored.levels.map((l) => l.elevationMm)) === JSON.stringify([0, 5000, 10000]), 'the stored file lists the levels by elevation', JSON.stringify(stored.levels.map((l) => l.elevationMm)));
await shot('b3-t12a-1');

// An elevation change re-sorts at once and keeps the selection on the same level.
const elev = dlg.locator('input[aria-label="Elevation (mm)"]');
await elev.fill('20000');
await elev.press('Enter');
await idle(500);
names = await labels('level');
check(JSON.stringify(names) === JSON.stringify(['Zero', 'Ten', 'Five']), 'Five moved to 20 m: the tree re-sorts at once', JSON.stringify(names));
check((await selectedLevelName()) === 'Five', 'the selection stays on Five after the re-sort', await selectedLevelName());
check((await dlg.locator('[role="treeitem"][data-kind="level"][aria-selected="true"]').innerText()).startsWith('Five'), 'the selected tree row is Five');

// Equal elevation: sort by name, ignoring case.
await elev.fill('0');
await elev.press('Enter');
await idle(500);
names = await labels('level');
check(JSON.stringify(names) === JSON.stringify(['Five', 'Zero', 'Ten']), 'equal elevation sorts by name', JSON.stringify(names));

// No Move or Sort buttons.
const moveSort = await dlg.locator('button, [role="button"]').evaluateAll((els) =>
  els.filter((el) => /move (level )?(up|down)|sort by elevation/i.test(`${el.textContent} ${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''}`)).length);
check(moveSort === 0, 'no Move up, Move down or Sort by elevation button', String(moveSort));
check((await dlg.getByText('Level order').count()) === 0, 'no Level order heading');
await shot('b3-t12a-2');
const zetaJson = await readStore();

// Buildings: Zeta, alpha, Mid stay alphabetical after selecting each.
await newBuilding('alpha', false);
const alphaJson = await readStore();
await newBuilding('Mid', false);
const midJson = await readStore();
const order = ['alpha', 'Mid', 'Zeta'];
names = await labels('building');
check(JSON.stringify(names) === JSON.stringify(order), 'buildings Zeta, alpha, Mid show alphabetically', JSON.stringify(names));
for (const [name, json] of [['Zeta', zetaJson], ['alpha', alphaJson], ['Mid', midJson], ['Zeta', zetaJson]]) {
  await loadStore(json);
  await items('building').filter({ hasText: name }).click();
  await dlg.locator('.mep-buildings-open-name', { hasText: name }).waitFor({ timeout: 8000 });
  await idle(500);
  names = await labels('building');
  check(JSON.stringify(names) === JSON.stringify(order), `after selecting ${name} the order is unchanged`, JSON.stringify(names));
}
names = await labels('level');
check(JSON.stringify(names) === JSON.stringify(['Five', 'Zero', 'Ten']), 'Zeta reopens with its levels in order', JSON.stringify(names));

await t.finish();
