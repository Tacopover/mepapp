import { execFileSync } from 'node:child_process';

const add = (e) => console.log(execFileSync('node', ['.claude/roadmap/ledger.mjs', '--stream', 'buildings', 'add', JSON.stringify(e)], { cwd: '/root/MepApp/.claude/worktrees/buildings-model' }).toString().trim().slice(0, 70));

add({ type: 'task', id: 'B3-T11f', part: 'B3', state: 'done', commit: 'd70257a', summary: 'New section "Open in the viewer": one row per open document with Add to <level>, Add all pages, page chips, level select, Add all open documents, notes for unsaved documents, Add a level first. No file picker (picker calls 0). A second click adds nothing. An unsaved PDF stores no id. UI 643 tests, build 9/9, new check 45/45, all 17 old checks pass after the last change (task lead). Not run: Tauri paths, dark theme, screen reader, keyboard walk, component tests (ui has no DOM test setup). Seen, not fixed: sheets in a level show in add order, not by document then page; level select says "Other level..." while sheet rows say "Move to..."; Dismiss on the notice (T11g).' });
add({ type: 'now', id: 'now', role: '', task: '', note: 'B3-T11f done. Next: B3-T11g.' });
const shots = [
  ['S-B3-T11f-1', 'Open in the viewer: three documents, one with pages', '7dbc08122c5d8afd9d468e186e79c787'],
  ['S-B3-T11f-2', 'After Add all open documents', 'fe2d7f66457671b8c3bd3c1220afc6cd'],
  ['S-B3-T11f-3', 'Narrow 760x640 with the open documents section', 'cf45871ef79282c3cc61a18e937aafa8'],
];
for (const [id, caption, assetId] of shots) {
  add({ type: 'shot', id, part: 'B3', task: 'B3-T11f', caption, assetId, url: '/_blob/' + assetId });
}
