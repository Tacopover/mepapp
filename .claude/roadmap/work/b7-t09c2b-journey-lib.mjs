// Journey tester helpers for B7-T09c-2b. Controls are found by visible label and role. The setup helper is used for setup only.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup, EXAMPLE5, TYPE } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-setup.mjs';

export { EXAMPLE5, TYPE };
export const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t09c2b/';
export const WIDTHS = [1600, 1100, 760];

export async function begin(levelSpecs = EXAMPLE5, type = TYPE) {
  const t = await open();
  const { page, check, idle, menu, until } = t;
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await t.start();
  const built = await setup(t, levelSpecs, type);
  const dlg = page.locator('.mep-modal');
  const snap = async (name) => {
    const path = `${SHOTS}b7-t09c2b-journey-${name}.png`;
    await page.screenshot({ path });
    console.log(`SHOT ${path}`);
  };
  async function activate(name) {
    const cur = await page.evaluate(() => window.__mepSketchScene.getDocuments().find((d) => d.id === window.__mepSketchScene.getActiveDocumentId())?.fileName);
    if (cur === name) return;
    if ((await page.locator('.mep-doc-switcher-dropdown').count()) === 0) await page.locator('.mep-doc-switcher-btn').click();
    await idle(100);
    await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: name }).first().click();
    await idle(1200);
  }
  async function clickFittingOnCanvas() {
    await page.locator('button.mep-rail-btn[title="Select"]').click();
    await idle(100);
    const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
    const at = await screenOf(page, { x: 300, y: H - 300 });
    await page.mouse.click(at.x, at.y);
    await idle(700);
  }
  async function openRisersTab() {
    await menu('Manage Buildings…');
    await dlg.waitFor({ state: 'visible', timeout: 8000 });
    await idle(500);
    await dlg.getByRole('tab', { name: /^Risers/ }).click();
    await idle(1200);
  }
  async function closeDialog() {
    await page.keyboard.press('Escape');
    await idle(500);
  }
  /** all visible text of the dialog, line by line */
  const dlgLines = async () => (await dlg.innerText()).split('\n').map((s) => s.trim()).filter(Boolean);
  /** Measure overflow of everything inside the dialog that shows capacity text. */
  async function overflow(label) {
    const res = await page.evaluate(() => {
      const out = [];
      const root = document.querySelector('.mep-modal');
      const els = [...root.querySelectorAll('*')].filter((e) => /Main level|Connected total|at most|No source level|Numbers show|Place |Level \d to Level/.test(e.textContent || '') && e.children.length < 4);
      for (const e of els) {
        if (e.scrollWidth > e.clientWidth + 1) out.push({ cls: e.className, tag: e.tagName, sw: e.scrollWidth, cw: e.clientWidth, text: (e.textContent || '').slice(0, 60) });
      }
      const cap = root.querySelector('.mep-rp-capbox');
      return { out, cap: cap ? { sw: cap.scrollWidth, cw: cap.clientWidth, w: Math.round(cap.getBoundingClientRect().width) } : null, modalSw: root.scrollWidth, modalCw: root.clientWidth };
    });
    check(res.out.length === 0, `${label}: no text cut inside the dialog`, JSON.stringify(res.out));
    check(res.cap === null || res.cap.sw <= res.cap.cw + 1, `${label}: capacity box scrollWidth <= clientWidth`, JSON.stringify(res.cap));
    console.log(`MEASURE ${label} ${JSON.stringify(res)}`);
    return res;
  }
  return { built, t, page, check, idle, menu, until, dlg, snap, activate, clickFittingOnCanvas, openRisersTab, closeDialog, dlgLines, overflow, errors };
}
