// B7-T09d: Part J of the Windows test script (steps 39 to 42): a network with no source yet.
// Four scenarios: Example 2 (cases 1 and 2), Example 3 (case 3), Example 3 with equipment on Level 1 (case 4).
// Each scenario opens three new documents with their own file names (ex2-, ex3-, ex4-), because a second Open of one file name does not give a new document.
// Setup (documents, scale, project JSON, building file, summaries) uses the scene API and the dev hook only (b7-t09c2b-setup.mjs, not changed).
// Everything the cases check is read from the real DOM (Properties, Risers tab) after real clicks (document switcher, canvas, Capacity input, Enter, Manage Buildings).
import { mkdirSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-setup.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t09d/';
mkdirSync(SHOTS, { recursive: true });

const EX2 = [
  { pdf: '00_arch_ground_floor.pdf', name: 'ex2-l0.pdf', terminals: [100], openEnd: false },
  { pdf: '01_arch_first_floor.pdf', name: 'ex2-l1.pdf', terminals: [], openEnd: true },
  { pdf: 'arch_simple_A4.pdf', name: 'ex2-l2.pdf', terminals: [], openEnd: true },
];
const EX3 = [
  { pdf: '00_arch_ground_floor.pdf', name: 'ex3-l0.pdf', terminals: [100], openEnd: false },
  { pdf: '01_arch_first_floor.pdf', name: 'ex3-l1.pdf', terminals: [], openEnd: true },
  { pdf: 'arch_simple_A4.pdf', name: 'ex3-l2.pdf', terminals: [50], openEnd: false },
];
const EX4 = [
  { pdf: '00_arch_ground_floor.pdf', name: 'ex4-l0.pdf', terminals: [100], openEnd: false },
  { pdf: '01_arch_first_floor.pdf', name: 'ex4-l1.pdf', terminals: [], openEnd: true, equipment: true },
  { pdf: 'arch_simple_A4.pdf', name: 'ex4-l2.pdf', terminals: [50], openEnd: false },
];

const t = await open();
const { page, check, idle, until, menu } = t;
await t.start();

const snap = async (name) => {
  const path = `${SHOTS}${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
  await t.shot(name);
};
const textOf = async (id) => ((await page.locator(`[data-testid="${id}"]`).count()) > 0 ? (await page.locator(`[data-testid="${id}"]`).first().innerText()).trim() : null);
const allTexts = (id) => page.locator(`[data-testid="${id}"]`).evaluateAll((els) => els.map((e) => e.textContent.trim()));
const rowsText = () => page.locator('[data-testid="riser-capacity-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const docOf = () => page.evaluate(() => window.__mepSketchScene.getDocuments().find((d) => d.id === window.__mepSketchScene.getActiveDocumentId())?.fileName);
const field = (label) => page.locator('.mep-field-row', { has: page.locator('label', { hasText: label }) });
const fieldValue = async (label) => ((await field(label).count()) === 0 ? null : await field(label).first().locator('input').inputValue());
const pageHeight = () => page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);

async function activate(name) {
  if ((await docOf()) === name) return;
  if ((await page.locator('.mep-doc-switcher-dropdown').count()) === 0) await page.locator('.mep-doc-switcher-btn').click();
  await idle(100);
  await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: name }).first().click();
}
async function selectTool() {
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await idle(100);
}
async function clickPoint(p) {
  const at = await screenOf(page, p);
  await page.mouse.click(at.x, at.y);
  await idle(500);
}
const dlg = page.locator('.mep-modal');
async function showRisers() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(500);
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(900);
  await page.locator('[data-testid="riser-capacity"]').waitFor({ state: 'visible', timeout: 8000 });
  await until(async () => (await page.locator('[data-testid="riser-capacity"]').innerText()).indexOf('Reading the saved summaries') < 0, 'summaries read', 8000);
}
async function readRisers() {
  return { rows: await rowsText(), main: await textOf('riser-capacity-main'), total: await textOf('riser-capacity-total'), hints: await allTexts('riser-capacity-hint') };
}
async function closeDialog() {
  await page.keyboard.press('Escape');
  await idle(500);
}
async function runCase(label, fn) {
  try {
    await fn();
  } catch (e) {
    check(false, `${label} | exception: ${String(e.message).split('\n')[0]}`);
  }
}

// Level 1 of Examples 2 and 3: the open duct s9 runs from junction j (450, H-300) to the open end (450, H-450). Its middle is (450, H-375).
// The riser fitting rf of each level sits at (300, H-300).

// --- Example 2: one terminal (100) on Level 0, no source ---
await runCase('Setup Example 2', () => setup(t, EX2));

await runCase('Case 1', async () => {
  await activate('ex2-l1.pdf');
  await idle(1000);
  const H = await pageHeight();
  await selectTool();
  await clickPoint({ x: 450, y: H - 375 });
  await until(async () => (await fieldValue(/^Solved capacity/)) !== null, 'open duct shown', 8000);
  const duct = await fieldValue(/^Solved capacity/);
  await clickPoint({ x: 300, y: H - 300 });
  await until(async () => (await textOf('props-riser-main')) !== null, 'riser block shown', 8000);
  const fitting = await fieldValue(/^Solved capacity/);
  await showRisers();
  const r = await readRisers();
  console.log(`INFO case 1 hints: ${JSON.stringify(r.hints)}`);
  const ok =
    duct === 'at most 100' &&
    fitting === 'at most 100' &&
    JSON.stringify(r.rows) === JSON.stringify(['Level 0 to Level 1: at most 100 m³/h', 'Level 1 to Level 2: at most 100 m³/h']) &&
    r.main === 'Main level: not known yet (no source level)' &&
    r.total === 'Connected total: 100 m³/h (no concurrency factor)';
  check(
    ok,
    `Case 1 Example 2, Level 1, open duct s9 "at most 100", riser fitting rf "at most 100", Risers rows "at most 100 m³/h" x2, main "not known yet (no source level)", total "100 m³/h (no concurrency factor)" | real: duct "${duct}", fitting "${fitting}", rows ${JSON.stringify(r.rows)}, main "${r.main}", total "${r.total}"`,
  );
  await snap('b7-t09d-1-example2-risers');
  await closeDialog();
});

await runCase('Case 2', async () => {
  await activate('ex2-l0.pdf');
  await idle(1000);
  await selectTool();
  const terminal = await page.evaluate(() => window.__mepSketchScene.exportProject().stamps.find((s) => s.id === 't0')?.transform.position ?? null);
  if (!terminal) throw new Error('terminal t0 is not in the project of Level 0');
  await clickPoint(terminal);
  await until(async () => (await field(/^Capacity/).count()) > 0, 'terminal Capacity shown', 8000);
  const input = field(/^Capacity/).first().locator('input');
  const before = await input.inputValue();
  await input.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('250');
  await page.keyboard.press('Enter');
  await idle(800);
  const typed = await input.inputValue();
  await activate('ex2-l1.pdf');
  await idle(1000);
  const H = await pageHeight();
  await selectTool();
  await clickPoint({ x: 450, y: H - 375 });
  await until(async () => (await fieldValue(/^Solved capacity/)) !== null, 'open duct shown', 8000);
  const duct = await fieldValue(/^Solved capacity/);
  check(
    before === '100' && typed === '250' && duct === 'at most 250',
    `Case 2 Example 2, Level 0 terminal typed 250 in Capacity (no save), then Level 1 open duct s9 "at most 250" | real: capacity before "${before}", after typing "${typed}", duct "${duct}"`,
  );
  await snap('b7-t09d-2-example2-typed-250-level1');
});

// --- Example 3: terminals 100 (Level 0) and 50 (Level 2), the open end on Level 1 ---
await runCase('Setup Example 3', () => setup(t, EX3));

await runCase('Case 3', async () => {
  await activate('ex3-l1.pdf');
  await idle(1000);
  const H = await pageHeight();
  await selectTool();
  await clickPoint({ x: 450, y: H - 375 });
  await until(async () => (await fieldValue(/^Solved capacity/)) !== null, 'open duct shown', 8000);
  const duct = await fieldValue(/^Solved capacity/);
  await showRisers();
  const r = await readRisers();
  console.log(`INFO case 3 main "${r.main}", total "${r.total}", hints ${JSON.stringify(r.hints)}`);
  const noSourceHint = !r.hints.some((h) => /No source level yet|Place source equipment/.test(h));
  const ok = JSON.stringify(r.rows) === JSON.stringify(['Level 0 to Level 1: 100 m³/h', 'Level 1 to Level 2: 50 m³/h']) && duct === '150' && noSourceHint;
  check(
    ok,
    `Case 3 Example 3, plain rows "100 m³/h" and "50 m³/h", no source-less hint, Level 1 open duct s9 "150" | real: rows ${JSON.stringify(r.rows)}, duct "${duct}", source-less hint absent: ${noSourceHint}`,
  );
  await snap('b7-t09d-3-example3-risers');
  await closeDialog();
});

// --- Example 3 with an equipment (source) on Level 1 ---
await runCase('Setup Example 3 with equipment on Level 1', () => setup(t, EX4));

await runCase('Case 4', async () => {
  await activate('ex4-l1.pdf');
  await idle(1000);
  const H = await pageHeight();
  await selectTool();
  await clickPoint({ x: 450, y: H - 375 });
  await until(async () => (await fieldValue(/^Solved capacity/)) !== null, 'open duct shown', 8000);
  const duct = await fieldValue(/^Solved capacity/);
  const equipmentCapacity = await page.evaluate(() => window.__mepSketchScene.exportProject().stamps.find((s) => s.id === 'src')?.capacity ?? null);
  await showRisers();
  const r = await readRisers();
  console.log(`INFO case 4 hints ${JSON.stringify(r.hints)}`);
  const plain = r.rows.length === 2 && !r.rows.some((row) => /at most/.test(row));
  const ok = plain && r.main === 'Main level: Level 1';
  check(
    ok,
    `Case 4 Example 3 with equipment on Level 1, plain rows (no "at most"), main line "Main level: Level 1" | real: rows ${JSON.stringify(r.rows)}, main "${r.main}", total "${r.total}", Level 1 open duct s9 "${duct}", equipment capacity ${JSON.stringify(equipmentCapacity)}`,
  );
  await snap('b7-t09d-4-example3-equipment-risers');
  await closeDialog();
});

await t.finish();
