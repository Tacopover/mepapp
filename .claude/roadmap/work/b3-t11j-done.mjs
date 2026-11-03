import { execFileSync } from 'node:child_process';

const add = (e) => console.log(execFileSync('node', ['.claude/roadmap/ledger.mjs', '--stream', 'buildings', 'add', JSON.stringify(e)], { cwd: '/root/MepApp/.claude/worktrees/buildings-model' }).toString().trim().slice(0, 70));

add({ type: 'task', id: 'B3-T11j', part: 'B3', state: 'done', commit: '8016e29', summary: 'Part check b3-t11-check.mjs 46/46 with real clicks and typing: two buildings, levels, bulk add of 3 open documents, Move to, Open from sheet, delete and relink, export Level and Building, close and reopen, 760x640, keyboard walk. Fixed: focus fell to body after the not-placed ask and after Add PDFs/Add folder; Export dialog has one width; dialog result text says "Read N of M summaries". Core 2179 tests, UI 651 tests, pnpm build --force 9/9, no __mepBuilding in apps/web/dist, and I ran all 22 dialog browser checks after the last change: 0 failed. Windows script: .claude/plans/buildings-b3-windows-test.md (17 steps). Not run: Tauri paths, a real building switch on web (store.load stand-in), the real Open building picker, screen reader, dark theme. Open: Open on a sheet after Save may open a duplicate document tab (file size changes, findDocumentByFileKey does not match; check on Windows); the dialog has no focus trap (shared Dialog); the scope dialog message has no Dismiss; status bar chip crowding at 1600 px.' });
add({ type: 'now', id: 'now', role: '', task: '', note: 'B3-T11j done. B3-T11 complete. Waiting for the user to test on Windows. B4 not started.' });
const shots = [
  ['S-B3-T11j-1', 'Part check: two buildings in the tree', '63e9320dd3b8aaf88c891f467abb3999'],
  ['S-B3-T11j-2', 'Part check: after Add all open documents', 'df93bc3240cfcaf83e9e6822beed56af'],
  ['S-B3-T11j-3', 'Part check: narrow 760x640', 'a0810729db0127d3ebaae69394757246'],
];
for (const [id, caption, assetId] of shots) {
  add({ type: 'shot', id, part: 'B3', task: 'B3-T11j', caption, assetId, url: '/_blob/' + assetId });
}
