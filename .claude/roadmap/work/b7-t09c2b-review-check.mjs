// B7-T09c-2b UI review: measure the Capacity card and the Properties riser block at 1600, 1100, 760 px (normal and stress names).
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-setup.mjs';
import { atWidths, findClipped } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/layout-measure.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t09c2b/';
const t = await open();
const { page, check, idle, menu, until } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await t.start();
const { building } = await setup(t);

const snap = async (name) => {
  const path = `${SHOTS}${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};
const docOf = () => page.evaluate(() => window.__mepSketchScene.getDocuments().find((d) => d.id === window.__mepSketchScene.getActiveDocumentId())?.fileName);
async function activate(name) {
  if ((await docOf()) === name) return;
  if ((await page.locator('.mep-doc-switcher-dropdown').count()) === 0) await page.locator('.mep-doc-switcher-btn').click();
  await idle(100);
  await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: name }).first().click();
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

// the measurement inside the page
const measureCard = () =>
  page.evaluate(() => {
    const cap = document.querySelector('[data-testid="riser-capacity"]');
    if (!cap) return { error: 'no capacity' };
    const over = (el) => el.scrollWidth - el.clientWidth;
    const scroller = (() => {
      let e = cap.parentElement;
      while (e && e !== document.body) {
        const cs = getComputedStyle(e);
        if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 1) return e;
        e = e.parentElement;
      }
      return null;
    })();
    const sRect = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: innerHeight };
    const vis = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), fullyVisible: r.top >= sRect.top - 1 && r.bottom <= sRect.bottom + 1, partlyVisible: r.bottom > sRect.top && r.top < sRect.bottom };
    };
    const hints = [...document.querySelectorAll('[data-testid="riser-capacity-hint"]')];
    const link = document.querySelector('[data-testid="riser-set-by-hand"]');
    const main = document.querySelector('[data-testid="riser-capacity-main"]');
    const total = document.querySelector('[data-testid="riser-capacity-total"]');
    const rows = [...document.querySelectorAll('[data-testid="riser-capacity-row"]')];
    const fs = (el) => (el ? getComputedStyle(el).fontSize : null);
    return {
      scroller: scroller ? { client: scroller.clientHeight, scroll: scroller.scrollHeight, scrollbarW: scroller.offsetWidth - scroller.clientWidth, cls: scroller.className } : null,
      mainOver: main ? over(main) : null,
      totalOver: total ? over(total) : null,
      rowOver: rows.map(over),
      rowLines: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
      mainLines: main ? Math.round(main.getBoundingClientRect().height) : null,
      hintVis: hints.map(vis),
      hintFont: fs(hints[0]),
      hintColor: hints[0] ? getComputedStyle(hints[0]).color : null,
      hintLines: hints.map((h) => Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight))),
      linkVis: vis(link),
      mainFont: fs(main),
      mainWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
    };
  });
const measureProps = () =>
  page.evaluate(() => {
    const main = document.querySelector('[data-testid="props-riser-main"]');
    const total = document.querySelector('[data-testid="props-riser-total"]');
    const hints = [...document.querySelectorAll('[data-testid="props-riser-hint"]')];
    const over = (el) => (el ? el.scrollWidth - el.clientWidth : null);
    const h = (el) => (el ? Math.round(el.getBoundingClientRect().height) : null);
    const dock = main ? main.closest('.mep-dock, .mep-panel, aside') : null;
    return { mainOver: over(main), totalOver: over(total), mainH: h(main), totalH: h(total), hintOver: hints.map(over), hintH: hints.map(h), dockW: dock ? Math.round(dock.getBoundingClientRect().width) : null, mainRight: main ? Math.round(main.getBoundingClientRect().right) : null, vw: innerWidth };
  });

// Properties block
await activate('l1.pdf');
await idle(1500);
await page.locator('button.mep-rail-btn[title="Select"]').click();
await idle(100);
{
  const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
  const at = await screenOf(page, { x: 300, y: H - 300 });
  await page.mouse.click(at.x, at.y);
  await idle(600);
}
const propsRes = await atWidths(page, async (w) => {
  await idle(300);
  const r = await measureProps();
  console.log('PROPS', w, JSON.stringify(r));
  await snap(`b7-t09c2b-review-props-${w}`);
  return r;
});
for (const { width, result } of propsRes) {
  check(result.mainOver !== null && result.mainOver <= 1, `Properties riser row not cut at ${width}`, JSON.stringify(result));
  check(result.hintOver.every((o) => o <= 1), `Properties hint not cut at ${width}`, JSON.stringify(result));
}

await page.setViewportSize({ width: 1600, height: 1000 });
await idle(400);
await showRisers();
const cardRes = await atWidths(page, async (w) => {
  await idle(400);
  const r = await measureCard();
  console.log('CARD', w, JSON.stringify(r));
  const clipped = await findClipped(page);
  console.log('CLIPPED', w, JSON.stringify(clipped));
  await snap(`b7-t09c2b-review-card-${w}`);
  return { r, clipped };
});
for (const { width, result } of cardRes) {
  const r = result.r;
  check(r.mainOver <= 1 && r.totalOver <= 1 && r.rowOver.every((o) => o <= 1), `Capacity card text not cut at ${width}`, JSON.stringify(r));
  check(r.hintVis.length === 3, `3 hints at ${width}`);
  check(r.hintVis.every((v) => v.fullyVisible), `3 hints fully visible with no scroll at ${width}`, JSON.stringify(r.hintVis));
  check(r.linkVis && r.linkVis.fullyVisible, `Set by hand link visible with no scroll at ${width}`, JSON.stringify(r.linkVis));
}

// Stress names: 80 characters
const long = (s) => (s + 'abcdefghij'.repeat(10)).slice(0, 80);
const stress = JSON.parse(JSON.stringify(building));
stress.levels.forEach((l, i) => (l.name = long(`L${i}`)));
stress.risers[0].name = long('R1-riser-');
await page.keyboard.press('Escape');
await idle(500);
await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(stress));
await idle(800);
await showRisers();
const stressRes = await atWidths(page, async (w) => {
  await idle(400);
  const r = await measureCard();
  console.log('STRESS', w, JSON.stringify(r));
  await snap(`b7-t09c2b-review-stress-${w}`);
  return r;
});
for (const { width, result: r } of stressRes) {
  check(r.mainOver <= 1 && r.totalOver <= 1 && r.rowOver.every((o) => o <= 1), `stress: card text not cut at ${width}`, JSON.stringify(r));
}

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
