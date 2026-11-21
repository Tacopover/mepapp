// Helpers for the B7-T05 journey checks. Finds controls by visible label only.
import { SHOTS } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';

export const WIDTHS = [
  { w: 1600, h: 1000 },
  { w: 1100, h: 900 },
  { w: 760, h: 900 },
];

export function kit(t) {
  const { page, idle, menu } = t;
  const dlg = page.locator('.mep-modal');
  const snap = async (name) => {
    const path = `${SHOTS}journey-${name}.png`;
    await page.screenshot({ path });
    console.log(`SHOT ${path}`);
  };
  const loadState = async (building, summariesByIndex, uuids) => {
    const sm = {};
    summariesByIndex.forEach((s, i) => { if (s !== null && s !== undefined) sm[uuids[i]] = s; });
    await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(building), sm]);
    await idle(600);
  };
  // step 1 = menu click, step 2 = tab click. Returns the step count used.
  const openRisers = async () => {
    await menu('Manage Buildings…');
    await dlg.waitFor({ state: 'visible', timeout: 8000 });
    await idle(500);
    await dlg.getByRole('tab', { name: /^Risers/ }).click();
    await idle(1200);
    return 2;
  };
  const close = async () => {
    await page.keyboard.press('Escape');
    await idle(500);
  };
  const text = () => dlg.innerText();
  const box = () => dlg.boundingBox();
  // The text of the Capacity block: from the subhead to the "Set by hand" link.
  const capText = async () => {
    const all = await text();
    const i = all.indexOf('\nCapacity');
    if (i < 0) return '(no Capacity block) ' + all.slice(-300).replace(/\n/g, ' | ');
    let j = all.indexOf('\nSet by hand', i);
    if (j < 0) j = all.indexOf('\nDelete riser', i);
    if (j < 0) j = i + 700;
    return all.slice(i + 1, j).replace(/\n/g, ' | ');
  };
  // Where is each control relative to the scrolling pane that holds the Capacity block?
  const fold = async () =>
    page.evaluate(() => {
      const labels = ['Capacity', 'Read summaries now', 'Set by hand', 'More details', 'Delete riser'];
      const dialog = document.querySelector('.mep-modal');
      const find = (txt) => {
        const els = [...dialog.querySelectorAll('button, a, h1, h2, h3, h4, h5, div, span, p, label, legend')].filter((e) => e.children.length === 0 && (e.textContent || '').trim() === txt);
        return els[0] ?? null;
      };
      const cap = find('Capacity');
      if (!cap) return { error: 'no Capacity block' };
      let p = cap.parentElement;
      let scroller = null;
      while (p && p !== dialog.parentElement) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1) { scroller = p; break; }
        p = p.parentElement;
      }
      const out = { scroller: scroller ? { cls: scroller.className, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight, scrollbarWidth: scroller.offsetWidth - scroller.clientWidth } : null, items: {} };
      const vh = window.innerHeight;
      for (const l of labels) {
        const e = find(l);
        if (!e) { out.items[l] = 'absent'; continue; }
        const r = e.getBoundingClientRect();
        const sr = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: vh };
        out.items[l] = r.bottom > sr.bottom + 1 || r.bottom > vh ? 'HIDDEN below fold' : 'visible';
      }
      return out;
    });
  return { dlg, snap, loadState, openRisers, close, text, box, capText, fold };
}

export const longName = (n, tag) => (tag + ' ' + 'x'.repeat(n)).slice(0, n);
