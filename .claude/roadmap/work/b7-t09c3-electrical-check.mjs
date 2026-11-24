// B7-T09c-3: the tag of an electrical riser (D-B-103 A). Example 5 with an electrical network type.
// Setup uses the scene API and the dev hook only. The reads come from the real DOM (Risers tab, Properties) after real clicks.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup, EXAMPLE5 } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-setup.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t09c3/';
const POWER = { id: 'power', name: 'Power', discipline: 'electrical', units: 'kW', defaultCapacity: 1, color: '#e53935', lineWidthPt: 2, linePattern: 'solid', flowUnit: 'kW' };
const t = await open();
const { page, check, idle, menu, until } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
await setup(t, EXAMPLE5, POWER);

const snap = async (name) => {
  const path = `${SHOTS}${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};
const textOf = async (id) => ((await page.locator(`[data-testid="${id}"]`).count()) > 0 ? (await page.locator(`[data-testid="${id}"]`).first().innerText()).trim() : null);
const docOf = () => page.evaluate(() => window.__mepSketchScene.getDocuments().find((d) => d.id === window.__mepSketchScene.getActiveDocumentId())?.fileName);
const dlg = page.locator('.mep-modal');
const TAG = 'Connected load, not a design load';

if ((await docOf()) !== 'l1.pdf') {
  if ((await page.locator('.mep-doc-switcher-dropdown').count()) === 0) await page.locator('.mep-doc-switcher-btn').click();
  await idle(100);
  await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: 'l1.pdf' }).first().click();
  await idle(1200);
}

// Properties: the riser fitting of Level 1
const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
await page.locator('button.mep-rail-btn[title="Select"]').click();
await idle(100);
{
  const at = await screenOf(page, { x: 300, y: H - 300 });
  await page.mouse.click(at.x, at.y);
  await idle(600);
  await until(async () => (await textOf('props-riser-tag')) !== null, 'riser block shown', 6000).catch(() => {});
  check((await textOf('props-riser-tag')) === TAG, 'Properties riser block: the tag reads the electrical text', String(await textOf('props-riser-tag')));
  await snap('b7-t09c3-electrical-properties');
}

// The Risers tab at 1600 and 760 px
await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(500);
await dlg.getByRole('tab', { name: /^Risers/ }).click();
await idle(900);
await page.locator('[data-testid="riser-capacity"]').waitFor({ state: 'visible', timeout: 8000 });
await until(async () => (await page.locator('[data-testid="riser-capacity"]').innerText()).indexOf('Reading the saved summaries') < 0, 'summaries read', 8000);
for (const width of [1600, 760]) {
  await page.setViewportSize({ width, height: 900 });
  await idle(500);
  check((await textOf('riser-not-design-flow')) === TAG, `Risers tab at ${width} px: the tag reads the electrical text`, String(await textOf('riser-not-design-flow')));
  const m = await page.evaluate(() => {
    const tag = document.querySelector('[data-testid="riser-not-design-flow"]');
    const head = document.querySelector('.mep-rp-capacity-head');
    const h5 = head?.querySelector('h5');
    return { tagScroll: tag.scrollWidth, tagClient: tag.clientWidth, headScroll: head.scrollWidth, headClient: head.clientWidth, h5Top: h5.getBoundingClientRect().top, tagTop: tag.getBoundingClientRect().top, tagHeight: tag.getBoundingClientRect().height };
  });
  check(m.tagScroll <= m.tagClient && m.headScroll <= m.headClient, `Risers tab at ${width} px: the tag does not overflow`, JSON.stringify(m));
  await snap(`b7-t09c3-electrical-risers-${width}`);
}
{
  const title = await page.locator('[data-testid="riser-not-design-flow"]').getAttribute('title');
  check(/not a design flow for this network type/.test(title ?? ''), 'the tag title keeps the design-flow hint', String(title));
  const rows = await page.locator('[data-testid="riser-capacity-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check(JSON.stringify(rows) === JSON.stringify(['Level 0 to Level 1: at most 650 kW', 'Level 1 to Level 2: at most 600 kW']), 'rows read at most 650 kW and 600 kW', JSON.stringify(rows));
  const hints = await page.locator('[data-testid="riser-capacity-hint"]').evaluateAll((els) => els.map((e) => e.textContent.trim()));
  check(hints.some((h) => /^Place a panel on a level/.test(h)), 'hint 3 names a panel', JSON.stringify(hints));
}
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
