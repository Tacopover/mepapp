// B7-T05 journeys J1 (read numbers), J2 ("at least" and fix), J3 (no main level), empty start. 3 widths each.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';
import { WIDTHS, kit } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-lib.mjs';

const t = await open();
const { page, check, idle } = t;
await t.start();
const { uuids, summaries, building } = await setup(t);
const k = kit(t);
const log = (...a) => console.log('LOG', ...a);

// ---------- J1: full state ----------
for (const { w, h } of WIDTHS) {
  await page.setViewportSize({ width: w, height: h });
  await k.loadState(building, summaries, uuids);
  const steps = await k.openRisers();
  await idle(300);
  log(`J1 ${w} steps=${steps} cap=`, await k.capText());
  log(`J1 ${w} box`, JSON.stringify(await k.box()), 'fold', JSON.stringify(await k.fold()));
  await k.snap(`J1-full-${w}`);
  await k.close();
}

// ---------- J2: level 1 has no summary ----------
for (const { w, h } of WIDTHS) {
  await page.setViewportSize({ width: w, height: h });
  await k.loadState(building, [summaries[0], null, summaries[2]], uuids);
  const steps0 = await k.openRisers();
  log(`J2 ${w} before cap=`, await k.capText());
  log(`J2 ${w} before box`, JSON.stringify(await k.box()), 'fold', JSON.stringify(await k.fold()));
  log(`J2 ${w} before warnings:`, (await k.text()).split('\n').filter((l) => /Warning|summary|summaries/i.test(l)).join(' | '));
  await k.snap(`J2-atleast-before-${w}`);
  const link = k.dlg.getByRole('button', { name: 'Read summaries now' }).locator('visible=true');
  const present = await link.count();
  check(present === 1, `J2 ${w}: link "Read summaries now" found by its label`, String(present));
  if (present) {
    await link.scrollIntoViewIfNeeded();
    await link.click();
    const seen = [];
    let shotDuring = false;
    for (let i = 0; i < 80; i++) {
      const tx = await k.text();
      const state = `${/Reading…/.test(tx) ? 'READING' : ''}|${(tx.match(/Read \d+ of \d+ summar[a-z]+\.?|[^\n]*needs to be opened[^\n]*/) ?? [''])[0]}|link=${/Read summaries now/.test(tx)}`;
      if (seen[seen.length - 1] !== state) seen.push(state);
      if (!shotDuring && /Reading…/.test(tx)) { shotDuring = true; await k.snap(`J2-reading-${w}`); }
      await page.waitForTimeout(40);
    }
    log(`J2 ${w} feedback sequence:`, JSON.stringify(seen));
    log(`J2 ${w} after cap=`, await k.capText());
    log(`J2 ${w} after box`, JSON.stringify(await k.box()));
    await k.snap(`J2-atleast-after-${w}`);
  }
  log(`J2 ${w} steps=${steps0 + 1}`);
  await k.close();
}

// ---------- J3: no main level ----------
const noSource = JSON.parse(summaries[0]);
noSource.riserNetworks[0].hasSource = false;
const noSourceStr = JSON.stringify(noSource);
for (const { w, h } of WIDTHS) {
  await page.setViewportSize({ width: w, height: h });
  await k.loadState(building, [noSourceStr, summaries[1], summaries[2]], uuids);
  const steps0 = await k.openRisers();
  log(`J3 ${w} before cap=`, await k.capText());
  log(`J3 ${w} before box`, JSON.stringify(await k.box()), 'fold', JSON.stringify(await k.fold()));
  await k.snap(`J3-unknown-before-${w}`);
  const link = k.dlg.getByText('Set by hand', { exact: true });
  check((await link.count()) === 1, `J3 ${w}: link "Set by hand" found by its label`);
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await idle(500);
  log(`J3 ${w} after Set by hand cap=`, await k.capText());
  await k.snap(`J3-sethand-${w}`);
  const sel = k.dlg.getByRole('combobox', { name: 'Source level' });
  const nsel = await sel.count();
  check(nsel === 1, `J3 ${w}: select "Source level" found by its label`, String(nsel));
  if (nsel) {
    log(`J3 ${w} select options`, JSON.stringify(await sel.locator('option').allInnerTexts()));
    await sel.selectOption({ label: 'Level 0' });
    await idle(1200);
    log(`J3 ${w} after select cap=`, await k.capText());
    log(`J3 ${w} after box`, JSON.stringify(await k.box()));
    await k.snap(`J3-after-${w}`);
  }
  log(`J3 ${w} steps=${steps0 + 2}`);
  await k.close();
}

// ---------- Empty start: no riser ----------
const empty = { ...building, risers: [] };
for (const { w, h } of WIDTHS) {
  await page.setViewportSize({ width: w, height: h });
  await k.loadState(empty, summaries, uuids);
  await k.openRisers().catch((e) => log('empty openRisers', String(e).slice(0, 120)));
  log(`EMPTY ${w} text=`, (await k.text()).replace(/\n/g, ' | ').slice(0, 700));
  log(`EMPTY ${w} box`, JSON.stringify(await k.box()));
  await k.snap(`empty-${w}`);
  await k.close();
}
await t.finish();
