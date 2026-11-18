import { setup, EDIT, sizeOf, NAMES9 } from './b6-t06-journey-lib.mjs';
const h = await setup();
const { page, dlg, check } = h;
const log = (...a) => console.log('LOG', ...a);
const prompt = () => dlg.locator('[data-testid="changed-confirm"]');
const yes = () => dlg.locator('[data-testid="changed-confirm-yes"]');
const cancel = () => dlg.locator('[data-testid="changed-confirm-cancel"]');
const promptText = async (ms = 6000) => { for (let i = 0; i < ms / 250 && (await prompt().count()) === 0; i++) await page.waitForTimeout(250); return (await prompt().count()) === 0 ? null : (await prompt().first().innerText()).trim(); };
const rows = () => dlg.locator('[data-testid="open-sheet"]');
const fullJson = (id) => h.buildingJson(id, NAMES9.map((n, i) => h.sheet('s' + i, i < 5 ? 'l1' : 'l2', n, 0, `Sheet ${i + 1}`)));
async function sc(name, fn) { try { await fn(); } catch (e) { check(false, `${name} script error`, String(e).split('\n').slice(0, 2).join(' ')); } await h.closeDialog(); }
const w = 1600;
await page.setViewportSize({ width: w, height: 1000 });
const T = (s) => `b6-t06-j-${w}-${s}`;

await sc('G4', async () => {
  await h.restart();
  await h.putFile('lost.pdf', 'arch_simple_A4.pdf', EDIT);
  const sh = (id, pg) => ({ id, levelId: 'l1', projectUuid: null, pageIndex: pg, displayName: `lost p${pg + 1}`, location: { fileName: 'lost.pdf', sizeBytes: sizeOf('lost.pdf') } });
  await h.openBuilding(h.buildingJson('g4', [sh('a', 0), sh('b', 3)]));
  await h.nextFiles(['lost.pdf']);
  await rows().first().click();
  log('G4 prompt', JSON.stringify(await promptText()));
  await h.shot(T('g4-prompt'));
  await yes().click(); await h.waitNotice((x) => x.startsWith('Opened'));
  log('G4 notice after yes', JSON.stringify(await h.notice()), 'rows', JSON.stringify(await h.rowButtons()));
  await rows().nth(1).click(); await page.waitForTimeout(2000);
  log('G4 click page-4 row: notice', JSON.stringify(await h.notice()), 'hints', JSON.stringify(await h.sheetsText()), 'rows', JSON.stringify(await h.rowButtons()));
  await h.shot(T('g4-lostrow'));
  await rows().nth(1).click(); await page.waitForTimeout(1500);
  log('G4 click page-4 again: notice', JSON.stringify(await h.notice()));
});

await sc('G3b stale notice', async () => {
  await h.restart(); await h.putPdf(NAMES9[0], EDIT); await h.putPdf(NAMES9[1], EDIT);
  for (const n of NAMES9.slice(2)) await h.putPdf(n);
  await h.openBuilding(fullJson('g3b'));
  await h.nextFiles(NAMES9);
  await dlg.locator('[data-testid="reconnect-pdfs"]').click();
  await promptText();
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  log('G3b Esc on band prompt: dialog', await dlg.count(), 'prompt', await prompt().count(), 'notice', JSON.stringify((await h.notice() ?? '').slice(0, 80)));
  await h.nextFiles([NAMES9[0]]);
  await rows().first().click(); await promptText();
  await h.shot(T('g3b-prompt-with-old-notice'));
  await yes().click(); await page.waitForTimeout(2500);
  log('G3b after Yes: notice', JSON.stringify(await h.notice()), 'rows', JSON.stringify((await h.rowButtons()).slice(0, 3)));
  await h.shot(T('g3b-after-yes'));
});

await sc('G7 other name', async () => {
  await h.restart(); await h.putFile('other-name.pdf', 'arch_simple_A4.pdf', '\n%x\n'); await h.putPdf('plan.pdf');
  await h.openBuilding(h.buildingJson('g7', [h.sheet('s1', 'l1', 'plan.pdf', 0, 'plan L1')]));
  await h.nextFiles(['other-name.pdf']);
  await rows().first().click(); await page.waitForTimeout(2500);
  log('G7 prompt?', await prompt().count(), 'notice', JSON.stringify(await h.notice()), 'rows', JSON.stringify(await h.rowButtons()), 'dlg text relink', await dlg.getByText('Relink').count());
  await h.shot(T('g7-other-name'));
});

await sc('G8 picker cancel', async () => {
  await h.restart(); await h.putPdf('plan.pdf', EDIT);
  await h.openBuilding(h.buildingJson('g8', [h.sheet('s1', 'l1', 'plan.pdf', 0, 'plan L1')]));
  await page.evaluate(() => { window.__pickCancel = true; });
  await rows().first().click(); await page.waitForTimeout(1200);
  log('G8 picker cancelled: notice', JSON.stringify(await h.notice()), 'prompt', await prompt().count());
  await page.evaluate(() => { window.__pickCancel = false; });
  await h.nextFiles(['plan.pdf']);
  // keyboard only: focus row button, Enter, then Enter on prompt
  await rows().first().focus(); await page.keyboard.press('Enter');
  await promptText();
  log('G8 keyboard focus on prompt', await h.focusInfo());
  await page.keyboard.press('Tab'); log('G8 Tab ->', await h.focusInfo());
  await page.keyboard.press('Enter'); await page.waitForTimeout(1000);
  log('G8 Enter on Cancel: prompt', await prompt().count(), 'dlg', await dlg.count(), 'focus', await h.focusInfo());
});

await sc('G9 notice length 760', async () => {
  await page.setViewportSize({ width: 760, height: 1000 });
  await h.restart(); for (const n of NAMES9) await h.putPdf(n, EDIT);
  await h.openBuilding(fullJson('g9'));
  await h.nextFiles(NAMES9);
  await dlg.locator('[data-testid="reconnect-pdfs"]').click();
  await promptText();
  await h.shot('b6-t06-j-760-g9-prompt9');
  log('G9 prompt', JSON.stringify(await promptText()));
  await cancel().click(); await page.waitForTimeout(800);
  await h.shot('b6-t06-j-760-g9-cancel-notice');
  log('G9 notice', JSON.stringify(await h.notice()));
});
await h.t.finish();
