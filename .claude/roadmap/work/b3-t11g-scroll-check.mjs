// B3-T11g UI review: is the right pane scrollable at 760x640, and does the not-placed list reach its end?
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, shot, idle, menu } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const b64 = (file) => readFileSync(FIX + file).toString('base64');
const items = (kind) => dlg.locator(`[role="treeitem"][data-kind="${kind}"]`);

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

await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await dlg.locator('button', { hasText: /^New building$/ }).click();
const nameInput = dlg.locator('input[aria-label="Building name"]');
await nameInput.fill('Tower');
await nameInput.press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await dlg.locator('[data-testid="tree-add-level"]').click();
await idle(300);
await page.setViewportSize({ width: 760, height: 640 });
await idle(500);
console.log('NARROW-TREE-SELECT', JSON.stringify(await dlg.locator('select').evaluateAll((els) => els.map((e) => Array.from(e.options).map((o) => o.text)))));
console.log('NARROW-ADD-LEVEL-VISIBLE', await dlg.locator('[data-testid="tree-add-level"]').count());

await addPdf('ground.pdf', '00_arch_ground_floor.pdf');
await addPdf('multi.pdf', 'Sample Project_multi_page.pdf');
const pane = dlg.locator('[data-testid="sheets-pane"]');
if ((await pane.count()) === 0) {
  await dlg.locator('[role="treeitem"]', { hasText: 'Not placed' }).click();
  await idle(300);
}

// Walk the ancestors of the pane and report the ones that scroll or clip.
const info = await pane.evaluate((el) => {
  const out = [];
  let n = el;
  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    if (n.scrollHeight > n.clientHeight + 1 || /(auto|scroll|hidden)/.test(cs.overflowY)) {
      out.push({ tag: n.tagName, cls: String(n.className).slice(0, 60), overflowY: cs.overflowY, clientH: n.clientHeight, scrollH: n.scrollHeight });
    }
    n = n.parentElement;
  }
  return out;
});
console.log('CLIP-ANCESTORS', JSON.stringify(info));
const lastBox = await pane.locator('button', { hasText: /^Remove from list$/ }).last().boundingBox();
const paneBox = await pane.boundingBox();
console.log('LAST-REMOVE-BTN', JSON.stringify(lastBox), 'PANE', JSON.stringify(paneBox));
await shot('B3-T11g-review-narrow-scroll-bottom');
await pane.evaluate((el) => {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollHeight > n.clientHeight + 1) n.scrollTop = n.scrollHeight;
  }
});
await idle(300);
await shot('B3-T11g-review-narrow-scrolled');
const lastAfter = await pane.locator('button', { hasText: /^Remove from list$/ }).last().boundingBox();
console.log('LAST-REMOVE-BTN-AFTER-SCROLL', JSON.stringify(lastAfter));

await t.finish();
