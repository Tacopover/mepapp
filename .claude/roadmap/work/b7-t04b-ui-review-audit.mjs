// B7-T04b UI review: keyboard path, selection audit, segment hint states, shared riser (hint D).
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t04b/';
const t = await open();
const { page, check, idle } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
const { uuids, summaries, building } = await setup(t);
const all = { [uuids[0]]: summaries[0], [uuids[1]]: summaries[1], [uuids[2]]: summaries[2] };

const pageH = () => page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
async function clickPoint(p, wait = 500, shift = false) {
  const at = await screenOf(page, p);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(at.x, at.y);
  if (shift) await page.keyboard.up('Shift');
  await idle(wait);
}
async function loadBuilding(file, stored) {
  await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(file), stored]);
  await idle(1200);
}
const dump = () =>
  page.evaluate(() => {
    const body = document.querySelector('.mep-dock-body');
    const head = body.querySelector('h3, .mep-panel-title, .mep-props-title')?.textContent ?? body.innerText.split('\n')[0];
    return {
      head,
      riser: !!body.querySelector('[data-testid="props-riser-section"]'),
      segHint: body.querySelector('[data-testid="props-segment-riser-hint"]')?.textContent ?? null,
      main: body.querySelector('[data-testid="props-riser-main"]')?.textContent ?? null,
      total: body.querySelector('[data-testid="props-riser-total"]')?.textContent ?? null,
      hints: [...body.querySelectorAll('[data-testid="props-riser-hint"]')].map((h) => h.textContent),
      titles: [...body.querySelectorAll('.mep-field-text')].map((s) => s.title),
      h4: [...body.querySelectorAll('[data-testid="props-riser-section"] h4')].map((h) => h.textContent),
    };
  });
const tabSeq = async (n, key = 'Tab') => {
  const seq = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(key);
    seq.push(
      await page.evaluate(() => {
        const a = document.activeElement;
        const inRiser = !!a?.closest('[data-testid="props-riser-section"]');
        const inBody = !!a?.closest('.mep-dock-body');
        const row = a?.closest('.mep-field-row')?.querySelector('label')?.textContent ?? '';
        return `${a?.tagName.toLowerCase()}${inBody ? '[dock]' : ''}${inRiser ? '[RISER]' : ''}${row ? ' ' + row : ''}${a?.getAttribute('title') ? ' (' + a.getAttribute('title') + ')' : ''}`;
      }),
    );
  }
  return seq;
};

await page.locator('.mep-doc-switcher-btn').click();
await idle(200);
await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: 'l1.pdf' }).first().click();
await idle(1500);
await page.locator('button.mep-rail-btn[title="Select"]').click();
await loadBuilding(building, all);
const H = await pageH();

// --- keyboard ---
await clickPoint({ x: 300, y: H - 300 });
console.log('FITTING known', JSON.stringify(await dump()));
await page.locator('.mep-dock-body select').first().focus();
console.log('TAB with riser block', JSON.stringify(await tabSeq(6)));
console.log('SHIFT+TAB with riser block', JSON.stringify(await tabSeq(3, 'Shift+Tab')));
const focusables = await page.evaluate(() => [...document.querySelectorAll('[data-testid="props-riser-section"] *')].filter((e) => e.tabIndex >= 0 && !['H4', 'DIV', 'LABEL', 'SPAN', 'P'].includes(e.tagName)).length);
const tabIdx = await page.evaluate(() => [...document.querySelectorAll('[data-testid="props-riser-section"] *')].filter((e) => e.hasAttribute('tabindex')).length);
check(focusables === 0 && tabIdx === 0, 'the riser block adds no focus stop', `${focusables} ${tabIdx}`);

