import { execFileSync } from 'node:child_process';

const add = (e) => console.log(execFileSync('node', ['.claude/roadmap/ledger.mjs', '--stream', 'buildings', 'add', JSON.stringify(e)], { cwd: '/root/MepApp/.claude/worktrees/buildings-model' }).toString().trim().slice(0, 70));

add({ type: 'task', id: 'B3-T13a', part: 'B3', state: 'done', commit: 'f36c290', summary: 'Rename building (core renameBuilding, Rename button), no Untitled entry in the open-documents list, Open badge removed from the tree, PDF names under collapsed levels in the tree with per-level expand arrows. b3-t13a-check 54/54, core 2179, UI 694, pnpm build --force 9/9. Not verified: narrow layout, Windows.' });
add({ type: 'task', id: 'B3-T13b', part: 'B3', state: 'done', commit: '502b367', summary: 'Delete text "This level has N sheets. Move or remove them to delete the level.", PDFs on levels only (no add on the building node), Open button turns into disabled Opened, lasting result text naming the level of pages already assigned, multi-file picker (FileAccess.openFiles; Tauri multiple). b3-t13b-check 27/27, UI 713, platform-web 28, pnpm build --force 9/9. Not verified: real Windows multi-file picker, Add folder after this change, narrow layout.' });
add({ type: 'task', id: 'B3-T13c', part: 'B3', state: 'done', commit: 'a929742', summary: 'A PDF without an id gets a minted sheet id when added to a level (sheet.idMinted); the document adopts it on open (path, or name+size) and the summary is written at once; embedded id wins; status "Not opened yet". Old checks repaired; full runner: 29 checks, checks with problems: 0 (task lead run). I ran: core 2189, UI 739. Task lead: pnpm build --force 9/9, b3-t13c-check 22/22. Windows script run 3 (26 steps). Not verified: path match on desktop (web has no paths), PDF on disk unchanged (by code only), Windows. Open: Read summaries tries a Not opened yet sheet; an already open PDF waits for Save or activation; path match runs only on open; no focus trap; Export Building has no not-placed ask; active PDF cannot pick the building.' });
add({ type: 'now', id: 'now', role: '', task: '', note: 'B3-T13 (second Windows feedback round) done and pushed (a929742). Waiting for the user to run buildings-b3-windows-test.md run 3. B4 not started.' });
const shots = [
  ['S-B3-T13a-1', 'B3-T13a', 'Tree: levels collapsed under the buildings', '5a78c29ad6a95dbcb8889368524e90bf'],
  ['S-B3-T13a-2', 'B3-T13a', 'Tree: one level expanded with PDF names', 'e21018f365e069ed01982b02c6acd37c'],
  ['S-B3-T13a-3', 'B3-T13a', 'Rename building input', 'c5b1dc23cc05894e32b1e2d32923dc30'],
  ['S-B3-T13b-1', 'B3-T13b', 'Building selected: no add buttons, hint', '3e31757fbeb9c82a4a75037d3d792d6e'],
  ['S-B3-T13b-2', 'B3-T13b', 'Opened button disabled', 'f07b87ef0427f38566dc5ac8c3e276dc'],
  ['S-B3-T13b-3', 'B3-T13b', 'Result text: pages already on another level', '878990eaba6cc5b2d07ee056ff3b0868'],
  ['S-B3-T13c-1', 'B3-T13c', 'Added PDF: Not opened yet', '706feb43846eca9b3bc6190ebb53fa53'],
  ['S-B3-T13c-2', 'B3-T13c', 'After Open: sheet linked, summary made', 'a2d10b8e05eb3fb209ce5c96ba81bc07'],
];
for (const [id, task, caption, assetId] of shots) {
  add({ type: 'shot', id, part: 'B3', task, caption, assetId, url: '/_blob/' + assetId });
}
