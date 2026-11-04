// B3-T11g UI review: action row placement, text sizes, add result stays until Dismiss, level sheets pane, 760x640 layout. Real clicks.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const b64 = (file) => readFileSync(FIX + file).toString('base64');
const items = (kind) => dlg.locator(`[role="treeitem"][data-kind="${kind}"]`);
const result = dlg.locator('[data-testid="add-result"]');
const op = async () => ((await result.count()) ? result.evaluate((el) => getComputedStyle(el).opacity) : 'absent');

async function addPdf(name, file) {
  await page.evaluate(
    async ([data, n]) => {
      const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
      await w.close();
      window.__nextFile = n;
    },
    [b64(file), name],
  );
  await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
  await idle(900);
}

const probe = (loc) =>
  loc.first().evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { text: (el.textContent || '').trim().slice(0, 50), font: cs.fontSize, color: cs.color, weight: cs.fontWeight, x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) };
  });

await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await dlg.locator('button', { hasText: /^New building$/ }).click();
const nameInput = dlg.locator('input[aria-label="Building name"]');
await nameInput.fill('Tower');
await nameInput.press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await dlg.locator('[data-testid="tree-add-level"]').click();
await idle(300);
await items('level').first().click();
await idle(300);

await addPdf('ground.pdf', '00_arch_ground_floor.pdf');
await addPdf('multi.pdf', 'Sample Project_multi_page.pdf');
const pane = dlg.locator('[data-testid="level-sheets"]');
console.log('PANE-COUNT', await pane.count(), 'RESULT', ((await result.textContent().catch(() => '')) ?? ''));
check((await dlg.locator('[role="treeitem"]', { hasText: 'Not placed' }).count()) === 0, 'no Not placed node after the adds');

console.log('RESULT-STYLE', JSON.stringify(await probe(result)));
console.log('COUNT-LINE-STYLE', JSON.stringify(await probe(dlg.locator('[data-testid="summary-count"]'))));
console.log('FILE-HEADING-STYLE', JSON.stringify(await probe(pane.getByText('ground.pdf', { exact: true }))));
console.log('PAGE-LABEL-STYLE', JSON.stringify(await probe(pane.getByText(/^Page 1$/))));
console.log('REMOVE-BTN-STYLE', JSON.stringify(await probe(pane.locator('button', { hasText: /^Remove$/ }))));
console.log('RESULT-OPACITY-0S', await op());
await shot('B3-T11g-review-result-fresh');
await idle(1000);
console.log('RESULT-OPACITY-1S', await op());
await idle(7000);
console.log('RESULT-OPACITY-8S', await op());
await shot('B3-T11g-review-result-stays');

await page.setViewportSize({ width: 760, height: 640 });
await idle(500);
await shot('B3-T11g-review-narrow-level');
console.log('PANE-NARROW', JSON.stringify(await pane.boundingBox()), 'DLG', JSON.stringify(await dlg.boundingBox()));

await t.finish();