// --- selection audit ---
const sel = {};
await clickPoint({ x: 450, y: H - 300 });
sel.fittingJ = await dump();
await clickPoint({ x: 300, y: H - 300 });
await clickPoint({ x: 450, y: H - 300 }, 500, true);
sel.twoFittings = await dump();
const t0 = await page.evaluate(() => window.__mepSketchScene.exportProject().stamps.find((s) => s.id === 't0').transform.position);
await clickPoint(t0);
sel.terminal = await dump();
await clickPoint({ x: 525, y: H - 330 });
sel.segBranch = await dump();
await clickPoint({ x: 375, y: H - 300 });
await clickPoint({ x: 525, y: H - 330 }, 500, true);
sel.twoSegments = await dump();
await clickPoint({ x: 300, y: H - 300 });
await clickPoint({ x: 375, y: H - 300 }, 500, true);
sel.fittingAndSegment = await dump();
await clickPoint({ x: 100, y: 100 });
sel.empty = await dump();
for (const [k, v] of Object.entries(sel)) console.log('SEL', k, JSON.stringify(v));
check(sel.fittingJ.riser === false, 'a non-riser fitting shows no block');
check(sel.twoFittings.riser === false, 'two fittings show no block');
check(sel.terminal.riser === false && !sel.terminal.segHint, 'a terminal shows no block and no hint');
check(sel.twoSegments.segHint === null, 'two segments show no hint', String(sel.twoSegments.segHint));
check(sel.fittingAndSegment.riser === false && !sel.fittingAndSegment.segHint, 'fitting plus segment: no block, no hint');

// --- segment hint in the other states ---
const noSource = JSON.parse(summaries[0]);
noSource.riserNetworks[0].hasSource = false;
noSource.savedAt = new Date(Date.now() + 5000).toISOString();
const states = {
  atleast: { [uuids[1]]: summaries[1], [uuids[2]]: summaries[2] },
  nosource: { ...all, [uuids[0]]: JSON.stringify(noSource) },
  atleast_l0_missing: { [uuids[1]]: summaries[1], [uuids[2]]: summaries[2] },
};
for (const [name, stored] of Object.entries(states)) {
  await loadBuilding(building, stored);
  await clickPoint({ x: 375, y: H - 300 });
  console.log('SEGMENT', name, JSON.stringify(await dump()));
  await clickPoint({ x: 300, y: H - 300 });
  console.log('FITTING', name, JSON.stringify(await dump()));
}

// --- shared riser: R2 on the junction j of level 0 and level 1 ---
const shared = JSON.parse(JSON.stringify(building));
shared.risers.push({
  id: 'r2', name: 'R2', networkTypeId: shared.risers[0].networkTypeId, networkType: shared.risers[0].networkType, anchorMm: { xMm: 1500, yMm: 1500 }, flow: 'unknown', topEnd: 'member', bottomEnd: 'member', endAllowanceMm: 0,
  members: [0, 1].map((i) => ({ levelId: `l${i}`, sheetId: `s${i}`, pageIndex: 0, fittingId: 'j' })),
  pending: [],
});
await loadBuilding(shared, all);
await page.evaluate(async () => {
  const read = async (sheet) => { try { return await (await (await navigator.storage.getDirectory()).getFileHandle(sheet.location.fileName)).getFile(); } catch { return undefined; } };
  await window.__mepBuilding.rebuildSummaries(read);
});
await idle(1500);
const modalText = await page.evaluate(() => [...document.querySelectorAll('.mep-modal, [role="dialog"]')].map((m) => m.innerText.slice(0, 400)));
console.log('MODALS after shared load', JSON.stringify(modalText));
await page.getByRole('button', { name: 'Decide later' }).click().catch(() => {});
await idle(800);
await clickPoint({ x: 300, y: H - 300 });
console.log('SHARED fitting rf', JSON.stringify(await dump()));
await clickPoint({ x: 375, y: H - 300 });
console.log('SHARED segment s1', JSON.stringify(await dump()));
await clickPoint({ x: 450, y: H - 300 });
console.log('SHARED fitting j', JSON.stringify(await dump()));
await page.screenshot({ path: `${SHOTS}ui-review-shared-j.png`, clip: { x: 1180, y: 40, width: 420, height: 500 } });
await clickPoint({ x: 300, y: H - 300 });
await page.screenshot({ path: `${SHOTS}ui-review-shared-rf.png`, clip: { x: 1180, y: 40, width: 420, height: 500 } });

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
