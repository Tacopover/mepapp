// Layout measurement helpers for the ui-reviewer and the journey-tester. Each function takes a Playwright `page` and returns plain data.
// Use inside a check script: import { measureRows, findClipped, sectionOrder, stability, widths } from '<worktree>/.claude/roadmap/browser/layout-measure.mjs';
// All selectors are CSS selectors inside the page. Pass the root of the dialog, for example '.mep-modal'.

export const widths = [
  { w: 1600, h: 1000 },
  { w: 1100, h: 800 },
  { w: 760, h: 640 },
];

/** Run `fn` at each width. fn gets (width, height). Returns the list of results with the width. */
export async function atWidths(page, fn, sizes = widths) {
  const out = [];
  for (const { w, h } of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    out.push({ width: w, result: await fn(w, h) });
  }
  return out;
}

/**
 * Column edges of the rows of one list. `rowSel` matches the rows. `cellSel` matches the cells of a row, in order (CSS, relative to the row: use ':scope > *' for the grid children).
 * Returns { rows, columns: [{ index, lefts, rights, leftSpread, rightSpread }], problems: [text] }.
 * A column with a left edge spread above `tol` px is a problem: the rows do not line up.
 */
export async function measureRows(page, rowSel, cellSel = ':scope > *', tol = 1) {
  return page.evaluate(
    ([rowSel, cellSel, tol]) => {
      const rows = [...document.querySelectorAll(rowSel)].filter((r) => r.getBoundingClientRect().width > 0);
      const cells = rows.map((r) => [...r.querySelectorAll(cellSel)].map((c) => c.getBoundingClientRect()));
      const n = Math.max(0, ...cells.map((c) => c.length));
      const columns = [];
      const problems = [];
      for (let i = 0; i < n; i++) {
        const lefts = cells.filter((c) => c[i]).map((c) => Math.round(c[i].left));
        const rights = cells.filter((c) => c[i]).map((c) => Math.round(c[i].right));
        const leftSpread = Math.max(...lefts) - Math.min(...lefts);
        const rightSpread = Math.max(...rights) - Math.min(...rights);
        columns.push({ index: i, lefts, rights, leftSpread, rightSpread });
        if (leftSpread > tol) problems.push(`column ${i}: left edges differ by ${leftSpread} px`);
      }
      const counts = new Set(cells.map((c) => c.length));
      if (counts.size > 1) problems.push(`rows have different cell counts: ${[...counts].join(', ')}`);
      return { rows: rows.length, columns, problems };
    },
    [rowSel, cellSel, tol],
  );
}

/** Controls and text that leave the root box, or that are cut (scrollWidth above clientWidth with no ellipsis). Returns a list of texts. */
export async function findClipped(page, rootSel = '.mep-modal') {
  return page.evaluate((rootSel) => {
    const root = document.querySelector(rootSel);
    if (!root) return ['no root: ' + rootSel];
    const box = root.getBoundingClientRect();
    const bad = [];
    for (const el of root.querySelectorAll('button, input, select, textarea, label, span, p, h1, h2, h3, h4, li')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const name = `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || el.value || '').trim().slice(0, 30)}"`;
      if (r.left < box.left - 1 || r.right > box.right + 1) bad.push(`${name} leaves the dialog sideways`);
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible' && cs.textOverflow !== 'ellipsis' && ['BUTTON', 'LABEL', 'SPAN', 'P'].includes(el.tagName)) {
        bad.push(`${name} is cut with no ellipsis`);
      }
      if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && !el.title && !el.closest('[title]')) {
        bad.push(`${name} has an ellipsis and no tooltip`);
      }
    }
    return bad;
  }, rootSel);
}

/** Section boxes in order: { title, top, height, width }. `sectionSel` matches the section; `titleSel` the title inside it. */
export async function sectionOrder(page, sectionSel = 'section', titleSel = 'h4, h3') {
  return page.evaluate(
    ([s, t]) =>
      [...document.querySelectorAll(s)]
        .filter((e) => e.getBoundingClientRect().height > 0)
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { title: (e.querySelector(t)?.textContent ?? '').trim(), top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width) };
        }),
    [sectionSel, titleSel],
  );
}

/** Box of the root (the dialog) now. Call before and after an action: compare top and height. */
export async function rootBox(page, rootSel = '.mep-modal') {
  return page.evaluate((s) => {
    const r = document.querySelector(s)?.getBoundingClientRect();
    return r ? { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) } : null;
  }, rootSel);
}

/** Texts of the items of a list, in order. Call before and after a select: the order must not change. */
export async function listTexts(page, itemSel) {
  return page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => (e.textContent ?? '').trim().slice(0, 60)), itemSel);
}

/** Every visible control with its label, tooltip, disabled state and box. Use it for the dead-control audit. */
export async function listControls(page, rootSel = '.mep-modal') {
  return page.evaluate((s) => {
    const root = document.querySelector(s) ?? document.body;
    return [...root.querySelectorAll('button, [role="button"], [role="menuitem"], input, select, textarea, a[href], [role="tab"], [role="treeitem"]')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
      })
      .map((e) => ({
        tag: e.tagName.toLowerCase(),
        role: e.getAttribute('role') ?? '',
        label: (e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || '').trim().slice(0, 40),
        title: e.getAttribute('title') ?? '',
        disabled: e.disabled === true || e.getAttribute('aria-disabled') === 'true',
      }));
  }, rootSel);
}
