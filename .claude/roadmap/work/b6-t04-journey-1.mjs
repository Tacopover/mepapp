// B6-T04 journey tester, goals 1 and 2 (first start, restart + open 3 sheets) and 6 (Risers Go to after restart).
import { setup, widths } from './b6-t04-journey-lib.mjs';
const h = await setup();
const { page, dlg, shot, idle, log } = h;
const ALLPLANS = (list) => ({ Plans: { files: list.map((f) => ({ name: f.name, src: f.src })), dirs: {} } });

for (const w of widths) {
  const H = w === 760 ? 700 : 900;
  await page.setViewportSize({ width: w, height: H });
  const tag = `b6-t04-journey-1-${w}`;
  log('=========== width', w, 'x', H);
  for (const r of [...new Set(h.nine.map((f) => f.src))]) await h.putPdf(r);
  for (const r of [...new Set(h.tenFiles.map((f) => f.src))]) await h.putPdf(r);
  for (const f of h.nine) await h.putPdf(f.name, f.src);
  for (const f of h.tenFiles) await h.putPdf(f.name, f.src);
  await h.setTrees({ Plans: ALLPLANS(h.nine).Plans, Big: ALLPLANS(h.tenFiles).Plans });
  await h.cancelPick(false);
  await h.dirCancel(false);

  // ---- G1a: first start, 9 PDFs, user chooses Reconnect PDFs… with all 9 files (1 click + pick) ----
  const aJson = h.bjson(`a${w}`, h.nineSheets());
  await h.restart();
  await h.openBuilding(aJson);
  await h.dumpBand('G1a first start');
  log('G1a notice vis', await h.noticeVis(), 'allow tooltip:', await h.allowBtn().getAttribute('title'));
  await shot(`${tag}-g1a-first-start`);
  await h.next(h.nine.map((f) => f.name));
  await h.filesClick();
  await idle(1200);
  log('G1a after Reconnect: notice', JSON.stringify(await h.notice()), 'vis', await h.noticeVis());
  await h.dumpBand('G1a after reconnect');
  await shot(`${tag}-g1a-after-reconnect`);
  await h.closeDialog();
  // restart: saved files, no folder (T-B)
  await h.restart();
  await h.openBuilding(aJson);
  await h.dumpBand('G1a restart (no folder)');
  await shot(`${tag}-g1a-restart-tb`);
  let opened = 0;
  for (const f of h.nine.slice(0, 3)) {
    await h.bySheetBtn(f.name).click();
    const n = await h.waitNotice((x) => /Opened|Could not|not the same|Access/.test(x), 6000);
    opened++;
    log('G1a open', f.name, '->', JSON.stringify(n), '| file questions so far', await h.reqCalls(), 'folder questions', await h.freqCalls(), 'picks', await h.pickCalls());
  }
  await h.dumpBand('G1a after 3 single opens');
  // now the folder button (picker) as the band says
  await h.nextFolder('Plans');
  await h.allowClick();
  log('G1a after folder pick: notice', JSON.stringify(await h.waitNotice((x) => x.startsWith('Found'))), 'vis', await h.noticeVis(), 'folderPicks', await h.dirPicks());
  await h.dumpBand('G1a after folder pick');
  await shot(`${tag}-g1a-after-folder`);
  await h.closeDialog();

  // ---- G1b + G2: first start with the folder button; restart; open 3 sheets with one folder permission ----
  const bJson = h.bjson(`b${w}`, h.nineSheets());
  await h.restart();
  await h.openBuilding(bJson);
  await h.nextFolder('Plans');
  await h.allowClick();
  log('G1b folder pick: notice', JSON.stringify(await h.waitNotice((x) => x.startsWith('Found'))), '| band', await h.hint(), '| rows', JSON.stringify(await h.counts()));
  await h.closeDialog();
  await h.restart();
  await h.openBuilding(bJson);
  await h.dumpBand('G2 restart (T-C)');
  log('G2 allow tooltip:', await h.allowBtn().getAttribute('title'), '| reconnect tooltip:', await h.reconnectBtn().getAttribute('title'));
  await shot(`${tag}-g2-restart-tc`);
  await h.allowClick();
  log('G2 after band click: notice', JSON.stringify(await h.waitNotice((x) => x.startsWith('Found'))), 'vis', await h.noticeVis(), '| folder q', await h.freqCalls());
  await h.dumpBand('G2 after band click');
  await shot(`${tag}-g2-after-allow`);
  let g2clicks = 1;
  for (const f of h.nine.slice(0, 3)) {
    await h.bySheetBtn(f.name).click(); g2clicks++;
    await idle(1500);
    log('G2 open', f.name, '->', JSON.stringify(await h.notice()), '| folder q', await h.freqCalls(), 'file q', await h.reqCalls(), 'dlg', await dlg.count());
  }
  log('G2 clicks to open 3 sheets after restart (band path):', g2clicks, '(spec 4 after the dialog open, plus 1 chrome click "View files")');
  await shot(`${tag}-g2-three-opened`);
  await h.closeDialog();

  // ---- G2 alt: restart, click Open on a row first (J2) ----
  await h.restart();
  await h.openBuilding(bJson);
  await h.bySheetBtn(h.nine[4].name).click();
  log('G2 row-first: notice', JSON.stringify(await h.waitNotice((x) => /Opened/.test(x))), 'vis', await h.noticeVis(), '| band', await h.hint(), '| folder q', await h.freqCalls(), 'file q', await h.reqCalls());
  await shot(`${tag}-g2-row-first`);
  await h.closeDialog();

  // ---- full state: 30 sheets, 10 PDFs, 80 char names ----
  const fJson = h.bjson(`f${w}`, h.fullSheets(), [h.riser('s0', 'l1', 's1', 'l2')]);
  await h.restart();
  await h.openBuilding(fJson);
  await h.dumpBand('FULL first start');
  await shot(`${tag}-full-first-start`);
  await h.nextFolder('Big');
  await h.allowClick();
  log('FULL folder pick: notice', JSON.stringify(await h.waitNotice((x) => x.startsWith('Found'))), 'vis', await h.noticeVis());
  await shot(`${tag}-full-after-pick`);
  await h.closeDialog();
  await h.restart();
  await h.openBuilding(fJson);
  await h.dumpBand('FULL restart');
  await shot(`${tag}-full-restart`);
  await h.allowClick();
  log('FULL band click: notice', JSON.stringify(await h.waitNotice((x) => x.startsWith('Found'))), 'vis', await h.noticeVis());
  for (const f of h.tenFiles.slice(0, 3)) {
    await h.bySheetBtn(f.name).click();
    await idle(1500);
    log('FULL open', f.name.slice(0, 30), '->', JSON.stringify((await h.notice())?.slice(0, 120)), 'vis', await h.noticeVis());
  }
  await shot(`${tag}-full-three-opened`);
  await h.closeDialog();

  // ---- G6: Risers tab, Go to after restart ----
  await h.restart();
  await h.openBuilding(fJson);
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(700);
  await shot(`${tag}-g6-risers-restart`);
  log('G6 band on Risers tab:', JSON.stringify(await h.hint()), '| Go to buttons', await dlg.getByRole('button', { name: /^Go to/ }).count());
  await dlg.getByRole('button', { name: /^Go to/ }).first().click();
  await idle(1800);
  log('G6 Go to #1 ->', JSON.stringify(await h.notice()), '| vis', await h.noticeVis(), '| folder q', await h.freqCalls(), 'file q', await h.reqCalls(), 'picks', await h.pickCalls(), 'dlg', await dlg.count());
  await shot(`${tag}-g6-goto`);
  if ((await dlg.count()) === 1) {
    for (let i = 0; i < 2; i++) {
      await dlg.getByRole('button', { name: /^Go to/ }).nth(i).click().catch(() => {});
      await idle(1800);
      log('G6 Go to repeat', i, '->', JSON.stringify(await h.notice()), '| folder q', await h.freqCalls(), 'dlg', await dlg.count());
    }
    await h.closeDialog().catch(() => {});
  }
  // G6 variant: folder denied
  await h.restart({ fans: 'denied' });
  await h.openBuilding(fJson);
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(700);
  await h.cancelPick(true);
  await dlg.getByRole('button', { name: /^Go to/ }).first().click();
  await idle(1800);
  log('G6 denied Go to ->', JSON.stringify(await h.notice()), '| vis', await h.noticeVis(), 'picks', await h.pickCalls(), 'dlg', await dlg.count());
  await shot(`${tag}-g6-denied`);
  await h.cancelPick(false);
  await h.closeDialog().catch(() => {});
}
await h.finish();
