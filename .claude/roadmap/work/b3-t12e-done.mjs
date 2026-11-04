import { execFileSync } from 'node:child_process';

const add = (e) => console.log(execFileSync('node', ['.claude/roadmap/ledger.mjs', '--stream', 'buildings', 'add', JSON.stringify(e)], { cwd: '/root/MepApp/.claude/worktrees/buildings-model' }).toString().trim().slice(0, 70));

const shots = [
  ['S-B3-T12a-1', 'B3-T12a', 'Levels sorted by elevation, buildings alphabetical (1)', 'ab66b54590748e27553769e3d347b3a8'],
  ['S-B3-T12a-2', 'B3-T12a', 'Levels sorted by elevation (2)', '4a9c9d2cd1af02b8ddcd32ba496f1a94'],
  ['S-B3-T12b-1', 'B3-T12b', 'Add PDFs places pages on the selected level (1)', 'd35ae27f941886d0d7517c7830116ab9'],
  ['S-B3-T12b-2', 'B3-T12b', 'Open keeps the dialog open (2)', 'b71077c7c0229b5b58f0d269aa4ce627'],
  ['S-B3-T12c-1', 'B3-T12c', 'Export dialog with Building select', 'ad390fe83b6e4dc3283f9e3064740f77'],
  ['S-B3-T12c-2', 'B3-T12c', 'Save question before a Level export', 'd16d5e7286416fbd81f9b794978fe3fc'],
  ['S-B3-T12d-1', 'B3-T12d', 'New layout: level selected, 1600 wide', 'd8cb48ec01a52723981f9cd4369b8fb6'],
  ['S-B3-T12d-2', 'B3-T12d', 'New layout: building selected, sheets grouped by level', '702a99c91affb67c7b2262ca77c4b61d'],
  ['S-B3-T12d-3', 'B3-T12d', 'New layout: 760 x 640', '34f3d2aabc919103808d04a6d9e711e8'],
  ['S-B3-T12d-4', 'B3-T12d', 'New layout: 1100 x 700, long names', '97e6b42f0fab1838684c0e75e8bb3635'],
];

add({ type: 'task', id: 'B3-T12e', part: 'B3', state: 'done', commit: '6b7d066', summary: 'Export after the Save question re-reads the building so the saved sheet is linked; a save that leaves no id shows a message. Summaries says how many sheets can be read and how many cannot. 12 old browser checks repaired for the new behaviour. Runner: 26 checks, checks with problems: 0 (task lead run, after the last change). UI tests 680 (I ran them), pnpm build --force 9/9 (task lead). Windows test script rewritten (20 steps). Plan follow-up fd69edc. Not verified: Windows and Tauri; no check asserts that the Warnings sheet loses the "no id yet" line for a never-saved added sheet; b3-t11 step 6 failed once and passed on rerun (maybe flaky). Open: path match on every open, Export Building select has no not-placed ask, no building rename, no focus trap in Dialog, active PDF cannot pick the building.' });
add({ type: 'now', id: 'now', role: '', task: '', note: 'B3-T12 (Windows feedback round) done and pushed (fd69edc). Waiting for the user to run buildings-b3-windows-test.md again. B4 not started.' });
for (const [id, task, caption, assetId] of shots) {
  add({ type: 'shot', id, part: 'B3', task, caption, assetId, url: '/_blob/' + assetId });
}
