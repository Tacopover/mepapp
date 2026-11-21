// B7-T05 variants and audits: drain, electrical (no unit), old summary, long names, keyboard Tab, tag title, repeated actions.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';
import { WIDTHS, kit } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-lib.mjs';

const t = await open();
const { page, check, idle } = t;
await t.start();
const { uuids, summaries, building } = await setup(t);
const k = kit(t);
const log = (...a) => console.log('LOG', ...a);
const clone = (o) => JSON.parse(JSON.stringify(o));
const W3 = [WIDTHS[0], WIDTHS[2]];

// ---------- drain ----------
{
  const b = clone(building);
  b.risers[0].networkTypeId = 'sanitary-waste';
  b.risers[0].networkType = { ...b.risers[0].networkType, id: 'sanitary-waste', name: 'Sanitary Waste', discipline: 'plumbing', flowUnit: 'l/s' };
  for (const { w, h } of W3) {
    await page.setViewportSize({ width: w, height: h });
    await k.loadState(b, summaries, uuids);
    await k.openRisers();
    log(`DRAIN ${w} cap=`, await k.capText());
    log(`DRAIN ${w} box`, JSON.stringify(await k.box()), 'fold', JSON.stringify(await k.fold()));
    const tag = k.dlg.getByText('Not a design flow', { exact: true });
    const n = await tag.count();
    log(`DRAIN ${w} tag count`, n, 'title=', n ? JSON.stringify(await tag.first().getAttribute('title')) : '-', 'tabindex=', n ? await tag.first().getAttribute('tabindex') : '-');
    await k.snap(`V-drain-${w}`);
    await k.close();
  }
}

// ---------- electrical, no unit ----------
{
  const b = clone(building);
  b.risers[0].networkTypeId = 'power-230';
  const nt = { ...b.risers[0].networkType, id: 'power-230', name: 'Power 230 V', discipline: 'electrical' };
  delete nt.flowUnit;
  b.risers[0].networkType = nt;
  for (const { w, h } of W3) {
    await page.setViewportSize({ width: w, height: h });
    await k.loadState(b, summaries, uuids);
    await k.openRisers();
    log(`ELEC ${w} cap=`, await k.capText());
    log(`ELEC ${w} box`, JSON.stringify(await k.box()), 'fold', JSON.stringify(await k.fold()));
    await k.snap(`V-elec-${w}`);
    await k.close();
  }
}

// ---------- old summary (riserNetworks deleted) ----------
{
  const old = JSON.parse(summaries[1]);
  delete old.riserNetworks;
  for (const { w, h } of W3) {
    await page.setViewportSize({ width: w, height: h });
    await k.loadState(building, [summaries[0], JSON.stringify(old), summaries[2]], uuids);
    await k.openRisers();
    log(`OLD ${w} cap=`, await k.capText());
    log(`OLD ${w} warnings`, (await k.text()).split('\n').filter((l) => /summar/i.test(l)).join(' | '));
    log(`OLD ${w} box`, JSON.stringify(await k.box()));
    await k.snap(`V-old-${w}`);
    await k.close();
  }
}

// ---------- long names ----------
{
  const b = clone(building);
  b.risers[0].name = 'R'.repeat(80);
  const words = ['Mechanical plant room level with a very long name for test one', 'Technical level above the parking garage and loading dock area', 'Roof level with the cooling towers and the air handling units'];
  b.levels.forEach((l, i) => { l.name = words[i].slice(0, 60); });
  for (const { w, h } of WIDTHS) {
    await page.setViewportSize({ width: w, height: h });
    await k.loadState(b, [summaries[0], null, summaries[2]], uuids);
    await k.openRisers();
    log(`LONG ${w} cap=`, await k.capText());
    log(`LONG ${w} box`, JSON.stringify(await k.box()), 'fold', JSON.stringify(await k.fold()));
    const over = await page.evaluate(() => {
      const d = document.querySelector('.mep-modal');
      const bad = [];
      for (const e of d.querySelectorAll('*')) {
        if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible' && e.clientWidth > 0) bad.push(`${e.tagName}.${(e.className || '').toString().slice(0, 30)} ${e.scrollWidth}>${e.clientWidth}`);
      }
      return { dialogScrollW: d.scrollWidth, dialogClientW: d.clientWidth, bad: bad.slice(0, 8) };
    });
    log(`LONG ${w} overflow`, JSON.stringify(over));
    await k.snap(`V-long-${w}`);
    await k.close();
  }
}

