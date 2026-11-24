// J3 shared body (B7-T09c-3): tag of the Capacity card and of Properties, by riser type.
import { begin, EXAMPLE5 } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c3-journey-lib.mjs';

export async function runJ3(tag, type, expectTag) {
  const j = await begin(EXAMPLE5, type);
  const { page, dlg, snap, openRisersTab, closeDialog, idle, check, overflow, activate, clickFittingOnCanvas } = j;
  await openRisersTab();
  for (const w of [1600, 1100, 760]) {
    await page.setViewportSize({ width: w, height: 900 });
    await idle(700);
    const m = await page.evaluate(() => {
      const modal = document.querySelector('.mep-modal');
      const head = [...modal.querySelectorAll('*')].find((e) => e.children.length <= 3 && /^Capacity/.test((e.textContent || '').trim()) && e.getBoundingClientRect().height < 60 && e.getBoundingClientRect().height > 0);
      const tagEl = [...modal.querySelectorAll('*')].find((e) => e.children.length === 0 && /design (flow|load)/i.test(e.textContent || '') && e.getBoundingClientRect().height < 60 && /rp-tag|tag/.test(e.className + ' ' + (e.parentElement?.className || '')));
      const anyDesign = [...modal.querySelectorAll('*')].filter((e) => e.children.length === 0 && /design (flow|load)/i.test(e.textContent || '')).map((e) => ({ cls: e.className, t: e.textContent.trim(), h: Math.round(e.getBoundingClientRect().height), sw: e.scrollWidth, cw: e.clientWidth, top: Math.round(e.getBoundingClientRect().top), left: Math.round(e.getBoundingClientRect().left), right: Math.round(e.getBoundingClientRect().right) }));
      const h = head ? head.getBoundingClientRect() : null;
      const cap = [...modal.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Capacity');
      const cr = cap ? cap.getBoundingClientRect() : null;
      return { anyDesign, headingTop: cr && Math.round(cr.top), headingLeft: cr && Math.round(cr.left), headClass: head?.className };
    });
    console.log('TAG', tag, w, JSON.stringify(m));
    const tagItem = m.anyDesign.find((e) => e.t === expectTag) ?? m.anyDesign[0];
    check(!!tagItem && tagItem.t === expectTag, `${tag} ${w}: tag text is "${expectTag}"`, JSON.stringify(m.anyDesign));
    check(!tagItem || tagItem.sw <= tagItem.cw + 1, `${tag} ${w}: tag not cut`, JSON.stringify(tagItem));
    check(!tagItem || tagItem.h < 28, `${tag} ${w}: tag on one line (height ${tagItem && tagItem.h})`, JSON.stringify(tagItem));
    check(!tagItem || m.headingTop === null || Math.abs(tagItem.top - m.headingTop) < 12, `${tag} ${w}: tag on the line of the heading Capacity`, `tag top ${tagItem && tagItem.top} heading top ${m.headingTop}`);
    await snap(`j3-${tag}-${w}-card`);
    await overflow(`J3 ${tag} ${w}`);
  }
  await closeDialog();
  // Properties
  for (const w of [1600, 760]) {
    await page.setViewportSize({ width: w, height: 900 });
    await idle(600);
    await activate('l1.pdf');
    await clickFittingOnCanvas();
    const info = await page.evaluate(() => {
      return [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /design (flow|load)|Connected load/i.test(e.textContent || '') && !e.closest('.mep-modal')).map((e) => ({ t: e.textContent.trim(), sw: e.scrollWidth, cw: e.clientWidth, h: Math.round(e.getBoundingClientRect().height) }));
    });
    console.log('PROPS', tag, w, JSON.stringify(info));
    check(info.some((i) => i.t === expectTag), `${tag} ${w}: Properties tag text is "${expectTag}"`, JSON.stringify(info));
    check(info.every((i) => i.sw <= i.cw + 1), `${tag} ${w}: Properties tag not cut`, JSON.stringify(info));
    await snap(`j3-${tag}-${w}-properties`);
  }
  check(j.errors.length === 0, 'no page errors', j.errors.join(' | '));
  await j.t.finish();
}
