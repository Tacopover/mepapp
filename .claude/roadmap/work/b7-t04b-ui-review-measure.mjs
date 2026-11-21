// B7-T04b UI review: measure the riser block and the segment hint in the Properties dock at dock widths 420, 280 and 720.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';
import { findClipped } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/layout-measure.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t04b/';
const t = await open();
const { page, check, idle } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
const { uuids, summaries, building } = await setup(t);

const pageH = () => page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
async function clickPoint(p, wait = 500) {
  const at = await screenOf(page, p);
  await page.mouse.click(at.x, at.y);
  await idle(wait);
}
const clickFitting = async () => clickPoint({ x: 300, y: (await pageH()) - 300 });
const clickDuct = async () => clickPoint({ x: 375, y: (await pageH()) - 300 });
async function loadBuilding(file, stored) {
  await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(file), stored]);
  await idle(1200);
}
async function setDock(width) {
  const h = page.locator('.mep-resize-handle');
  const box = await h.boundingBox();
  const cur = (await page.locator('.mep-dock').boundingBox()).width;
  const dx = cur - width;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await idle(400);
}
async function shotDock(name) {
  const box = await page.locator('.mep-dock').boundingBox();
  const path = `${SHOTS}ui-review-${name}.png`;
  await page.screenshot({ path, clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 520) } });
  console.log(`SHOT ${path}`);
}

const measure = () =>
  page.evaluate(() => {
    const body = document.querySelector('.mep-dock-body');
    const br = body.getBoundingClientRect();
    const secs = [...body.querySelectorAll('.mep-section')];
    const fitSec = secs[0];
    const risSec = body.querySelector('[data-testid="props-riser-section"]');
    const rect = (e) => {
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { l: Math.round(r.left * 10) / 10, r: Math.round(r.right * 10) / 10, t: Math.round(r.top * 10) / 10, b: Math.round(r.bottom * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
    };
    const lines = (el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    };
    const cs = (e, props) => {
      if (!e) return null;
      const c = getComputedStyle(e);
      return Object.fromEntries(props.map((p) => [p, c[p]]));
    };
    const rowInfo = (sec) =>
      sec
        ? [...sec.querySelectorAll('.mep-field-row')].map((row) => {
            const label = row.querySelector('label');
            const ctl = row.querySelector('input, select, .mep-field-text');
            return { label: label?.textContent?.trim(), labelL: rect(label)?.l, ctlR: rect(ctl)?.r, ctlL: rect(ctl)?.l, ctlW: rect(ctl)?.w, ctlLines: ctl && ctl.classList.contains('mep-field-text') ? lines(ctl) : null, rowH: rect(row)?.h, rowT: rect(row)?.t };
          })
        : null;
    const overflow = [];
    for (const el of body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > br.right + 0.5 || r.left < br.left - 0.5) overflow.push(`${el.tagName} "${(el.textContent || '').trim().slice(0, 30)}" leaves the body ${Math.round(r.left - br.left)}..${Math.round(r.right - br.right)}`);
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') overflow.push(`${el.tagName} cut "${(el.textContent || '').trim().slice(0, 30)}"`);
    }
    const hints = risSec ? [...risSec.querySelectorAll('.mep-hint')].map((h) => ({ rect: rect(h), text: h.textContent })) : [];
    const h4 = risSec?.querySelector('h4');
    const tag = risSec?.querySelector('.mep-rp-tag');
    const spans = risSec ? [...risSec.querySelectorAll('.mep-field-text')] : [];
    const disabledInput = fitSec?.querySelector('input:disabled');
    return {
      dockW: rect(document.querySelector('.mep-dock')).w,
      bodyW: br.width,
      bodyScrollW: body.scrollWidth,
      bodyScrollH: body.scrollHeight,
      bodyClientH: body.clientHeight,
      fitRows: rowInfo(fitSec),
      risRows: rowInfo(risSec),
      fitSec: rect(fitSec),
      risSec: rect(risSec),
      h4: h4 ? { rect: rect(h4), lines: lines(h4), text: h4.textContent, title: h4.getAttribute('title'), cs: cs(h4, ['fontSize', 'color', 'opacity', 'lineHeight']) } : null,
      tag: tag ? { rect: rect(tag), cs: cs(tag, ['fontSize', 'color', 'marginBottom', 'textTransform']) } : null,
      hints,
      hintCs: cs(risSec?.querySelector('.mep-hint'), ['fontSize', 'color', 'opacity', 'marginBottom']),
      spanCs: cs(spans[0], ['fontSize', 'color', 'opacity', 'borderBottomStyle', 'borderBottomColor']),
      spanTitles: spans.map((s) => s.getAttribute('title')),
      disabledCs: cs(disabledInput, ['fontSize', 'color', 'opacity', 'borderBottomStyle']),
      labelCs: cs(risSec?.querySelector('label'), ['fontSize', 'color']),
      bg: getComputedStyle(body).backgroundColor,
      bgSec: getComputedStyle(fitSec ?? body).backgroundColor,
      overflow,
    };
  });

const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const parse = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const contrast = (fg, bg, opacity) => {
  const f = parse(fg);
  const b = parse(bg);
  const mix = f.map((v, i) => v * opacity + b[i] * (1 - opacity));
  const l1 = lum(mix);
  const l2 = lum(b);
  return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
};

// states
const all = { [uuids[0]]: summaries[0], [uuids[1]]: summaries[1], [uuids[2]]: summaries[2] };
const big = JSON.parse(summaries[2]);
big.riserNetworks[0].terminalCapacity = 11845.67;
big.savedAt = new Date(Date.now() + 9000).toISOString();
const bigStored = JSON.stringify(big);
const noSource = JSON.parse(summaries[0]);
noSource.riserNetworks[0].hasSource = false;
noSource.savedAt = new Date(Date.now() + 5000).toISOString();
const twoSrc = JSON.parse(summaries[2]);
twoSrc.riserNetworks[0].hasSource = true;
twoSrc.savedAt = new Date(Date.now() + 8000).toISOString();
const longNames = JSON.parse(JSON.stringify(building));
longNames.levels.forEach((l, i) => (l.name = `Level ${i} - ${'Main technical floor with plant rooms and very long name '.repeat(2)}`.slice(0, 80)));
longNames.risers[0].name = 'R1 ' + 'Ventilation supply riser for the north wing '.repeat(2).slice(0, 77);
const fire = JSON.parse(JSON.stringify(building));
fire.risers[0].networkType.discipline = 'fireProtection';
const noUnit = JSON.parse(JSON.stringify(building));
delete noUnit.risers[0].networkType.flowUnit;
const drain = JSON.parse(JSON.stringify(building));
drain.risers[0].networkTypeId = 'sanitary-drain';
drain.risers[0].networkType = { ...drain.risers[0].networkType, id: 'sanitary-drain', name: 'Sanitary Drain', discipline: 'plumbing' };
const loadAt = JSON.parse(JSON.stringify(building));
const STATES = [
  ['known', building, all],
  ['atleast-big', building, { [uuids[1]]: summaries[1], [uuids[2]]: bigStored }],
  ['nosource', building, { ...all, [uuids[0]]: JSON.stringify(noSource) }],
  ['twosources', building, { ...all, [uuids[2]]: JSON.stringify(twoSrc) }],
  ['longnames', longNames, all],
  ['fire', fire, all],
  ['nounit', noUnit, all],
];

await page.locator('.mep-doc-switcher-btn').click();
await idle(200);
await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: 'l1.pdf' }).first().click();
await idle(1500);
await page.locator('button.mep-rail-btn[title="Select"]').click();
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(400);

