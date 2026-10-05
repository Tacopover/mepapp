# Prompt: stamps with more than one discipline

Paste the text below into a new session.

---

I want a stamp to belong to more than one discipline, and the Stamps panel must show such a stamp only once. Please read the code, write a plan in `.claude/plans/multi-discipline-stamps.md`, check the plan with me, and then implement it in a worktree. Push the branch so I can test on Windows. Do not merge to `master`.

Requirements:

1. In the custom element editor (`packages/ui/src/components/ElementEditorDialog.tsx`), the user can check one or more disciplines for a stamp. Today the editor has one `<select>` with `DISCIPLINE_OPTIONS`. At least one discipline must stay checked.
2. The Stamps panel shows a multi-discipline stamp once. Under a discipline filter (HVAC, Plumbing, ...) the stamp shows when any of its disciplines is in that group. Under "All" it shows once.
3. This works for all three stamp sources: built-in (`source: 'library'`), custom (project), and user library stamps (`source: 'user'`, stored in `LibraryStore`, with edits in `LibraryStampEdits`).
4. Fix the built-in pumps. `scripts/stamp-discipline-map.csv` maps `D5_Pump.svg`, `D5_Pump_dual_speed.svg` and `D5_Pump_speed_controlled.svg` to `hvac;plumbing`. `scripts/generate-stamp-library.mjs` (around the `multi` variable) then makes two entries per file (`pump-hvac` and `pump-plumbing`), so "D5 Pump" shows twice under "All". The generator must make one entry with both disciplines.

Questions the plan must answer:

- The data model. For example: keep `discipline` as the primary discipline and add `disciplines?: Discipline[]`, or replace the field. Find every reader of `StampDefinition.discipline` (`packages/core/src/stamp-library.ts`, `packages/core/src/user-stamp.ts`, `packages/platform/src/library-store.ts`, `packages/ui/src/stampVisibility.ts`, `packages/ui/src/disciplineGroups.ts`, the editor, and the render package).
- Which discipline a placed stamp gets, if any. For example: the active discipline filter, or the first discipline. Check what a placed stamp stores today.
- Old projects. Projects saved with `pump-hvac` or `pump-plumbing` must still open and show the right art. Decide on aliases or a schema migration (`packages/core` has schema migrations).
- Custom stamps that override a library id (an edited library stamp keeps the library id). Check the shadowing in `getVisibleStampDefinitions`.
- Saved projects and the user library store need backward-compatible reading of the old single-discipline records.

Project rules: work in a worktree; `master` is live; run `pnpm install` and `pnpm build` at the repo root first; add unit tests (vitest) and check the UI through the real DOM in a headless browser; regenerate `stamp-library.generated.ts` with the script, do not edit it by hand.
