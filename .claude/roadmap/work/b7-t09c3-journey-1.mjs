// J1 (B7-T09c-3): Example 5, no equipment. Read the Capacity card, find the way to act, click Set by hand, pick Level 0. 1600 / 1100 / 760 px.
import { begin } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c3-journey-lib.mjs';
const j = await begin();
const { page, dlg, snap, openRisersTab, closeDialog, dlgLines, idle, check, overflow } = j;
const H = { 1600: 900, 1100: 900, 760: 900 };
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
const probe = () =>
  page.evaluate(() => {
    const modal = document.querySelector('.mep-modal');
    const mr = modal.getBoundingClientRect();
    const find = (re) => [...modal.querySelectorAll('button, a, [role=button]')].find((b) => re.test(b.textContent.trim()));
    const scrollerOf = (el) => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 1) return p;
        p = p.parentElement;
      }
      return null;
    };
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const sc = scrollerOf(el);
      const sr = sc ? sc.getBoundingClientRect() : mr;
      const topClip = Math.max(sr.top, 0);
      const botClip = Math.min(sr.bottom, window.innerHeight);
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), clipTop: Math.round(topClip), clipBottom: Math.round(botClip), visible: r.top >= topClip - 1 && r.bottom <= botClip + 1, scrollable: !!sc };
    };
    const a = find(/^Set by hand$/);
    const sel = modal.querySelector('select[aria-label="Source level"]') || [...modal.querySelectorAll('select')][0];
    const act = document.activeElement;
    return { setByHand: box(a), selSrc: box(sel), modal: { top: Math.round(mr.top), bottom: Math.round(mr.bottom), h: Math.round(mr.height) }, active: act ? { tag: act.tagName, label: act.getAttribute('aria-label') || act.textContent.trim().slice(0, 30), testid: act.getAttribute('data-testid') } : null };
  });

let steps = 0;
await openRisersTab();
steps += 2; // menu -> Manage Buildings, click tab Risers
for (const w of [1600, 1100, 760]) {
  await size(w);
  const lines = await capLines();
  console.log('CAP', w, JSON.stringify(lines));
  const p = await probe();
  console.log('PROBE', w, JSON.stringify(p));
  check(p.setByHand && p.setByHand.visible, `J1 ${w}: Set by hand visible without scroll`, JSON.stringify(p.setByHand));
  await snap(`j1-${w}-risers`);
  await overflow(`J1 ${w}`);
  const pos = await page.evaluate(() => {
    const modal = document.querySelector('.mep-modal');
    const q = (re) => [...modal.querySelectorAll('button')].find((b) => re.test(b.textContent.trim()));
    const mb = modal.querySelector('.mep-rp-capbox')?.getBoundingClientRect();
    const sh = q(/^Set by hand$/)?.getBoundingClientRect();
    const rs = q(/^Read summaries/)?.getBoundingClientRect();
    return { capboxBottom: mb && Math.round(mb.bottom), setByHandTop: sh && Math.round(sh.top), setByHandLeft: sh && Math.round(sh.left), readSummaries: !!rs };
  });
  console.log('LINKROW', w, JSON.stringify(pos));
}

// act at each width: click Set by hand with the real mouse, check focus and visibility, pick Level 0, then restore
for (const w of [1600, 1100, 760]) {
  await size(w);
  await dlg.getByRole('button', { name: 'Set by hand' }).click();
  await idle(900);
  const p = await probe();
  console.log('AFTER-CLICK', w, JSON.stringify(p));
  check(p.active && /Source level/i.test(p.active.label || ''), `J1 ${w}: focus is on Source level after Set by hand`, JSON.stringify(p.active));
  check(p.selSrc && p.selSrc.visible, `J1 ${w}: Source level select visible after click`, JSON.stringify(p.selSrc));
  await snap(`j1-${w}-after-set-by-hand`);
  console.log('CAP-AFTER', w, JSON.stringify(await capLines()));
  console.log('BTNS', w, JSON.stringify(await dlg.getByRole('button').allInnerTexts()));
  await dlg.getByLabel('Source level').selectOption({ label: 'Level 0' });
  await idle(1200);
  const lines = await capLines();
  console.log('CAP-LEVEL0', w, JSON.stringify(lines));
  check(lines.includes('Main level: Level 0'), `J1 ${w}: Main level: Level 0`, JSON.stringify(lines));
  check(!lines.some((l) => /at most/.test(l)), `J1 ${w}: no at most`, JSON.stringify(lines));
  await snap(`j1-${w}-level0`);
  const btns = await dlg.getByRole('button').allInnerTexts();
  const back = dlg.getByRole('button', { name: /Use the flow solve/i });
  if ((await back.count()) > 0) await back.click();
  await idle(1000);
  console.log('RESTORED', w, JSON.stringify((await capLines()).slice(0, 3)));
}
// repeat 3 times at 1600
await size(1600);
for (let r = 1; r <= 3; r++) {
  await dlg.getByRole('button', { name: 'Set by hand' }).click();
  await idle(600);
  const p = await probe();
  console.log('REPEAT', r, JSON.stringify(p.active), JSON.stringify(p.setByHand));
  await dlg.getByLabel('Source level').selectOption({ label: r === 2 ? 'Level 1' : 'Level 0' });
  await idle(900);
  await dlg.getByRole('button', { name: /Use the flow solve/i }).click();
  await idle(900);
}
await snap('j1-repeat-end');
check(j.errors.length === 0, 'no page errors', j.errors.join(' | '));
console.log('STEPS', steps + 2, '(open dialog+tab = 2, click Set by hand, pick Level 0)');
await j.t.finish();
