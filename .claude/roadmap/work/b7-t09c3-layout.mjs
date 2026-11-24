// B7-T09c-3: layout checks of the Capacity card (finding M1 of T09c-2b). Called by b7-t09c3-check.mjs while the Risers tab is open on Example 5.
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function layoutChecks({ page, check, idle, snap, rowsText, atMostRows }) {
  const visible = (testId) =>
    page.evaluate((testId) => {
      const el = document.querySelector(`[data-testid="${testId}"]`);
      if (!el) return { found: false };
      const box = el.getBoundingClientRect();
      let clip = { top: 0, bottom: window.innerHeight };
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll|hidden)/.test(style.overflowY)) {
          const r = node.getBoundingClientRect();
          clip = { top: Math.max(clip.top, r.top), bottom: Math.min(clip.bottom, r.bottom) };
        }
      }
      return { found: true, top: box.top, bottom: box.bottom, clipTop: clip.top, clipBottom: clip.bottom, ok: box.top >= clip.top - 1 && box.bottom <= clip.bottom + 1 };
    }, testId);
  for (const width of [1600, 1100, 760]) {
    await page.setViewportSize({ width, height: 900 });
    await idle(600);
    const v = await visible('riser-set-by-hand');
    check(v.found && v.ok, `M1 at ${width} px: the link "Set by hand" is inside the visible part with no scroll`, JSON.stringify(v));
    const row = await visible('riser-capacity-actions');
    check(row.found && row.ok, `M1 at ${width} px: the row of links is visible`, JSON.stringify(row));
    const order = await page.evaluate(() => {
      const total = document.querySelector('[data-testid="riser-capacity-total"]');
      const actions = document.querySelector('[data-testid="riser-capacity-actions"]');
      const list = document.querySelector('[data-testid="riser-capacity-list"]');
      return !!(total && actions && list && total.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING && actions.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    check(order, `M1 at ${width} px: the row of links is under the box and above the list`);
    await snap(`b7-t09c3-card-${width}`);
  }
  await page.setViewportSize({ width: 1100, height: 900 });
  await idle(500);
  // A real click on Set by hand: the focus goes to the list "Source level", the list is visible, Source level is above Direction.
  await page.locator('[data-testid="riser-set-by-hand"]').click();
  await idle(500);
  const focusId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
  check(focusId === 'riser-source-select', 'after Set by hand the focus is on the list "Source level"', String(focusId));
  const sel = await visible('riser-source-select');
  check(sel.found && sel.ok, 'after Set by hand the list "Source level" is visible', JSON.stringify(sel));
  const swapped = await page.evaluate(() => {
    const a = document.querySelector('[data-testid="riser-source-select"]');
    const b = document.querySelector('[data-testid="riser-flow-select"]');
    return !!(a && b && a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  check(swapped, 'the list "Source level" comes before the list "Direction"');
  check((await page.locator('[data-testid="riser-set-by-hand"]').count()) === 0, 'Set by hand is gone once the lists show (no duplicate test id)');
  await snap('b7-t09c3-card-selects-1100');
  await page.locator('[data-testid="riser-use-solve"]').click();
  await idle(900);
  check(sameJson(await rowsText(), atMostRows(650, 600)), 'back to the flow solve: the at most rows return', JSON.stringify(await rowsText()));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await idle(400);
}
