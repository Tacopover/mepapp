// B2-T07: the scope dialog of Export quantities. Real clicks on the radio buttons and Export; the xlsx is read from OPFS.
import { open } from '../browser/lib.mjs';
import { makeTwoDocuments, buildingOf, loadBuildingWithSummaries, recordSuggestedNames, openScopeDialog, exportScope, dialog } from './b2-lib.mjs';

const t = await open();
const { page, check, shot, idle } = t;
await t.start();
await recordSuggestedNames(t);

const { ground, first } = await makeTwoDocuments(t);

// 1. No building open: Level and Building are disabled with a hint; the document scope still works.
await openScopeDialog(t);
const radios = dialog(t).locator('input[type=radio]');
check((await radios.count()) === 4, 'four radio buttons', String(await radios.count()));
check(await radios.nth(0).isEnabled() && await radios.nth(1).isEnabled(), 'This sheet and This document are enabled');
check(await radios.nth(2).isDisabled() && await radios.nth(3).isDisabled(), 'Level and Building are disabled with no building');
check(/Open a building first/i.test(await dialog(t).innerText()), 'hint "Open a building first" shown');
check(await radios.nth(1).isChecked(), 'This document is the default');
await shot('B2-T07-dialog-nobuilding');
await dialog(t).locator('button', { hasText: /^Cancel$/ }).click();
await idle(300);
check((await dialog(t).count()) === 0, 'Cancel closes the dialog');

const doc = await exportScope(t, 'document');
check(doc.xlsx.sheetNames.includes('Segments'), 'document scope: Segments sheet', JSON.stringify(doc.xlsx.sheetNames));
check(doc.xlsx.sheets.Segments?.[0]?.[0] !== 'Building', 'document scope has no provenance columns', JSON.stringify(doc.xlsx.sheets.Segments?.[0]));
check(doc.suggested === 'first-quantities.xlsx', 'document scope file name', String(doc.suggested));
const sheetScope = await exportScope(t, 'sheet');
check(sheetScope.xlsx.sheets.Segments?.length === 2, 'sheet scope: one segment row on the current page', JSON.stringify(sheetScope.xlsx.sheets.Segments));

// 2. A building is open: the dialog enables Level and Building.
await loadBuildingWithSummaries(t, buildingOf(ground, first));
await openScopeDialog(t);
check(await radios.nth(2).isEnabled() && await radios.nth(3).isEnabled(), 'Level and Building are enabled with a building');
check(!/Open a building first/i.test(await dialog(t).innerText()), 'no hint with a building');
await radios.nth(2).check();
const options = await dialog(t).locator('select[aria-label="Level"] option').allInnerTexts();
check(JSON.stringify(options.map((s) => s.trim())) === JSON.stringify(['Level 0', 'Level 1']), 'level select lists the levels', JSON.stringify(options));
await shot('B2-T07-dialog');
await dialog(t).locator('button', { hasText: /^Cancel$/ }).click();
await idle(300);

const level = await exportScope(t, 'level', 'Level 0');
const lseg = level.xlsx.sheets.Segments ?? [];
check(JSON.stringify(lseg[0]?.slice(0, 4)) === JSON.stringify(['Building', 'Level', 'Sheet', 'Document']), 'level scope: first headers', JSON.stringify(lseg[0]));
check(lseg.length === 2 && lseg[1][1] === 'Level 0' && lseg[1][2] === 'Ground' && lseg[1][3] === 'ground.pdf', 'level scope: only the Level 0 row', JSON.stringify(lseg));
check(level.suggested === 'Tower-Level 0-quantities.xlsx', 'level scope file name', String(level.suggested));

const whole = await exportScope(t, 'building');
const bseg = whole.xlsx.sheets.Segments ?? [];
check(JSON.stringify(bseg[0]?.slice(0, 4)) === JSON.stringify(['Building', 'Level', 'Sheet', 'Document']), 'building scope: first headers', JSON.stringify(bseg[0]));
check(bseg.length === 3 && bseg[1][1] === 'Level 0' && bseg[2][1] === 'Level 1', 'building scope: rows of both levels', JSON.stringify(bseg));
check(whole.suggested === 'Tower-all-quantities.xlsx', 'building scope file name', String(whole.suggested));
console.log('building sheets:', JSON.stringify(whole.xlsx.sheetNames), 'status:', whole.status);
check(whole.xlsx.sheetNames[0] === 'Segments', 'sheet names start with Segments', JSON.stringify(whole.xlsx.sheetNames));

// The open document counts from the live scene: add a second segment and do not save.
await (await import('./b2-lib.mjs')).drawSegmentWithTool(t, { x: 300, y: 400 }, { x: 500, y: 400 });
const live = await exportScope(t, 'building');
check((live.xlsx.sheets.Segments ?? []).length === 4, 'unsaved segment of the open document counts', JSON.stringify((live.xlsx.sheets.Segments ?? []).length));

check(t.errors.length === 0, 'no page errors', JSON.stringify(t.errors.slice(0, 3)));
await t.finish();
