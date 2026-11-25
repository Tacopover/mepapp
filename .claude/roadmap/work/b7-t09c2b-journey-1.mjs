// Journey 1 (J1, J2, J3 second path): Example 5, no equipment, at 1600 / 1100 / 760 px.
import { begin } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-journey-lib.mjs';
const j = await begin();
const { page, dlg, snap, openRisersTab, closeDialog, dlgLines, idle, check, overflow, activate, clickFittingOnCanvas } = j;
const H = { 1600: 1000, 1100: 900, 760: 900 };
const size = async (w) => {
  await page.setViewportSize({ width: w, height: H[w] });
  await idle(600);
};
const capLines = async () => {
  const lines = await dlgLines();
  const a = lines.indexOf('Capacity');
  const b = lines.indexOf('Flow direction');
  return lines.slice(a, b < 0 ? undefined : b);
};
const expected = [
  'Capacity',
  'Main level: not known yet (no source level)',
  'Connected total: 750 m³/h (no concurrency factor)',
  'Level 0 to Level 1',
  'at most 650 m³/h',
  'Level 1 to Level 2',
  'at most 600 m³/h',
  'No source level yet. Each span shows the largest flow for any source position.',
  'Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0.',
  'Place source equipment on a level, or click Set by hand and choose a main level.',
];

// step 1 and 2: open Manage Buildings, open tab Risers
let steps = 0;
await openRisersTab();
steps += 2;
for (const w of [1600, 1100, 760]) {
  await size(w);
  const lines = await capLines();
  check(JSON.stringify(lines) === JSON.stringify(expected), `J1 ${w}: text of the capacity part equals the spec`, JSON.stringify(lines));
  await snap(`j1-${w}-risers`);
  await overflow(`J1 ${w}`);
  // is "Set by hand" visible without scrolling?
  const vis = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.mep-modal button')].find((b) => /^Set by hand$/.test(b.textContent.trim()));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const modal = document.querySelector('.mep-modal').getBoundingClientRect();
    // find the nearest scrolling ancestor
    let p = btn.parentElement;
    let sc = null;
    while (p && p !== document.body) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 1) { sc = p; break; }
      p = p.parentElement;
    }
    const sr = sc ? sc.getBoundingClientRect() : modal;
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), viewH: window.innerHeight, scrollerBottom: Math.round(sr.bottom), scrollable: !!sc, hiddenBelowFold: r.bottom > sr.bottom };
  });
  console.log('SETBYHAND-VISIBILITY', w, JSON.stringify(vis));
  if (vis && vis.hiddenBelowFold) {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.mep-modal button')].find((b) => /^Set by hand$/.test(b.textContent.trim()));
      btn.scrollIntoView({ block: 'end' });
    });
    await idle(300);
    await snap(`j1-${w}-risers-scrolled`);
    await page.evaluate(() => { document.querySelectorAll('.mep-modal *').forEach((e) => { if (e.scrollTop) e.scrollTop = 0; }); });
  }
}
await size(1600);

// J3 second path: Set by hand, choose a level, Use the flow solve; 3 times in a row
for (let round = 1; round <= 3; round++) {
  await dlg.getByRole('button', { name: 'Set by hand' }).click();
  await idle(700);
  if (round === 1) {
    console.log('AFTER-SETBYHAND', JSON.stringify(await capLines()));
    console.log('BUTTONS', JSON.stringify(await dlg.getByRole('button').allInnerTexts()));
    console.log('COMBOS', await dlg.getByRole('combobox').count());
    await snap('j3-selects-shown');
  }
  const combo = dlg.getByLabel('Source level');
  const options = await combo.locator('option').allInnerTexts();
  if (round === 1) console.log('OPTIONS', JSON.stringify(options));
  await combo.selectOption({ label: round === 2 ? 'Level 1' : 'Level 0' });
  await idle(1200);
  const lines = await capLines();
  console.log(`ROUND ${round}`, JSON.stringify(lines));
  const mainWant = round === 2 ? 'Main level: Level 1' : 'Main level: Level 0';
  check(lines.includes(mainWant), `J3 round ${round}: ${mainWant}`, JSON.stringify(lines));
  check(!lines.some((l) => /at most|No source level yet|Place an air/.test(l)), `J3 round ${round}: plain numbers, no hint`, JSON.stringify(lines));
  if (round === 1) await snap('j3-hand-set-level0');
  if (round === 2) await snap('j3-hand-set-level1');
  const btns = await dlg.getByRole('button').allInnerTexts();
  if (round === 1) console.log('BUTTONS-HANDSET', JSON.stringify(btns));
  await dlg.getByRole('button', { name: /Use the flow solve/i }).click();
  await idle(1200);
  const back = await capLines();
  check(JSON.stringify(back) === JSON.stringify(expected), `J3 round ${round}: Use the flow solve restores the at most view`, JSON.stringify(back));
}
await snap('j3-back-to-solve');
// wrong order: options in the select with the riser not hand-set / empty selection
console.log('BUTTONS-AFTER', JSON.stringify(await dlg.getByRole('button').allInnerTexts()));
await closeDialog();

// J2: Properties riser block at the 3 widths
for (const w of [1600, 1100, 760]) {
  await size(w);
  await activate('l1.pdf');
  await clickFittingOnCanvas();
  const info = await page.evaluate(() => {
    const all = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /Riser R1|Main level|Connected total|No source level/.test(e.textContent || ''));
    return all.map((e) => ({ t: e.textContent.trim().slice(0, 200), sw: e.scrollWidth, cw: e.clientWidth }));
  });
  console.log('PROPS', w, JSON.stringify(info));
  const main = info.find((i) => /^not known yet/.test(i.t));
  check(!!main && main.t === 'not known yet (no source level)', `J2 ${w}: Properties Main level text`, JSON.stringify(info));
  check(info.some((i) => i.t.startsWith('No source level yet. Solved capacity')), `J2 ${w}: hint H4 shown`, JSON.stringify(info));
  check(info.every((i) => i.sw <= i.cw + 1), `J2 ${w}: no text cut in Properties riser block`, JSON.stringify(info.filter((i) => i.sw > i.cw + 1)));
  await snap(`j2-${w}-properties`);
}
check(j.errors.length === 0, 'no page errors', j.errors.join(' | '));
await j.t.finish();
