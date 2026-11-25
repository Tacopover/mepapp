// B7-T12: the circuit load factor is saved as concurrencyPercent (schema 23). An OLD file (version 22, old names) still opens with the same values.
// Setup: four stamps from real clicks, a real Save, then the saved project text is changed to the OLD form (old names, version 22) in Node
// and put back into a copy of the PDF. The check opens that copy through Menu > Open and reads the real Properties panel and the real
// schematic view. The edit is typed into the real input. The saved text is read from the saved PDF (mupdf in Node).
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { EXPECT, OLD_PDF, makeOldFile, placeStampsAndExport, readOpfs, saveDocument } from './b7-t12-lib.mjs';
import { readProjectText } from './b7-t12-pdf.mjs';

const core = await import('/root/MepApp/.claude/worktrees/buildings-b7/packages/core/dist/index.js');
const OLD_WORDS = /diversity|diversif/i;

// A user template in the browser storage, saved with the old names (a copy of the second built-in template).
const oldCustom = JSON.parse(
  JSON.stringify({ ...structuredClone(core.SCHEMATIC_TEMPLATE_LIBRARY[1]), id: 'custom-old', name: 'Old custom' })
    .replaceAll('concurrencyPercent', 'diversityPercent')
    .replaceAll('concurrentCapacity', 'diversifiedCapacity')
    .replaceAll('Concurrent VA', 'Diversified VA'),
);
const oldCustomText = JSON.stringify([oldCustom]);

const t = await open({ seed: { 'mepapp.schematicTemplates': oldCustomText } });
const { page, check, idle, menu, until, statusText } = t;
await t.start();
await idle(800);

// 0. browser storage of user templates
check(JSON.stringify(oldCustom).includes('diversifiedCapacity'), 'storage seed: the stored template has the old names');
const stored = await page.evaluate(() => localStorage.getItem('mepapp.schematicTemplates'));
check(typeof stored === 'string' && !OLD_WORDS.test(stored), 'storage: after the app loaded, the stored templates have no old name', String(stored).slice(0, 120));
check(typeof stored === 'string' && stored.includes('circuit.concurrentCapacity') && stored.includes('custom-old'), 'storage: the template is kept and uses circuit.concurrentCapacity');

// 1. build the old file from real stamps, with a real Save
await t.openPdf();
const exported = await placeStampsAndExport(t);
await saveDocument(t);
const made = await makeOldFile(t, exported);
const savedProject = JSON.parse(made.savedText);
check(savedProject.schemaVersion === 23, 'a real Save writes schema version 23', String(savedProject.schemaVersion));
check(!OLD_WORDS.test(made.savedText) && made.savedText.includes('concurrencyPercent'), 'a real Save writes no old name and uses concurrencyPercent');
const oldProject = JSON.parse(made.oldText);
check(oldProject.schemaVersion === 22 && /diversityPercent/.test(made.oldText) && !/concurren/i.test(made.oldText), 'the OLD file text is version 22, has diversityPercent and no concurrency word');
check(oldProject.circuits[0].diversityPercent === 80 && oldProject.panels[0].circuitDefaults.diversityPercent === 90, 'the OLD file: circuit 1 has 80, the panel default is 90');
check(/circuit\.diversifiedCapacity/.test(made.oldText) && /Diversified VA/.test(made.oldText), 'the OLD file: the template copy uses circuit.diversifiedCapacity and the label Diversified VA');

// 2. open the OLD file through Menu > Open
await t.openPdf(OLD_PDF, 'old-v22.pdf');
check(/Loaded old-v22\.pdf/.test(await statusText()), 'the old file opens', await statusText());
const circuits = await page.evaluate(() => window.__mepSketchScene.listCircuits().map((c) => ({ id: c.id, own: c.concurrencyPercent })));
check(circuits.length === 2 && circuits[0].own === 80 && circuits[1].own === undefined, 'migrated state: circuit 1 own 80, circuit 2 no own value', JSON.stringify(circuits));

// 3. the real Properties panel
await page.locator('.mep-dock-tab-label', { hasText: /^Networks$/ }).click();
await idle(400);
await page.locator('.mep-net-tree-row', { hasText: /^\s*Electrical\s*$/ }).first().click();
await idle(300);
await page.locator('.mep-net-tree-row-panel .mep-net-tree-toggle').first().click();
await idle(300);
const concRow = () => page.locator('.mep-field-row', { has: page.locator('label', { hasText: /^Concurrency/ }) }).first();
async function selectCircuit(index) {
  await page.locator('.mep-dock-tab-label', { hasText: /^Networks$/ }).click();
  await idle(300);
  await page.locator('.mep-net-tree-row-circuit').nth(index).click();
  await idle(300);
  await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
  await idle(500);
}
await selectCircuit(0);
const input1 = concRow().locator('input');
check((await input1.inputValue()) === '80', 'circuit 1: the field "Concurrency %" shows 80 (the old value)', await input1.inputValue());
await t.shot('b7-t12-1-circuit1-properties');
await selectCircuit(1);
const input2 = concRow().locator('input');
check((await input2.inputValue()) === '' && (await input2.getAttribute('placeholder')) === '90', 'circuit 2: inherited, the panel default 90 shows as placeholder', `${await input2.inputValue()} / ${await input2.getAttribute('placeholder')}`);
check(/panel default/i.test(await concRow().locator('label').innerText()), 'circuit 2: the label says (panel default)');
await t.shot('b7-t12-2-circuit2-inherited');

