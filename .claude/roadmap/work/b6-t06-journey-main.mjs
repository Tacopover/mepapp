import { setup, EDIT, sizeOf, NAMES9, widths } from './b6-t06-journey-lib.mjs';
const h = await setup();
const { page, dlg, check } = h;
const log = (...a) => console.log('LOG', ...a);
const P = 'plan.pdf';
const prompt = () => dlg.locator('[data-testid="changed-confirm"]');
const yes = () => dlg.locator('[data-testid="changed-confirm-yes"]');
const cancel = () => dlg.locator('[data-testid="changed-confirm-cancel"]');
const promptText = async (ms = 6000) => { for (let i = 0; i < ms / 250 && (await prompt().count()) === 0; i++) await page.waitForTimeout(250); return (await prompt().count()) === 0 ? null : (await prompt().first().innerText()).trim(); };
const rows = () => dlg.locator('[data-testid="open-sheet"]');
const smallJson = (id) => h.buildingJson(id, [h.sheet('s1', 'l1', P, 0, 'plan L1'), h.sheet('s2', 'l2', P, 0, 'plan L2')]);
const fullJson = (id) => h.buildingJson(id, NAMES9.map((n, i) => h.sheet('s' + i, i < 5 ? 'l1' : 'l2', n, 0, `Sheet ${i + 1} ${n.slice(0, 30)}`)));
const box = async (loc) => { const b = await loc.boundingBox().catch(() => null); return b ? `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}` : 'none'; };
const bodyScroll = async () => dlg.locator('.mep-modal-body, .mep-buildings-body, .mep-sheets').first().evaluate((e) => e.scrollTop).catch(() => -1);
async function sc(name, fn) { try { await fn(); } catch (e) { check(false, `${name} script error`, String(e).split('\n').slice(0, 2).join(' ')); } await h.closeDialog(); }
async function fillStore(names, edited) { for (const n of names) await h.putPdf(n, edited.includes(n) ? EDIT : ''); }

