// P3 of auto-routing.md: the routing target in step 1 of the guide (the default of the demand type, "Use …", a type
// that is only in the drawing, one target for each port), Auto-place writes the targets and adopts the types, the
// note for moved stamps with another target, and the copy of a drawing-only type in another drawing.
import { open, D, SP } from './lib.mjs';

const t = await open();
const { page, check, idle, nav } = t;
const step = (n) => page.locator(`${nav} .mep-autoplace-substeps .mep-guide-step[data-step="${n}"]`);
const project = () => page.evaluate(() => window.__mepSketchScene.exportProject());
const rules = () => page.evaluate(() => JSON.parse(localStorage.getItem('mepapp.placementRules.v1') ?? 'null'));
const supplyRule = async () => (await rules()).find((r) => r.id === 'example-supply-air');
const routing = page.locator('#pg-routing');
const text = (testid) => page.locator(`${D} [data-testid=${testid}]`).innerText();
const rail = (title) => page.locator(`button.mep-rail-btn[title="${title}"]`).first();
const screenOf = (id) =>
  page.evaluate((id) => {
    const s = window.__mepSketchScene;
    const st = s.exportProject().stamps.find((x) => x.id === id);
    const g = s.world.toGlobal(st.transform.position);
    const r = s.app.canvas.getBoundingClientRect();
    return { x: r.left + g.x, y: r.top + g.y };
  }, id);
async function chooseStamp(search, equipment = false) {
  await page.locator(`${D} [data-testid=pg-stamp] button`, { hasText: /^Choose…$/ }).click();
  const picker = page.getByRole('dialog', { name: 'Stamp for the rule' });
  await picker.locator('[aria-label="Discipline"] >> text=All').click();
  if (equipment) await picker.locator('button[title="Switch to Equipment"]').click();
  await picker.locator('input[aria-label="Search stamps"]').click();
  await page.keyboard.type(search);
  await idle(400);
  const tile = picker.locator('.mep-stamp-tile').first();
  const name = (await tile.innerText()).trim();
  await tile.click();
  await idle(1000);
  return name;
}
async function placeRule() {
  await step(6).click();
  await idle(2500);
  await page.locator('#pg-place').click();
  await page.locator(`${D} [data-testid=pg-placed]`).waitFor({ timeout: 120000 });
  await idle(500);
}
async function setup(name) {
  await t.openPdf(undefined, name);
  await t.openAutoPlace();
  await t.detect();
  await page.locator(`${nav} button[data-item="types"]`).click();
  await idle();
  await page.locator(`${D} [role=tab]`, { hasText: 'Room type library' }).click();
  await idle();
  await page.locator(`${D} [data-testid=rt-fill-all]`).click();
  await idle();
  await page.locator(`${nav} button[data-rule="example-supply-air"]`).click();
  await idle(600);
  await step(1).click();
  await idle(600);
}

await t.start();
await setup('drawing.pdf');

// ---------- The default of the demand type ----------
check((await routing.inputValue()) === 'supply-air', 'step 1: the example supply air rule has the routing target Supply Air');
check(/default for Supply air/.test(await text('pg-routing-default')), 'step 1: the tag says that it is the default for Supply air');
check((await text('pg-routing-gets')) === 'Each placed stamp gets: Supply Air', 'step 1: each placed stamp gets Supply Air', await text('pg-routing-gets'));
await page.locator('#pg-serves').selectOption('need:returnAir');
await idle(300);
check((await routing.inputValue()) === 'return-air', 'another demand type moves the default: Return air gives Return Air');
await page.locator('#pg-serves').selectOption('need:light');
await idle(300);
check((await routing.inputValue()) === '' && /no routing target/.test(await text('pg-routing-gets')), 'Light has no default: None, and the stamp gets no routing target');
await page.locator('#pg-serves').selectOption('need:supplyAir');
await idle(300);
check((await routing.inputValue()) === 'supply-air', 'back to Supply air gives Supply Air again');
await routing.selectOption('exhaust-air');
await idle(300);
const usual = await text('pg-routing-default');
check(/Supply air usually goes to Supply Air\./.test(usual), 'a choice of the user: the note says what Supply air usually goes to', usual);
await page.locator('#pg-serves').selectOption('need:returnAir');
await idle(300);
check((await routing.inputValue()) === 'exhaust-air', 'a choice of the user stays when the demand type changes');
await page.locator('#pg-serves').selectOption('need:supplyAir');
await idle(300);
await page.locator('#pg-routing-use-default').click();
await idle(300);
check((await routing.inputValue()) === 'supply-air', '"Use Supply Air" sets the default');
await idle(800);
check((await supplyRule()).routingTarget === 'supply-air', 'the stored rule has the routing target');