// 4. the real schematic view, numbers computed by hand from the fixture
await page.locator('.mep-dock-tab-label', { hasText: /^Networks$/ }).click();
await idle(300);
await page.locator('.mep-net-tree-row-panel .mep-net-tree-label').first().click();
await idle(300);
await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
await idle(400);
const panelConc = page.locator('.mep-field-row', { has: page.locator('label', { hasText: /^Concurrency/ }) }).first().locator('input');
check((await panelConc.inputValue()) === '90', 'panel: the default "Concurrency %" shows 90', await panelConc.inputValue());
const texts = () => page.evaluate(() => [...document.querySelectorAll('.mep-modal svg text')].map((n) => n.textContent));
async function openSchematic() {
  await page.locator('button', { hasText: /^Schematics…$/ }).click();
  await idle(1500);
}
async function closeSchematic() {
  await page.locator('.mep-modal button[aria-label="Close"]').click();
  await idle(500);
}
await openSchematic();
let rows = await texts();
const after = (label) => rows[rows.indexOf(label) + 1];
check(after('Total VA') === String(EXPECT.totalVa), 'rows template: Total VA is 600 (100 + 200 + 300)', String(after('Total VA')));
check(rows.includes('Concurrent VA') && !rows.includes('Diversified VA'), 'rows template: the total row is labelled Concurrent VA');
check(after('Concurrent VA') === String(EXPECT.totalConcurrent), 'rows template: Concurrent VA is 510 (300 x 80% + 300 x 90%)', String(after('Concurrent VA')));
check(rows.includes(`${EXPECT.c1.concurrent} · ${EXPECT.c1.effective}%`), 'rows template: circuit A1 derived cell reads 240 · 80%', JSON.stringify(rows.filter((x) => /%/.test(x))));
check(rows.includes(`${EXPECT.c2.concurrent} · ${EXPECT.c2.effective}%`), 'rows template: circuit A2 derived cell reads 270 · 90%', JSON.stringify(rows.filter((x) => /%/.test(x))));
await page.locator('button', { hasText: /^Zoom to content$/ }).click();
await idle(600);
await t.shot('b7-t12-3-schematic-rows');
await page.locator('select[aria-label="Schematic"]').selectOption({ label: 'Panel A builtin-columns-nl' });
await idle(1200);
rows = await texts();
check(rows.includes('240') && rows.includes('270'), 'columns template: the derived column shows 240 and 270', JSON.stringify(rows.filter((x) => /^\d+$/.test(x))));
check(after('Concurrent VA') === String(EXPECT.totalConcurrent), 'columns template: Concurrent VA is 510', String(after('Concurrent VA')));
await page.locator('button', { hasText: /^Zoom to content$/ }).click();
await idle(600);
await t.shot('b7-t12-4-schematic-columns');
await closeSchematic();

// 5. edit through the real input, save, read the saved text
await selectCircuit(0);
const edit = concRow().locator('input');
await edit.fill('70');
await edit.press('Enter');
await idle(500);
const own = await page.evaluate(() => window.__mepSketchScene.listCircuits().map((c) => c.concurrencyPercent));
check(own[0] === 70 && own[1] === undefined, 'the typed 70 is stored on circuit 1 only', JSON.stringify(own));
check((await page.locator('.mep-doc-switcher > .mep-doc-dirty-dot').count()) === 1, 'the document shows the changed mark');
await saveDocument(t);
const savedBytes = await readOpfs(page, 'old-v22.pdf');
const savedText = readProjectText(savedBytes);
const saved = JSON.parse(savedText);
check(saved.schemaVersion === 23, 'saved after the edit: schema version 23', String(saved.schemaVersion));
check(!OLD_WORDS.test(savedText), 'saved after the edit: no old word anywhere in the saved text');
check(saved.circuits[0].concurrencyPercent === 70 && !('concurrencyPercent' in saved.circuits[1]), 'saved: circuit 1 has 70, circuit 2 has no own value', JSON.stringify(saved.circuits.map((c) => c.concurrencyPercent)));
check(saved.panels[0].circuitDefaults.concurrencyPercent === 90, 'saved: the panel default is 90');
check(JSON.stringify(saved.schematics[0].template).includes('circuit.concurrentCapacity') && JSON.stringify(saved.schematics[0].template).includes('Concurrent VA'), 'saved: the schematic template copy uses circuit.concurrentCapacity and Concurrent VA');
check(JSON.stringify(saved.schematics[0].template) === JSON.stringify(core.SCHEMATIC_TEMPLATE_LIBRARY[0]), 'saved: the migrated template copy equals the current built-in template');

// 6. the schematic follows the edit: A1 = 300 x 70% = 210, total concurrent = 210 + 270 = 480
await page.locator('.mep-dock-tab-label', { hasText: /^Networks$/ }).click();
await idle(300);
await page.locator('.mep-net-tree-row-panel .mep-net-tree-label').first().click();
await idle(300);
await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
await idle(400);
await openSchematic();
await page.locator('select[aria-label="Schematic"]').selectOption({ label: 'Panel A builtin-rows-nl' });
await idle(1000);
rows = await texts();
check(rows.includes('210 · 70%') && after('Concurrent VA') === '480', 'after the edit: A1 reads 210 · 70% and Concurrent VA is 480', JSON.stringify(rows.filter((x) => /%/.test(x))) + ' ' + after('Concurrent VA'));
await closeSchematic();

// 7. reopen the saved file in a new tab: the new names load without a step
await t.openPdf('/tmp/claude-0/-root-MepApp/cf5c37c1-d676-49ff-a984-22050b48ded8/scratchpad/b7-t12/new-saved.pdf', 'new-saved.pdf');
const reopened = await page.evaluate(() => window.__mepSketchScene.listCircuits().map((c) => c.concurrencyPercent));
check(reopened[0] === 80 && reopened[1] === undefined, 'a file saved by this version (version 23) opens with the same values', JSON.stringify(reopened));

check(readFileSync(OLD_PDF).length > 0, 'the old-form fixture file exists');
await t.finish();
