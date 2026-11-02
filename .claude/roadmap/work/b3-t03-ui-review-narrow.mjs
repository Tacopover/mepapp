// B3-T03 UI review: levels pane at a narrow window (800 px) and in the dark theme. Reads layout only.
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const t = await open({ width: 800, height: 900 });
const { page, check, shot, idle, menu, finish } = t;
await t.start();

await page.evaluate(async () => {
  await window.__mepBuilding.load(JSON.stringify({
    schemaVersion: 1, id: 'b-n', name: 'Narrow tower',
    levels: [
      { id: 'a', name: 'Ground floor with a long name for width testing', elevationMm: -3000 },
      { id: 'b', name: 'First floor', elevationMm: 3000 },
      { id: 'c', name: 'Level 3', elevationMm: 3000 },
    ],
    sheets: [{ id: 's1', levelId: 'a', projectUuid: 'u1', pageIndex: 0, displayName: 'P1', location: { fileName: 'p.pdf' } }],
    risers: [],
  }));
});
await idle(400);

const dlg = page.locator('.mep-modal');
await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(300);

const geo = await page.evaluate(() => {
  const modal = document.querySelector('.mep-modal').getBoundingClientRect();
  const rows = [...document.querySelectorAll('[data-testid="level-row"]')].map((row) => {
    const r = row.getBoundingClientRect();
    const kids = [...row.children].map((el) => {
      const b = el.getBoundingClientRect();
      return { tag: el.tagName, text: (el.textContent || el.value || '').slice(0, 30), left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width) };
    });
    return { rowRight: Math.round(r.right), rowWidth: Math.round(r.width), kids, scrollW: row.scrollWidth, clientW: row.clientWidth };
  });
  const warn = [...document.querySelectorAll('.mep-buildings-message')].map((p) => ({ text: p.textContent, right: Math.round(p.getBoundingClientRect().right), scrollW: p.scrollWidth, clientW: p.clientWidth }));
  return { modal: { left: Math.round(modal.left), right: Math.round(modal.right), width: Math.round(modal.width) }, viewport: window.innerWidth, rows, warn };
});
console.log(JSON.stringify(geo, null, 1));

check(geo.rows.length === 3, 'three level rows at 800 px', String(geo.rows.length));
const overflow = geo.rows.filter((r) => r.rowRight > geo.modal.right || r.scrollW > r.clientW);
check(overflow.length === 0, 'no level row runs past the dialog edge at 800 px', JSON.stringify(overflow));
await shot('B3-T03-review-narrow');

// Long warning and a dark-theme capture of the same dialog.
await page.emulateMedia({ colorScheme: 'dark' });
await idle(400);
await shot('B3-T03-review-dark');

check(page.viewportSize().width === 800, 'viewport is 800 px');
await finish();
