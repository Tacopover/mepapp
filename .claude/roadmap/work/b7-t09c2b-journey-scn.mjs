// Scenario runner: setup a building, read the Risers tab at 3 widths, read the Properties riser block.
import { begin } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-journey-lib.mjs';

export async function runScenario({ tag, specs, type, expect, widths = [1600, 1100, 760], longNames = false }) {
  const j = await begin(specs, type);
  const { page, dlg, snap, openRisersTab, closeDialog, dlgLines, idle, check, overflow, activate, clickFittingOnCanvas } = j;
  const heights = { 1600: 1000, 1100: 900, 760: 900 };
  const size = async (w) => {
    await page.setViewportSize({ width: w, height: heights[w] });
    await idle(600);
  };
  if (longNames) {
    await page.evaluate(async () => {
      const b = JSON.parse(JSON.stringify(window.__mepBuilding.store ? await window.__mepBuilding.store.readBuilding?.() ?? null : null));
      void b;
    }).catch(() => {});
  }
  const capLines = async () => {
    const lines = await dlgLines();
    const a = lines.indexOf('Capacity');
    const b = lines.indexOf('Flow direction');
    return lines.slice(a, b < 0 ? undefined : b);
  };
  await openRisersTab();
  const out = {};
  for (const w of widths) {
    await size(w);
    const lines = await capLines();
    out[w] = lines;
    console.log(`CAP ${tag} ${w}`, JSON.stringify(lines));
    if (w === widths[0]) {
      if (expect.cap) check(JSON.stringify(lines) === JSON.stringify(expect.cap), `${tag} ${w}: capacity part equals the spec`, JSON.stringify(lines));
      if (expect.mustNot) check(!lines.some((l) => expect.mustNot.test(l)), `${tag} ${w}: no line matches ${expect.mustNot}`, JSON.stringify(lines));
      if (expect.main) check(lines.includes(expect.main), `${tag} ${w}: ${expect.main}`, JSON.stringify(lines));
    }
    await snap(`${tag}-${w}-risers`);
    await overflow(`${tag} ${w}`);
  }
  await size(1600);
  await closeDialog();
  // the Properties riser block
  for (const w of widths) {
    await size(w);
    await activate('l1.pdf');
    await clickFittingOnCanvas();
    const block = await page.evaluate(() => {
      const row = (label) => [...document.querySelectorAll('.mep-field-row')].find((r) => (r.querySelector('label, .mep-field-label')?.textContent ?? r.textContent).trim().toLowerCase().startsWith(label));
      const rows = [...document.querySelectorAll('.mep-field-row')].map((r) => r.textContent.trim());
      const hints = [...document.querySelectorAll('[data-testid="props-riser-hint"]')].map((e) => e.textContent.trim());
      const cut = [...document.querySelectorAll('.mep-field-row, [data-testid="props-riser-hint"], [data-testid^="props-riser"]')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim().slice(0, 50));
      void row;
      return { rows, hints, cut };
    });
    console.log(`PROPS ${tag} ${w}`, JSON.stringify(block));
    if (w === widths[0] && expect.propsMain) {
      check(block.rows.some((r) => r.replace(/\s+/g, ' ').endsWith(expect.propsMain) && /main level/i.test(r)), `${tag} Properties: Main level reads "${expect.propsMain}"`, JSON.stringify(block.rows));
      if (expect.propsHintRe) check(block.hints.some((h) => expect.propsHintRe.test(h)), `${tag} Properties: hint matches ${expect.propsHintRe}`, JSON.stringify(block.hints));
      if (expect.propsNoHint) check(block.hints.length === 0, `${tag} Properties: no hint`, JSON.stringify(block.hints));
    }
    check(block.cut.length === 0, `${tag} ${w}: Properties riser block not cut`, JSON.stringify(block.cut));
    await snap(`${tag}-${w}-properties`);
  }
  check(j.errors.length === 0, 'no page errors', j.errors.join(' | '));
  await j.t.finish();
}
