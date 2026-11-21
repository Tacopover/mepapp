// UI review B7-T05 part 2: contrast (light, dark), keyboard, failure feedback of the link "Read summaries now".
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-ui-review-setup.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t05/';
const t = await open();
const { page, check, idle, menu, until, statusText } = t;
await t.start();
const snap = async (name) => {
  const path = `${SHOTS}ui-${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};
const { baseBuilding, building, summaries, loadState, uuids } = await setup(t);
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
async function closeDialog() {
  await page.keyboard.press('Escape');
  await idle(500);
}

// contrast of the new classes
const contrastProbe = () =>
  page.evaluate(() => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const p = m[1].split(',').map((x) => parseFloat(x));
      return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
    };
    const bgOf = (el) => {
      const layers = [];
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] >= 1) break;
      }
      let base = [255, 255, 255];
      for (const l of layers.reverse()) base = [0, 1, 2].map((i) => l[i] * l[3] + base[i] * (1 - l[3]));
      return base;
    };
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; };
    const targets = {
      subhead: '[data-testid="riser-capacity"] .mep-rp-subhead',
      tag: '.mep-rp-tag',
      main: '[data-testid="riser-capacity-main"]',
      total: '[data-testid="riser-capacity-total"]',
      rowLevels: '.mep-rp-cap-levels',
      rowValue: '.mep-rp-cap-value',
      rowUnknown: '.mep-rp-cap-value--unknown',
      hint: '[data-testid="riser-capacity"] .mep-hint',
      link: '[data-testid="riser-read-summaries"]',
    };
    const out = {};
    for (const [k, sel] of Object.entries(targets)) {
      const el = document.querySelector(sel);
      if (!el) { out[k] = null; continue; }
      const cs = getComputedStyle(el);
      const fg = parse(cs.color);
      const bg = bgOf(el);
      const fgBlend = [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
      out[k] = { color: cs.color, bg: bg.map(Math.round).join(','), ratio: ratio(fgBlend, bg), size: cs.fontSize };
    }
    out.bodyBg = getComputedStyle(document.body).backgroundColor;
    return out;
  });

// state: at least + unknown mix needs two probes; the link exists only in "at least"
await loadState(building, [summaries[0], null, summaries[2]]);
await showRisers();
console.log('CONTRAST light atleast', JSON.stringify(await contrastProbe()));
await snap('contrast-light');
await page.emulateMedia({ colorScheme: 'dark' });
await idle(600);
console.log('CONTRAST dark atleast', JSON.stringify(await contrastProbe()));
await snap('contrast-dark');
await page.emulateMedia({ colorScheme: 'light' });
await idle(300);
await closeDialog();
// unknown state for the muted row colour
{
  const noSource = JSON.parse(summaries[0]);
  noSource.riserNetworks[0].hasSource = false;
  await loadState(building, [JSON.stringify(noSource), summaries[1], summaries[2]]);
  await showRisers();
  console.log('CONTRAST light unknown', JSON.stringify(await contrastProbe()));
  await closeDialog();
}
{
  const elec = baseBuilding();
  elec.risers[0].networkType = { ...elec.risers[0].networkType, discipline: 'electrical' };
  await loadState(elec, summaries);
  await showRisers();
  console.log('CONTRAST light notdesign', JSON.stringify(await contrastProbe()));
  await closeDialog();
}

// keyboard: Tab from the Risers tab through the info panel
await loadState(building, [summaries[0], null, summaries[2]]);
await page.setViewportSize({ width: 1100, height: 800 });
await showRisers();
await dlg.getByRole('tab', { name: /^Risers/ }).focus();
const order = [];
for (let i = 0; i < 40; i++) {
  await page.keyboard.press('Tab');
  await idle(60);
  const d = await page.evaluate(() => {
    const e = document.activeElement;
    if (!e) return null;
    const cs = getComputedStyle(e);
    return {
      tag: e.tagName.toLowerCase(),
      id: e.getAttribute('data-testid') || '',
      text: (e.getAttribute('aria-label') || e.textContent || e.value || '').trim().slice(0, 28),
      cls: String(e.className).slice(0, 30),
      outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
      shadow: cs.boxShadow === 'none' ? '' : cs.boxShadow.slice(0, 40),
      inDialog: !!e.closest('.mep-modal'),
    };
  });
  order.push(d);
  if (d && d.id === 'riser-read-summaries') {
    await snap('kbd-link-focus');
  }
  if (d && !d.inDialog) break;
}
console.log('TAB ORDER', JSON.stringify(order.map((d) => d && `${d.tag}:${d.id || d.text}${d.cls.includes('cap-list') ? '[CAPLIST]' : ''}`)));
const linkFocus = order.find((d) => d && d.id === 'riser-read-summaries');
console.log('LINK FOCUS style', JSON.stringify(linkFocus));
check(order.some((d) => d && d.id === 'riser-read-summaries'), 'the link is reachable with Tab');
check(!order.some((d) => d && d.cls.includes('cap-list')), 'the cap list is NOT a tab stop (informational)', '');
// Enter on the link via keyboard
{
  await page.locator('[data-testid="riser-read-summaries"]').focus();
  await page.keyboard.press('Enter');
  await idle(300);
  const label = await page.locator('[data-testid="riser-read-summaries"]').innerText().catch(() => '(gone)');
  console.log('AFTER Enter: link label', label, 'focus now', await page.evaluate(() => `${document.activeElement?.tagName}:${document.activeElement?.getAttribute('data-testid') || document.activeElement?.className}`));
  await until(async () => (await page.locator('[data-testid="riser-read-summaries"]').count()) === 0, 'link gone', 30000).catch(() => {});
  await idle(1500);
  console.log('AFTER done: focus', await page.evaluate(() => `${document.activeElement?.tagName}:${document.activeElement?.getAttribute('data-testid') || document.activeElement?.className}`));
  await snap('kbd-after-enter');
  // is the notice inside the visible clip box?
  const vis = await page.evaluate(() => {
    const n = document.querySelector('.mep-buildings-status');
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, text: n.textContent };
  });
  console.log('NOTICE after kbd', JSON.stringify(vis));
}
await closeDialog();

// failure: the PDF of level 1 is gone; the summary of level 1 is missing
{
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('l1.pdf');
  });
  await loadState(building, [summaries[0], null, summaries[2]]);
  await page.setViewportSize({ width: 1100, height: 800 });
  await showRisers();
  const link = page.locator('[data-testid="riser-read-summaries"]');
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await until(async () => !/Reading…/.test(await page.locator('[data-testid="riser-read-summaries"]').innerText().catch(() => '')), 'run ends', 30000);
  await idle(1500);
  const info = await page.evaluate(() => {
    const n = document.querySelector('.mep-buildings-status');
    const r = n?.getBoundingClientRect();
    const hs = [...document.querySelectorAll('[data-testid="riser-capacity-hint"]')].map((e) => e.textContent);
    return { notice: n?.textContent ?? null, role: n?.getAttribute('role'), noticeTop: r && Math.round(r.top), noticeBottom: r && Math.round(r.bottom), vh: innerHeight, hints: hs, linkLabel: document.querySelector('[data-testid="riser-read-summaries"]')?.textContent ?? null, linkDisabled: document.querySelector('[data-testid="riser-read-summaries"]')?.disabled ?? null, cls: n?.className };
  });
  console.log('FAILURE feedback', JSON.stringify(info), 'status bar:', await statusText());
  await snap('failure-feedback-1100');
  // header notice position at 1600
  await page.setViewportSize({ width: 1600, height: 1000 });
  await idle(400);
  await snap('failure-feedback-1600');
  await page.setViewportSize({ width: 760, height: 900 });
  await idle(400);
  await snap('failure-feedback-760');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await closeDialog();
}
await t.finish();