// ---------- A type that is only in the drawing ----------
const copyId = await page.evaluate(() => window.__mepSketchScene.duplicateNetworkType(window.__mepSketchScene.getNetworkTypes()[0].id).id);
await idle(500);
const copyName = (await project()).networkTypes.find((n) => n.id === copyId).name;
check((await routing.locator(`option[value="${copyId}"]`).count()) === 1, `the list offers the type of the drawing (${copyName})`);
await routing.selectOption(copyId);
await idle(1000);
check(new RegExp(`${copyName} is only in this drawing\\. The rule keeps a copy`).test(await text('pg-routing-copy')), 'the note says that the rule keeps a copy');
const stored = await supplyRule();
check(stored.routingTarget === copyId && stored.networkTypeCopies?.[0]?.id === copyId && stored.networkTypeCopies[0].name === copyName, 'the stored rule holds the copy of the type', JSON.stringify(stored.networkTypeCopies));
await page.screenshot({ path: `${SP}/p3-copy.png` });

// ---------- Auto-place writes the targets ----------
const stampName = await chooseStamp('flow arrow supply');
await placeRule();
let placed = (await project()).stamps.filter((s) => s.autoPlaced);
const portOf = (s) => (s.ports.length > 0 ? s.ports[0].id : '__center__');
check(placed.length > 0 && placed.every((s) => s.routingTargets?.[portOf(s)] === copyId), `Auto-place gives each ${stampName} the routing target ${copyName}`, JSON.stringify(placed[0]?.routingTargets));

// ---------- One routing target for each port ----------
await step(1).click();
await idle(600);
const fcuName = await chooseStamp('fan coil', true);
check((await page.locator('#pg-routing-perport').count()) === 1, `a stamp with 3 ports (${fcuName}) offers a routing target for each port`);
await page.locator('#pg-routing').selectOption('supply-air');
await idle(300);
await page.locator('#pg-routing-perport').check();
await idle(300);
check((await page.locator('#pg-routing').count()) === 0 && (await page.locator('[id^=pg-routing-port-]').count()) === 3, 'the check box shows one row for each port');
check((await page.locator('#pg-routing-port-0').inputValue()) === 'supply-air' && (await page.locator('#pg-routing-port-1').inputValue()) === 'supply-air', 'each row starts with the target of the rule');
await page.locator('#pg-routing-port-1').selectOption('heating-water');
await page.locator('#pg-routing-port-2').selectOption('');
await idle(300);
const gets = await text('pg-routing-gets');
check(/Center → Supply Air, Port 2 → Heating Water$/.test(gets), 'each placed stamp gets Supply Air at Center and Heating Water at Port 2', gets);
await page.screenshot({ path: `${SP}/p3-perport.png` });
await idle(800);
const perPortRule = await supplyRule();
check(perPortRule.portRoutingTargets && Object.values(perPortRule.portRoutingTargets).filter((v) => v === null).length === 1, 'the stored rule has a null for the port without a target', JSON.stringify(perPortRule.portRoutingTargets));
check(!perPortRule.networkTypeCopies, 'the rule drops the copy that it no longer names');
const before = (await project()).networkTypes.map((n) => n.id);
await placeRule();
placed = (await project()).stamps.filter((s) => s.autoPlaced);
const fcu = placed[0];
const [center, p2, p3] = fcu.ports.map((p) => p.id);
check(placed.every((s) => s.ports.length === 3 && JSON.stringify(s.routingTargets) === JSON.stringify({ [center]: 'supply-air', [p2]: 'heating-water' })), 'Auto-place gives each fan coil unit the target of each port', JSON.stringify(fcu.routingTargets));
check(!before.includes('heating-water') && (await project()).networkTypes.some((n) => n.id === 'heating-water'), 'the drawing adopts Heating Water at Auto-place');