const results = {};
for (const width of [420, 280, 720]) {
  await setDock(width);
  console.log('DOCK', width, (await page.locator('.mep-dock').boundingBox()).width);
  for (const [name, b, stored] of STATES) {
    await loadBuilding(b, stored);
    await clickFitting();
    const m = await measure();
    results[`${name}-${width}`] = m;
    const bgv = 'rgb(255, 255, 255)';
    console.log(`\n== ${name} @ dock ${m.dockW} (body ${m.bodyW}, scrollW ${m.bodyScrollW}) overflow=${JSON.stringify(m.overflow)}`);
    console.log(' fit rows', JSON.stringify(m.fitRows.map((r) => [r.label, r.labelL, r.ctlR])));
    console.log(' ris rows', JSON.stringify(m.risRows?.map((r) => [r.label, r.labelL, r.ctlR, r.ctlW, 'lines', r.ctlLines])));
    console.log(' h4', JSON.stringify(m.h4), ' tag', JSON.stringify(m.tag));
    console.log(' hints', JSON.stringify(m.hints.map((h) => [h.rect.t, h.rect.b, h.rect.h])), 'sec', JSON.stringify(m.risSec), 'fitSec', JSON.stringify(m.fitSec));
    if (name === 'known' && width === 420) {
      console.log(' CSS', JSON.stringify({ span: m.spanCs, dis: m.disabledCs, hint: m.hintCs, label: m.labelCs, bg: bgv }));
      console.log(' contrast span(no opacity)', contrast(m.spanCs.color, bgv, 1), ' disabled input (opacity)', contrast(m.disabledCs.color, bgv, parseFloat(m.disabledCs.opacity)), ' hint', contrast('rgb(87, 103, 111)', bgv, 1), ' label', contrast(m.labelCs.color, bgv, 1));
    }
    await shotDock(`${name}-d${width}`);
  }
}
await setDock(420);

// the drain case (the id of the type decides), fitting
await loadBuilding(drain, all);
await clickFitting();
const dm = await measure();
console.log('\n== drain', JSON.stringify({ tag: dm.tag, hints: dm.hints.map((h) => h.text), main: dm.risRows?.map((r) => r.label) }));
await shotDock('drain-d420');

// segment hint at 420 and 280
await loadBuilding(building, all);
await clickDuct();
for (const width of [420, 280]) {
  await setDock(width);
  const seg = await page.evaluate(() => {
    const body = document.querySelector('.mep-dock-body');
    const hint = body.querySelector('[data-testid="props-segment-riser-hint"]');
    const rows = [...body.querySelectorAll('.mep-field-row')].map((r) => [r.querySelector('label')?.textContent, Math.round(r.getBoundingClientRect().top), Math.round(r.getBoundingClientRect().bottom)]);
    const h = hint?.getBoundingClientRect();
    const cs = hint ? getComputedStyle(hint) : null;
    return { hint: hint?.textContent, rect: h && { t: Math.round(h.top), b: Math.round(h.bottom), l: Math.round(h.left), r: Math.round(h.right) }, mb: cs?.marginBottom, rows, scrollW: body.scrollWidth, clientW: body.clientWidth };
  });
  console.log('SEGMENT hint @', width, JSON.stringify(seg));
  await shotDock(`segment-d${width}`);
}
await setDock(420);

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