// ---------- keyboard Tab through the pane (at-least state, 1600) ----------
{
  await page.setViewportSize({ width: 1600, height: 1000 });
  await k.loadState(building, [summaries[0], null, summaries[2]], uuids);
  await k.openRisers();
  await k.dlg.getByRole('tab', { name: /^Risers/ }).focus();
  const seq = [];
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press('Tab');
    const d = await page.evaluate(() => {
      const e = document.activeElement;
      if (!e) return 'none';
      const r = e.getBoundingClientRect();
      return `${e.tagName.toLowerCase()}[${e.getAttribute('role') ?? ''}] "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40)}" y=${Math.round(r.top)}`;
    });
    seq.push(d);
  }
  log('TAB sequence', JSON.stringify(seq, null, 1));
  await k.snap('V-tab-end');
  await k.close();
}

// ---------- repeated and wrong-order actions ----------
{
  await page.setViewportSize({ width: 1600, height: 1000 });
  const noSource = JSON.parse(summaries[0]);
  noSource.riserNetworks[0].hasSource = false;
  await k.loadState(building, [JSON.stringify(noSource), summaries[1], summaries[2]], uuids);
  await k.openRisers();
  const sethand = () => k.dlg.getByText(/^(Set by hand|Use the flow solve)$/).locator('visible=true').first();
  const out = [];
  for (let i = 0; i < 3; i++) {
    await sethand().scrollIntoViewIfNeeded();
    await sethand().click();
    await idle(300);
    const sel = k.dlg.getByRole('combobox', { name: 'Source level' });
    const has = (await sel.count()) > 0;
    let cap = '';
    if (has) {
      await sel.selectOption({ label: i % 2 === 0 ? 'Level 2' : 'Level 0' });
      await idle(500);
      cap = (await k.capText()).split('Direction')[0];
    }
    out.push(`round ${i}: selects=${has} cap=${cap}`);
    await sethand().click(); // back to the flow solve
    await idle(500);
    out.push(`round ${i} after "Use the flow solve": ${(await k.capText()).slice(0, 140)}`);
    await sethand().click().catch(() => {});
    await idle(300);
    // pick the "From the flow solve" option (empty selection)
    const sel2 = k.dlg.getByRole('combobox', { name: 'Source level' });
    if ((await sel2.count()) > 0) {
      await sel2.selectOption({ label: 'From the flow solve' });
      await idle(400);
      out.push(`round ${i} select "From the flow solve": ${(await k.capText()).slice(0, 140)}`);
    }
  }
  log('REPEAT', JSON.stringify(out, null, 1));
  await k.snap('V-repeat-end');
  await k.close();
}

// ---------- double click on "Read summaries now" ----------
{
  await page.setViewportSize({ width: 1600, height: 1000 });
  await k.loadState(building, [summaries[0], null, summaries[2]], uuids);
  await k.openRisers();
  const link = k.dlg.getByRole('button', { name: 'Read summaries now' }).locator('visible=true');
  await link.scrollIntoViewIfNeeded();
  await link.dblclick();
  await idle(3000);
  log('DBLCLICK cap=', await k.capText());
  log('DBLCLICK text tail', (await k.text()).split('\n').slice(-6).join(' | '));
  await k.snap('V-dblclick');
  await k.close();
}
await t.finish();
