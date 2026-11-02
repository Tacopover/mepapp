// Adds the B3-T11 events to the buildings ledger through ledger.mjs (never writes the file directly).
import { execFileSync } from 'node:child_process';

const add = (e) => console.log(execFileSync('node', ['.claude/roadmap/ledger.mjs', '--stream', 'buildings', 'add', JSON.stringify(e)], { cwd: '/root/MepApp/.claude/worktrees/buildings-model' }).toString().trim().slice(0, 80));

add({ type: 'decision', id: 'D-B-27', part: 'B3', kind: 'new', status: 'open',
  question: '[product] Rebuild: what is it for, and should MepApp write the summary when a PDF opens? (Answer to your question: Rebuild opens each PDF of the building that is not open, reads its project and writes its summary, so Level and Building export work for files saved before the building existed. Today MepApp writes a summary only on Save. You are right: it can write the summary on open, because the project is already loaded.)',
  options: [
    { key: 'A', label: 'Write the summary when a PDF opens and matches a sheet. Link a sheet with no id to the id the PDF carries. Keep a repair action "Read summaries now" that shows only when a sheet has no summary.' },
    { key: 'B', label: 'Write the summary on open, but never link a sheet by file name. A sheet with no id stays "not saved yet" until the user saves it.' },
    { key: 'C', label: 'Keep Rebuild as it is. Write nothing on open.' } ],
  recommendation: 'A',
  reason: 'The data is free at open, the repair action is rare, and "not stamped" rows disappear without a Save. Plan: .claude/plans/buildings-b3-ui.md, T11b.' });
add({ type: 'decision', id: 'D-B-30', part: 'B3', kind: 'new', status: 'open',
  question: '[product] An open document that was never saved has no project id. What does "Add to level" do?',
  options: [
    { key: 'A', label: 'Add the sheet with no id and its path. The row says "Save this file to link it". The link happens at the next Save. The dialog writes no PDF.' },
    { key: 'B', label: 'Save the document first, then add the sheet with its id.' } ],
  recommendation: 'A',
  reason: 'Save works on the active tab only and it writes a PDF. A dialog action must not write a user PDF without a clear Save. Same rule for a document with unsaved changes: the summary updates at Save.' });
add({ type: 'decision', id: 'D-B-31', part: 'B3', kind: 'new', status: 'provisional', question: '[layout] Two columns: a tree of buildings and levels on the left, the detail on the right. One column below 900 px. Alternative: tabs.', answer: 'A', by: 'director', reason: 'The old app uses a tree. The user asked for one view of buildings and levels. Easy to reverse.' });
add({ type: 'decision', id: 'D-B-32', part: 'B3', kind: 'new', status: 'provisional', question: '[scope] No drag and drop in T11. Buttons only.', answer: 'A', by: 'director', reason: 'Tauri drag events differ from the web. A button gives one-step add. Easy to add later.' });
add({ type: 'decision', id: 'D-B-33', part: 'B3', kind: 'new', status: 'provisional', question: '[UX] Delete of a level with no sheets: no confirm, an Undo line for 8 seconds.', answer: 'A', by: 'director', reason: 'It is reversible and one click shorter than a confirm.' });

add({ type: 'finding', id: 'F-B3-4', status: 'open', part: 'B3', severity: 'medium', task: 'B3-T11', source: 'review', text: 'UI review done (22 findings R-1 to R-22 in .claude/plans/buildings-b3-ui-review.md). High: open documents not listed, no overview of buildings and levels, sheets grouped by PDF not by level, Export scope dead end. The dialog height jumps 207 to 894 px (the width does not). No dark theme exists in the app.' });

const tasks = [
  ['a', 'Open documents view model: DocumentSummary gets project id, page count and size; relinkSheet guard; FileTarget path', ''],
  ['b', 'Write the summary when a PDF opens (D-B-27)', 'Waits for D-B-27.'],
  ['c', 'Dialog shell, tree of buildings and levels, building switcher', ''],
  ['d', 'Levels in the tree: add, rename, elevation, order, delete with undo', ''],
  ['e', 'Sheets of the selected level: status, open, move, relink', ''],
  ['f', 'Open documents list and one-step Add to level', 'Waits for D-B-30.'],
  ['g', 'Add from disk and not-placed pages', ''],
  ['h', 'Repair action for summaries, messages, automatic file check', 'Waits for D-B-27.'],
  ['i', 'Export scope dead end, status-bar label, stale Saved text', ''],
  ['j', 'Part check of the new dialog, Windows script', ''],
];
tasks.forEach(([k, title, note], i) => add({ type: 'task', id: `B3-T11${k}`, part: 'B3', order: 44 + i, state: 'planned', title, summary: `Plan .claude/plans/buildings-b3-ui.md. ${note}`.trim() }));
add({ type: 'task', id: 'B3-T11', part: 'B3', state: 'briefed', title: 'Building dialog UI and UX overhaul', summary: 'Review and plan written and audited (OK with fixes, 19 findings folded in). Waits for the user to review the plan and answer D-B-27 and D-B-30. Tasks T11a to T11j are planned. Nothing is implemented.' });
add({ type: 'log', id: 'log-b3t11-plan', text: 'B3-T11: UI review (22 findings), plan with 10 tasks, audit done. Stopped for the user review. Decisions D-B-27 and D-B-30 open.' });
