# Plan: drop unused library-stamp copies at Save

Status: DONE 2026-10-05 — implemented on branch `worktree-code-review-highs`, pushed for a Windows test, not merged to `master`. User approved the plan; requirement 4 dropped by the user (not done).
Verification: core tests 673/673 pass (5 new); full `pnpm build` passes. Browser size check: old code FAIL (85,284 B left after the delete), fixed code PASS (9 B, the empty `/Annots []`). Real-DOM check on the fixed build: rail Undo after Save brings the stamp back, and the next Save writes the copy again (131,113 B). A reopen restores the placed stamp with the right art (screenshot). Not verified: the Stamps panel with a real library folder (the folder picker closes the headless page). A project-copy tile whose stamp is not in a library folder is not armed ("could not read the library stamp"). That is existing behavior in `pickStampDefinition`, not changed here.
Source prompt: `library-stamp-copy-prompt.md`.
Branch: `worktree-code-review-highs` (worktree `.claude/worktrees/code-review-fixes`), base `a7363b0`.

## Problem

`adoptStampDefinition` (`packages/render/src/scene.ts:715`) copies a user-library stamp (`source: 'user'`) into `doc.customStampDefinitions` at the first placement. `deleteSelection` removes the placed stamp, but the copy stays. `serializeDocument` (`scene.ts:3123`) writes every copy into `mepapp-project.json`. A copy holds the stamp file two times as base64 (`iconRef` and the image shape `dataUrl`), so a 44 KB PNG costs about 85 KB.

## Decision 1: where to drop the copies

At Save, in `serializeDocument`. The copy in memory stays, so undo after a Save brings the stamp back with art and ports, and the next Save writes the copy again (requirement 2). Deleting the copy at the last stamp delete would need an undo step for `customStampDefinitions`, which has no undo history today.

This matches an existing rule: `liveSchematics` (`scene.ts:1629`) already drops schematics of deleted panels at Save only.

## Decision 2: the rule

A new pure function in `@mepapp/core` (`project.ts`, next to `serializeProject`):

```ts
/** The custom stamp definitions a Save writes: every 'custom' and 'library' entry, and a 'user' copy only while a placed stamp uses it. */
export function customStampDefinitionsToSave(definitions: readonly StampDefinition[], stamps: readonly PlacedStamp[]): StampDefinition[]
```

- `source: 'custom'` (Element Editor) — always kept (requirement 3).
- `source: 'library'` (edited built-in stamp, keeps the library id) — always kept (requirement 3).
- `source: undefined` — always kept. Older files can have entries with no `source`; the function treats them as `custom`.
- `source: 'user'` — kept only when a stamp in the live drawing state has `definitionId === definition.id`.

The function does not change its input. `serializeDocument` calls it with `doc.customStampDefinitions` and `Object.values(state.stamps)`.

## Decision 3: other readers of `customStampDefinitions`

I read every reader (`grep customStampDefinitions`). Result:

| Reader | Uses a copy without a placed stamp? | Decision |
|---|---|---|
| Placed stamps (`definitionId`) | — | The rule. |
| Undo stack (deleted stamps) | Yes, in memory | Copy stays in memory; only Save drops it. |
| Clipboard (`copySelection` / `pasteClipboard`, `scene.ts:4141`) | Yes: copy, delete, Save, paste | Copy stays in memory, so a paste in the same document still resolves. The next Save writes the copy again. |
| Paste into another document | — | Not changed. `pasteClipboard` never adopts the definition into the target document. That is an existing gap (see "Out of scope"). |
| Schematics (`schematicTerminals.ts`, `SchematicDialog`, `SchematicTemplateEditor`) | No | They read `stamp.definitionId` of placed stamps only. A saved schematic stores no definition id. |
| Panels / circuits (`CircuitPanelProperties`, `scene.ts:1723`, `1816`) | No | Labels of placed stamps only. |
| Properties panel, stamp properties, `placeStampTool` | No | Placed stamps, or the stamp being placed (the copy is added before that). |
| Stamps panel (`stampVisibility.ts`) | Shows the copy as a tile only when the library does not have that id | See decision 5. |
| `handleSaveUserStamp` (`App.tsx:1030`) | Updates the copy when one exists | Works the same: the copy in memory exists until reopen. |

## Decision 4: label layout of a dropped copy

Keep it. `stampLabelLayouts` is keyed by definition id and also holds layouts for built-in stamps that have no copy. A layout is small JSON that the user made. If the user places the stamp from the library again, the layout applies again. No change to `stampLabelLayouts`.

## Decision 5: Stamps panel after reopen

If the copy was dropped, no placed stamp uses it, so the drawing loses nothing. When the library folder still has the stamp, the panel shows the library tile, the same as today. When the library folder no longer has the stamp, the panel shows no tile for it. That is correct: the user deleted the last use, and the stamp is not in the library.

## Requirement 4 (optional): store the file one time in each copy — NOT in this change unless you say so

This changes the project format: a schema version, a migration, and an older MepApp refuses the newer file. Decisions 1–5 already fix the reported case (deleted stamp). Requirement 4 only makes a copy that is still in use about half the size. Recommendation: do it later as its own change, if you want it.

## Steps

1. Core: add `customStampDefinitionsToSave` + export it. Tests in `project.test.ts`:
   - a `user` copy with no placed stamp is dropped;
   - a `user` copy with a placed stamp is kept;
   - `custom`, `library` and no-`source` entries with no placed stamp are kept;
   - undo case: the input array is not changed, so after a stamp comes back the same input gives the copy again;
   - order of the kept entries is the input order.
2. Render: `serializeDocument` calls the function. Fix the comment on `adoptStampDefinition`/`deleteSelection` only if one says the copy is saved forever.
3. `pnpm install`, `pnpm build`, `pnpm test` (core) at the repo root.
4. Browser check from the prompt appendix: FAIL on the old build (`a7363b0`), PASS on the fixed build.
5. Real-DOM check: the Stamps panel still lists and places library stamps; a reopened file shows its placed library stamps with the right art; undo after Save brings the stamp back, and the next Save size grows again.
6. Commit, push the branch, mark this plan done. Do not merge to `master`.

## Follow-up: paste into another document — DONE 2026-10-05

User asked to fix this gap too. `copySelection` now puts the definitions of the copied stamps on the clipboard (`source` `user` or `custom`; an edited built-in stamp, `library`, is not copied because in the target document it would replace that stamp's art for every instance). `pasteClipboard` adds each one that the target document does not have, the same way it adds network types.
Verification: browser check (copy in a.pdf, paste in b.pdf, Save, reopen b.pdf). Old code: the reopened stamp has no sprite and no definition. Fixed code: ALL PASS, the reopened stamp shows its art (screenshot). All package tests pass.
