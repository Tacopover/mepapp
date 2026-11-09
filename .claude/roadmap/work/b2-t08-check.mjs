// B2-T08: part check on the two tracked fixtures. Export Level 0 and Building, then remove one PDF from OPFS and export again.
import { open } from '../browser/lib.mjs';
import { makeTwoDocuments, buildingOf, loadBuildingWithSummaries, recordSuggestedNames, exportScope } from './b2-lib.mjs';

const t = await open();
const { page, check, shot } = t;
await t.start();
await recordSuggestedNames(t);

const { ground, first } = await makeTwoDocuments(t);
await loadBuildingWithSummaries(t, buildingOf(ground, first));

const level0 = await exportScope(t, 'level', 'Level 0');
const l = level0.xlsx.sheets.Segments ?? [];
check(l.length === 2 && l[1][1] === 'Level 0' && l[1][3] === 'ground.pdf', 'Level 0 export has only the level 0 row', JSON.stringify(l));
check(!level0.xlsx.sheetNames.includes('Warnings'), 'Level 0 export has no warnings', JSON.stringify(level0.xlsx.sheetNames));

const all = await exportScope(t, 'building');
const b = all.xlsx.sheets.Segments ?? [];
check(b.length === 3 && b[1][1] === 'Level 0' && b[2][1] === 'Level 1', 'Building export has the rows of both levels', JSON.stringify(b));
check(!all.xlsx.sheetNames.includes('Warnings'), 'Building export has no warnings with both PDFs present', JSON.stringify(all.xlsx.sheetNames));

// Remove ground.pdf from OPFS: the PDF is missing, the saved summary still counts (D-B-03).
await page.evaluate(async () => (await navigator.storage.getDirectory()).removeEntry('ground.pdf'));
const gone = await exportScope(t, 'building');
const g = gone.xlsx.sheets.Segments ?? [];
const warn = gone.xlsx.sheets.Warnings ?? [];
check(g.length === 3, 'rows of both levels are still there', JSON.stringify(g));
check(warn.some((r) => /Ground: PDF missing\. Using the summary saved \d{4}-\d{2}-\d{2}\./.test(r[0] ?? '')), 'Warnings sheet has "PDF missing. Using the summary"', JSON.stringify(warn));
check(/warning\(s\): see the Warnings sheet/.test(gone.status), 'status points to the Warnings sheet', gone.status);
await shot('B2-T08-warnings');

check(t.errors.length === 0, 'no page errors', JSON.stringify(t.errors.slice(0, 3)));
await t.finish();