for (const w of widths) {
  await page.setViewportSize({ width: w, height: 1000 });
  const T = (s) => `b6-t06-j-${w}-${s}`;
  log('=== WIDTH', w);

  // G1 picker path, small, empty-ish start (nothing stored)
  await sc(`G1-picker-${w}`, async () => {
    await h.restart(); await h.putPdf(P, EDIT); await h.openBuilding(smallJson('g1' + w));
    await h.nextFiles([P]);
    let clicks = 0;
    await rows().first().click(); clicks++;
    const p = await promptText(); log('G1 prompt', JSON.stringify(p));
    await h.shot(T('g1-prompt'));
    log('G1 focus', await h.focusInfo(), 'prompt box', await box(prompt()), 'yes', await box(yes()), 'cancel', await box(cancel()), 'overflow', await h.overflow());
    log('G1 prompt role', await prompt().first().getAttribute('role'));
    await page.keyboard.press('Enter'); // does Enter confirm?
    await page.waitForTimeout(1500);
    const n = await h.notice();
    log('G1 after Enter: prompt count', await prompt().count(), 'notice', JSON.stringify(n), 'rows', JSON.stringify(await h.rowButtons()));
    if ((await prompt().count()) > 0) { await yes().click(); clicks++; await h.waitNotice((x) => x.includes('Using')); log('G1 notice after click', JSON.stringify(await h.notice())); }
    log('G1 clicks', clicks);
    await h.shot(T('g1-done'));
    log('G1 modal still open', await dlg.count());
  });

  // G1 Esc on prompt
  await sc(`G1-esc-${w}`, async () => {
    await h.restart(); await h.putPdf(P, EDIT); await h.openBuilding(smallJson('g1e' + w));
    await h.nextFiles([P]);
    await rows().first().click();
    await promptText();
    await page.keyboard.press('Escape'); await page.waitForTimeout(800);
    log('G1 Esc: dialog open', await dlg.count(), 'prompt', await prompt().count());
    if ((await dlg.count()) > 0) { await h.shot(T('g1-after-esc')); log('G1 Esc row lines', JSON.stringify(await h.sheetsText())); }
  });

  // G1 stored handle, full building, one edited PDF; Open click
  await sc(`G1-stored-full-${w}`, async () => {
    await h.restart(); await fillStore(NAMES9, []);
    await h.openBuilding(fullJson('g1f' + w));
    await h.nextFiles(NAMES9);
    const rb = await h.rowButtons(); log('full rows before', JSON.stringify(rb.slice(0, 3)));
    await dlg.locator('[data-testid="reconnect-pdfs"]').click();
    await page.waitForTimeout(2500);
    await h.shot(T('g1f-after-reconnect-first'));
    log('full notice', JSON.stringify(await h.notice()), 'pdf rows', JSON.stringify(await h.rowButtons()));
    await h.closeDialog();
    await h.restart({ perm: 'granted' });
    await h.putPdf(NAMES9[0], EDIT);
    await h.openBuilding(fullJson('g1f' + w));
    await h.shot(T('g1f-band-restart'));
    log('full band/hints after restart', JSON.stringify((await dlg.locator('.mep-sheet-hint, [data-testid="sheets-notice"]').allInnerTexts()).slice(0, 3)), 'rows', JSON.stringify((await h.rowButtons()).slice(0, 4)));
    const pickBefore = await h.pickCalls();
    await rows().first().click();
    const p = await promptText(); log('G1f prompt', JSON.stringify(p), 'focus', await h.focusInfo());
    await h.shot(T('g1f-prompt'));
    log('G1f prompt box', await box(prompt()), 'yes', await box(yes()), 'cancel', await box(cancel()), 'overflow', await h.overflow(), 'picker calls', (await h.pickCalls()) - pickBefore);
    await yes().click();
    await h.waitNotice((x) => x.includes('Using'));
    log('G1f notice', JSON.stringify(await h.notice()));
    await h.shot(T('g1f-done'));
  });

  // G2: 9 PDFs, 3 edited, Reconnect (files)
  await sc(`G2-${w}`, async () => {
    await h.restart(); const ed = NAMES9.slice(0, 3); await fillStore(NAMES9, ed);
    await h.openBuilding(fullJson('g2' + w));
    await h.shot(T('g2-start'));
    log('G2 band text', JSON.stringify((await dlg.locator('.mep-sheet-hint, [data-testid="sheets-notice"]').allInnerTexts()).slice(0, 2)), 'button', JSON.stringify(await dlg.locator('[data-testid="reconnect-pdfs"]').innerText()));
    await h.nextFiles(NAMES9);
    await dlg.locator('[data-testid="reconnect-pdfs"]').click();
    const p = await promptText(); log('G2 prompt', JSON.stringify(p));
    await h.shot(T('g2-prompt'));
    log('G2 prompt box', await box(prompt()), 'yes', await box(yes()), 'cancel', await box(cancel()), 'focus', await h.focusInfo(), 'overflow', await h.overflow());
    await yes().click();
    await h.waitNotice((x) => x.includes('Using'));
    log('G2 notice', JSON.stringify(await h.notice()), 'rows', JSON.stringify(await h.rowButtons()));
    await h.shot(T('g2-done'));
  });

  // G2 folder: Allow access button
  await sc(`G2-folder-${w}`, async () => {
    await h.restart(); const ed = NAMES9.slice(0, 3); await fillStore(NAMES9, ed);
    await h.setTrees({ Plans: { files: NAMES9.map((name) => ({ name })), dirs: {} } });
    await h.openBuilding(fullJson('g2f' + w));
    await h.nextFolder('Plans');
    await dlg.locator('[data-testid="allow-pdf-folder"]').click();
    const p = await promptText(); log('G2f prompt', JSON.stringify(p));
    await h.shot(T('g2f-prompt'));
    await yes().click();
    await h.waitNotice((x) => x.includes('Using'));
    log('G2f notice', JSON.stringify(await h.notice()));
    await h.shot(T('g2f-done'));
  });

  // G3: cancel; repeat 3 times
  await sc(`G3-${w}`, async () => {
    await h.restart(); const ed = NAMES9.slice(0, 3); await fillStore(NAMES9, ed);
    await h.openBuilding(fullJson('g3' + w));
    await h.nextFiles(NAMES9);
    await dlg.locator('[data-testid="reconnect-pdfs"]').click();
    await promptText();
    await cancel().click(); await page.waitForTimeout(800);
    log('G3 notice after cancel', JSON.stringify(await h.notice()));
    log('G3 hints', JSON.stringify((await dlg.locator('.mep-sheet-hint, [data-testid="sheet-hint"]').allInnerTexts()).slice(0, 4)));
    log('G3 band', JSON.stringify((await dlg.locator('.mep-sheets-band, [data-testid="sheets-band"]').allInnerTexts())));
    await h.shot(T('g3-cancelled'));
    // repeat 3 times on row 1 (changed): cancel, cancel, cancel
    for (let i = 0; i < 3; i++) {
      await h.nextFiles([NAMES9[0]]);
      await rows().first().click();
      const pt = await promptText();
      log('G3 repeat', i, 'prompt', JSON.stringify(pt), 'rows0', JSON.stringify((await h.rowButtons())[0]));
      if (i < 2) { await cancel().click(); await page.waitForTimeout(400); }
    }
    await h.shot(T('g3-repeat3'));
    // different row while prompt open
    await h.nextFiles([NAMES9[1]]);
    await rows().nth(1).click(); await page.waitForTimeout(1200);
    log('G3 second row pick: prompt', JSON.stringify(await promptText(2000)), 'count', await prompt().count());
    await h.shot(T('g3-second-row'));
    await yes().click(); await page.waitForTimeout(1500);
    log('G3 yes second: notice', JSON.stringify(await h.notice()), 'rows', JSON.stringify((await h.rowButtons()).slice(0, 4)));
  });

  // G4: page lost
  await sc(`G4-${w}`, async () => {
    await h.restart(); const C = 'arch_simple_A4.pdf';
    await h.putFile('lost.pdf', C, EDIT);
    const sh = (id, pg) => ({ id, levelId: 'l1', projectUuid: null, pageIndex: pg, displayName: `lost p${pg + 1}`, location: { fileName: 'lost.pdf', sizeBytes: sizeOf(C) } });
    await h.openBuilding(h.buildingJson('g4' + w, [sh('a', 0), sh('b', 3)]));
    await h.nextFiles(['lost.pdf']);
    await rows().first().click();
    const p = await promptText(); log('G4 prompt', JSON.stringify(p));
    await h.shot(T('g4-prompt'));
    await yes().click(); await h.waitNotice((x) => x.startsWith('Opened'));
    log('G4 notice', JSON.stringify(await h.notice()));
    await rows().nth(1).click(); await page.waitForTimeout(1500);
    log('G4 click page-4 row: notice', JSON.stringify(await h.notice()), 'hints', JSON.stringify(await h.sheetsText()));
    await h.shot(T('g4-lostrow'));
  });

  // G5: different file same name, much different size
  await sc(`G5-${w}`, async () => {
    await h.restart(); await h.putFile(P, '00_arch_ground_floor_w_rooms.pdf');
    await h.openBuilding(smallJson('g5' + w));
    await h.nextFiles([P]);
    await rows().first().click();
    const p = await promptText(); log('G5 prompt (other doc, same name)', JSON.stringify(p));
    await h.shot(T('g5-prompt'));
    log('G5 relink prompt present?', await dlg.getByText('different document').count());
  });

  // Empty state: building no sheets; and building with all files present
  await sc(`G6-${w}`, async () => {
    await h.restart(); await h.openBuilding(h.buildingJson('g6' + w, []));
    await h.shot(T('g6-empty'));
    log('G6 empty: reconnect btn', await dlg.locator('[data-testid="reconnect-pdfs"]').count(), 'prompt', await prompt().count());
  });
}
await h.t.finish();