// ---------- A moved stamp with another target ----------
await page.keyboard.press('Escape');
await idle(800);
await rail('Select').click();
await page.mouse.click(110, 150);
await idle(300);
const visible = [];
for (const s of placed) {
  const q = await screenOf(s.id);
  if (q.x > 120 && q.x < 1050 && q.y > 120 && q.y < 900) visible.push({ s, d: Math.hypot(q.x - 600, q.y - 500) });
}
visible.sort((m, n) => m.d - n.d);
const moved = visible[0].s;
const q = await screenOf(moved.id);
await page.mouse.click(q.x, q.y);
await idle(600);
const labels = await page.locator('[data-testid=routing-section] .mep-field-row label').allInnerTexts();
check(JSON.stringify(labels.map((l) => l.toLowerCase())) === JSON.stringify(['center', 'port 2', 'port 3']), 'Properties shows one row for each port of the fan coil unit', JSON.stringify(labels));
check((await page.locator(`[id="routing-${p2}"]`).inputValue()) === 'heating-water' && (await page.locator(`[id="routing-${p3}"]`).inputValue()) === '', 'the rows show the targets from the rule');
await page.locator(`[id="routing-${p3}"]`).selectOption('chilled-water');
await idle(400);
check((await project()).stamps.find((s) => s.id === moved.id).autoPlaced.moved === true, 'the change in Properties marks the stamp as moved');
await t.openAutoPlace();
await page.locator(`${nav} button[data-rule="example-supply-air"]`).click();
await idle(600);
await step(6).click();
await idle(3000);
const note = await page.locator(`${D} [data-testid=pg-place-table] tr[data-room="${moved.autoPlaced.roomId}"] td:last-child`).innerText();
check(/1 moved stamp kept \(1 with another routing target\)/.test(note), 'step 6 says that the moved stamp keeps another routing target', note);
await page.screenshot({ path: `${SP}/p3-moved.png` });

// ---------- The copy goes to another drawing ----------
await page.locator(`${nav} button[data-rule="example-supply-air"]`).click();
await idle(400);
await step(1).click();
await idle(600);
await page.locator('#pg-routing-perport').uncheck();
await idle(300);
await routing.selectOption(copyId);
await idle(1000);
check((await supplyRule()).networkTypeCopies?.[0]?.id === copyId, 'the rule keeps the copy again');
await page.keyboard.press('Escape');
await idle(500);
// The first drawing goes: one page with one PDF in this container.
await page.reload();
await page.waitForTimeout(2000);
if (await page.locator('button.mep-onboarding-start').isVisible()) await page.locator('button.mep-onboarding-start').click();
await page.waitForFunction(() => window.__mepSketchScene !== undefined);
await setup('fresh.pdf');
check(!(await project()).networkTypes.some((n) => n.id === copyId), 'the new drawing does not have the type of the other drawing');
await placeRule();
const fresh = await project();
const freshPlaced = fresh.stamps.filter((s) => s.autoPlaced);
check(fresh.networkTypes.some((n) => n.id === copyId && n.name === copyName), 'Auto-place adds the copy of the rule to the new drawing');
check(freshPlaced.length > 0 && freshPlaced.every((s) => Object.values(s.routingTargets ?? {}).every((v) => v === copyId) && Object.keys(s.routingTargets ?? {}).length === 3), 'the stamps of the new drawing get the type of the copy', JSON.stringify(freshPlaced[0]?.routingTargets));

await t.finish();
