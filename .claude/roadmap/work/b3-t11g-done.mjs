import { execFileSync } from 'node:child_process';

const add = (e) => console.log(execFileSync('node', ['.claude/roadmap/ledger.mjs', '--stream', 'buildings', 'add', JSON.stringify(e)], { cwd: '/root/MepApp/.claude/worktrees/buildings-model' }).toString().trim().slice(0, 70));

add({ type: 'task', id: 'B3-T11g', part: 'B3', state: 'done', commit: 'a846fc5', summary: 'Add PDFs / Add folder / Check files again moved into the open documents section. New Not placed pane (per-page select, "Assign all pages to..." per PDF). Close, Escape and the Close button ask once in the dialog when pages wait ("N pages are not placed. Close anyway?"; no window.confirm). The notice is a fading status line, no Dismiss. Move to wording made consistent; sheets ordered by page in each PDF. UI 644 tests, build 9/9, new check 29/29, all 18 old checks pass after the last change (task lead). Not run: Tauri paths, folder add on desktop, keyboard walk, screen reader, dark theme. Open for T11h: pages waiting are still dropped without an ask on Close building, on switching building and when a sheet opens; at 760x640 the right pane is about 230 px high and cuts lists without a scroll cue; a PDF read that ends after a building change lands in the new building list.' });
add({ type: 'now', id: 'now', role: '', task: '', note: 'B3-T11g done. Next: B3-T11h.' });
const shots = [
  ['S-B3-T11g-1', 'Not placed pane with two PDFs and Assign all pages', 'dca74c62e3e39b905f098936a8748d50'],
  ['S-B3-T11g-2', 'Close with pages waiting: the ask in the footer', '5ddc38dbde8290eafe1848f6775440df'],
  ['S-B3-T11g-3', 'Narrow 760x640 with the ask', '3c2d02a1b0242e86aa1287b15e441764'],
];
for (const [id, caption, assetId] of shots) {
  add({ type: 'shot', id, part: 'B3', task: 'B3-T11g', caption, assetId, url: '/_blob/' + assetId });
}
