# B6-T06 design: changed file prompt (shared by the briefs b6-t06-1 to b6-t06-4)

Spec (texts word for word): `.claude/roadmap/work/briefs/b6-t06-t08-ux-spec.md`, section 6.1. Decision D-B-71, option A for all 6 questions. No change of the building file format. The update of the size uses the same code as Relink.

User bug: a PDF edited in another viewer has a new size. The key is `fileName:sizeBytes`, so no pick matches. Today the row stays on "Choose file…", Reconnect and the folder scan skip the file with no message, and Relink shows only for `pdf-missing`. T06 removes this dead end for every way to get a file.

## Rules
- A picked file is a CHANGED file when some sheet of the building has its file name, and no sheet has that name AND that size (`isChangedFile`). A sheet with no `sizeBytes` is not a candidate.
- Sheets that change together: `sheetsOfSamePdf(file, sheet)` (all levels). If the sheets with that name belong to more than one `sheetPdfKey` group, the app cannot tell: no prompt (treated like "two candidates", see below).
- Name equal and size different from a sheet = changed (prompt). Name different and size different = not a changed file (old behaviour, new notice text `pickedOtherFileNotice`).
- The new file is never used and never remembered (no cache, no handle store) before the user clicks "Use new file(s)". On Cancel nothing changes in the building and the file is dropped.
- If the new file has a project id (`readPdfInfo`) that is a different document than the sheets (same test as `useSheetRelink.relink`), the existing `RelinkConfirm` question shows INSTEAD (for a row pick). In the many-files path such a file is left out of the prompt and named in the final notice (see texts).
- Pages: no sheet is removed or moved. Sheets with `pageIndex >= pageCount` are "lost pages": named in the prompt and in the notice.
- Yes: (a) `applyNewFile` updates `fileName` and `sizeBytes` of every sheet of the PDF (same as `applyRelink`; refused duplicate gives the existing error notice), (b) `sheetFiles.remember(opened files)` (tab cache + handle store; the old stored key is deleted by the existing effect in App.tsx that deletes keys that left the sheet set), (c) for a row pick, the sheet opens.
- Session memory: the hook keeps `changedSheetIds` (state, not saved). A sheet id is added when its changed file was found and the prompt was cancelled; removed when the new file was used. A row in `changedSheetIds` shows "Choose file…" and its click goes straight to the picker (`options.picker = true`, skips cache, folder and stored handle).
- Two different changed files with one name (folder: two files with other time stamps; picked: two files): not used. Notice (spec 6.1 "Two changed candidates").
- A folder file is a changed candidate only when the scan found NO exact match for that name (an exact copy elsewhere wins).
- One prompt at a time. A new offer replaces the old one (the old file is dropped).

## New and changed names (the contract)

### packages/ui/src/changedFile.ts (new, pure) + changedFile.test.ts
```ts
import type { BuildingFile, BuildingSheet } from '@mepapp/core';
import type { OpenedFile } from '@mepapp/platform';

export function isChangedFile(file: BuildingFile, name: string, size: number): boolean;
/** Groups of sheets (by sheetPdfKey) that carry this file name and have a size. One group = one PDF. */
export function sheetGroupsOfName(file: BuildingFile, name: string): BuildingSheet[][];
/** 1-based, sorted, unique page numbers of the sheets with pageIndex >= pageCount. */
export function lostPageNumbers(sheets: readonly BuildingSheet[], pageCount: number): number[];

export interface ChangedItem {
  fileName: string;
  opened: OpenedFile;            // the new file
  sheetIds: string[];            // all sheets of the PDF, all levels
  projectUuid: string | null;    // from readPdfInfo of the new file
  pageCount: number | null;      // from readPdfInfo, null when the engine is missing
  lostPages: number[];           // lostPageNumbers; [] when pageCount is null
}

export function changedPromptText(items: readonly ChangedItem[]): string;     // spec 6.1 rows 1 to 4
export function changedUseNotice(item: ChangedItem): string;                  // row "Yes, row" + "Yes and pages missing"
export function changedManyUseText(items: readonly ChangedItem[]): string;    // ` Using the new files for K PDFs (N sheets).` + lost-page sentences, no leading space
export function changedCancelText(items: readonly ChangedItem[]): string;     // `3 PDFs changed and were not used: A.pdf, B.pdf, C.pdf.` (names as in the prompt: max 3, then `and r more`; K=1: `{name} changed and was not used.`)
export function twoChangedText(names: readonly string[], source: 'folder' | 'picked'): string;
export function changedRowLine(): string;  // 'The PDF changed after it was added. Click Choose file… and use the new file.'
export const CHANGED_ROW_LINE: string;
```
`changedPromptText`: one item = row text (spec 6.1 row 1 and 2: sheet count N from `sheetIds.length`, N = 1 says `this sheet`; fewer pages adds ` The new file has {M} pages. The sheet for page {k} cannot open.` or `The sheets for pages {k1}, {k2} cannot open.`; M = 1 says `1 page`). Two or more items = spec rows 3 and 4 (K PDFs, names max 3 then `and {r} more`, N = sum of `sheetIds.length`, lost-page sentence with n = sum of `lostPages.length`).

### packages/ui/src/sheetFileCache.ts
Add `async takeChanged(sheet: BuildingSheet): Promise<OpenedFile | undefined>`: when `take(sheet)` found an entry whose `target.getFile()` gave another size, `take` still deletes the entry and returns undefined, but now it keeps `{file, target}` in a private map by key. `takeChanged(sheet)` returns and removes that value (or undefined). `clear()` clears the map. No other behaviour change.

### packages/ui/src/pdfHandles.ts
- `StoredOpenOutcome` `changed` variant gets the file: `{ kind: 'changed'; opened: OpenedFile }`. `openStoredHandle` returns it when `file.size !== sizeBytes` (`opened = { file, target: handle }`).
- `shouldDeleteHandle('changed')` becomes false (the handle stays until the user says yes; the old key is deleted when the sheets get the new size).
- `storedOpenNotice` for `changed` returns null (the prompt replaces the notice). Update tests.
- `pickedOtherFileNotice()` text becomes: `This file has another name than the sheet. The sheet keeps its saved file name.` (not an error).

### packages/ui/src/pdfFolder.ts
`scanPdfFolder` also collects changed candidates: an entry whose name is in `sizesByName` and whose size is NOT in the set, and only for names that have NO exact match in the whole scan. Add to `FolderScanResult`:
```ts
  /** One candidate for each file name with a changed file (same name, another size than every sheet). Never a name that has an exact match. */
  changed: FolderMatch[];                 // key = pdfHandleFileKey(name, size)
  /** File names with two different changed files (different size or time stamp). Not in `changed`. */
  changedAmbiguousNames: string[];
```
(Two entries with the same name, same size, same lastModified count once.) `folderResultNotice` input gets optional `changedNames?: ReadonlySet<string>` and `changedMode?: 'found' | 'excluded'`: needed PDFs whose `fileName` is in `changedNames` count as found when mode is `'found'` and are left out of the count (neither found nor missing) when `'excluded'`. Default (no `changedNames`) = old behaviour. Add `changedAmbiguousNames?: string[]`: adds `twoChangedText(names, 'folder')` to the notice parts, after the two-files part.
`folderDeniedNotice` / `folderGoneNotice` texts are NOT changed in T06 (T07 changes them).

### packages/ui/src/reconnectPdfs.ts
`ReconnectInput` gets optional `changedNames?: ReadonlySet<string>`, `changedMode?: 'found' | 'excluded'`, `changedAmbiguousNames?: string[]` (same meaning; `twoChangedText(names, 'picked')`). Picked files whose name is in `changedNames` are never counted in `unused` ("N files were not used"). Default = old behaviour.

### packages/ui/src/useSheetRelink.tsx
Split without changing behaviour of `relink`:
```ts
  /** The part of relink after the pick. Reads the file, asks RelinkConfirm for a different document, else applies. */
  relinkWith: (sheet: BuildingSheet, origin: string, picked: OpenedFile) => Promise<void>;
  /** Updates fileName, sizeBytes (and projectUuid when given) of every sheet of the same PDF. Returns true when done. No notice on success; the refused notice (RELINK_REFUSED) shows as before. */
  applyNewFile: (sheet: BuildingSheet, location: SheetLocation, projectUuid: string | undefined) => Promise<boolean>;
  /** True when the new file belongs to a different document than the sheets of the PDF (same test as relink). */
  isOtherDocument: (sheet: BuildingSheet, projectUuid: string | null) => boolean;
```
`relink` = pick + `relinkWith`. `applyRelink` = `applyNewFile` + notice `Relinked {name}.` Existing relink tests and checks must stay green.

### packages/ui/src/useChangedFile.tsx (new)
```ts
export interface ChangedOffer {
  /** 'row': one PDF from a row pick. 'band': one or more PDFs from Reconnect (files or folder). */
  scope: 'row' | 'band';
  /** The row that started it (scope 'row'), else null. */
  sheetId: string | null;
  items: ChangedItem[];
}
export interface ChangedFiles {
  offer: ChangedOffer | null;
  changedSheetIds: ReadonlySet<string>;
  /** Number of distinct PDFs (sheetPdfKey) among changedSheetIds. */
  changedPdfCount: number;
  /**
   * A changed file came from a row action. Reads it, then: different document -> relinker.relinkWith (the old question), else sets the offer.
   * `afterUse` runs after a successful "Use new file" (the row opens the sheet); it gets the sheet with the new size. Resolves when the offer is set (or the old question is shown or an error notice was shown).
   */
  offerRow: (sheet: BuildingSheet, opened: OpenedFile, afterUse: (sheet: BuildingSheet, useText: string) => Promise<void>) => Promise<void>;
  /**
   * Changed files from Reconnect (files or folder). Files that are not a changed file of the building are ignored.
   * Returns true when a prompt shows. Then `finish(answer)` gives the notice after the answer, and the caller shows no notice. Returns false when nothing waits: the caller shows its own notice.
   * Read errors give the notice `Could not read {name}: {message}` through onNotice; other-document files are left out and named by `finish` text: `{names} is a different document. Use Choose file… on its row.`
   */
  offerFiles: (
    opened: OpenedFile[],
    finish: (answer: { used: boolean; pdfs: number; sheets: number; names: string[] }) => { text: string; error: boolean },
  ) => Promise<boolean>;
  confirm: () => Promise<void>;
  cancel: () => void;
}
export function useChangedFile(args: {
  file: BuildingFile | null;
  engine: PdfEngine | undefined;
  relinker: SheetRelink;
  remember: ((opened: OpenedFile[]) => void) | undefined;
  onNotice: (text: string, error: boolean) => void;
}): ChangedFiles;

export function ChangedFileConfirm(props: { offer: ChangedOffer; onYes: () => void; onNo: () => void }): JSX.Element;
```
`ChangedFileConfirm` looks like `RelinkConfirm`: `div.mep-buildings-actions`, `p.mep-hint` with `role="status"` and `data-testid="changed-confirm"`, then two buttons: `data-testid="changed-confirm-yes"` (text `Use new file`, or `Use new files` for 2 or more items) and `data-testid="changed-confirm-cancel"` (`Cancel`). The yes button gets focus when the prompt mounts (`autoFocus` or an effect). Esc on the wrapper cancels.

`confirm()`: for each item `relinker.applyNewFile(sheet of item, {fileName, sizeBytes: opened.file.size, ...(path)}, projectUuid ?? undefined)`; stop on a refused item (the refused notice shows; nothing else is remembered for it). Then `remember(opened files of used items)`, remove used sheet ids from `changedSheetIds`, clear the offer. Row scope: `afterUse(sheetWithNewSize, changedUseNotice(item))`. Band scope: `onNotice(finish({used:true,...}))`.
`cancel()`: add all sheetIds of the items to `changedSheetIds`; clear the offer; band scope: `onNotice(finish({used:false,...}))`; row scope: no notice. The file is not remembered.
The hook must not use `window.confirm`.

### Where the pieces connect (brief 3 and 4)
- `SheetOpenResult` (ManageBuildingsDialog.tsx) gets the variant `{ ok: false; message: null; changed: OpenedFile }`. `onOpenSheet` type everywhere gets a third optional parameter `options?: { picker?: boolean }`.
- `App.tsx openSheetNow(sheet, mode, options)`: in `'pick'` mode: if `options?.picker` skip cache, folder and stored handle. Else after `take` returns undefined: `takeChanged(sheet)`; after the folder: `viaFolder.changed` (an `OpenedFile` for this sheet's name); after the stored handle: `stored.kind === 'changed'`. Any of these returns `{ ok: false, message: null, changed }` and nothing opens. After the picker: if the picked name equals the sheet name and `isChangedFile(file, name, size)`: return `changed`. If the name differs and size differs: old open, `pickedOtherFileNotice()`.
- `usePdfFolder`: `FolderOpenResult.changed?: OpenedFile`; `allow()` returns `AllowOutcome = { notice: FolderNotice | null; changed: ChangedScan | null }` with `ChangedScan = { files: OpenedFile[]; ambiguousNames: string[]; noticeFor: (mode: 'found' | 'excluded') => FolderNotice | null }`. The folder scan that runs at the start (access check) ignores changed files. `rememberMatch` is NOT called for a changed candidate.
- `ManageBuildingsDialog`: `const changed = useChangedFile({ file, engine: pdfEngine, relinker, remember: sheetFiles?.remember, onNotice })`. `openSheetKeepOpen(sheet, mode, options)`: when `result.changed` is set, call `changed.offerRow(sheet, result.changed, afterUse)` where `afterUse` calls `openSheetKeepOpen(newSheet, 'pick')` then shows `Opened ... Using the new ...` as one notice (the open notice, then the use text). Pass `changed` to `LevelSheetsPane`. Fallback prompt: when the offer is for a row that `LevelSheetsPane` does not show (tab is not 'levels', or a level is selected and the sheet is on another level), the dialog renders `ChangedFileConfirm` itself above the status line.
- `LevelSheetsPane`: new optional prop `changed?: ChangedFiles`. A row whose id is in `changed.changedSheetIds` shows the button `Choose file…` (tooltip `The PDF changed. Choose the new file to use it.`) and calls `openRow(sheet, 'pick', { picker: true })`. Under the row (after the `RelinkConfirm` slot): `ChangedFileConfirm` when `changed.offer?.scope === 'row' && changed.offer.sheetId === sheet.id`. Under the band: `ChangedFileConfirm` when `scope === 'band'`. The row line for a changed row is T08 (not T06). `reconnect()`: `rememberFiles` gets only the files that are NOT changed files; the changed ones go to `changed.offerFiles(...)`. `allowFolder()`: same with `ChangedScan`.
- `reconnectResult` and `folderResultNotice` get the changed names and mode; the `finish` callback builds: used = `base('found').text + ' ' + changedManyUseText`, cancel = `base('excluded').text` (when not empty) + ` ` + `changedCancelText`.
- `index.ts` exports nothing new unless a check needs it.

## Texts
Word for word from the spec, section 6.1. Buttons: `Use new file`, `Use new files`, `Cancel`. Notice after a row yes: `Opened {displayName} in the viewer. Using the new {name} for {N} sheets.` (N = 1: `for 1 sheet`) (provisional: the open notice and the use text in one notice).

## Provisional decisions of the task lead
1. After a row yes the notice has both the open text and the use text.
2. Many-files path: a different-document file is left out of the prompt and named in the final notice.
3. A folder file counts as a changed candidate only when no exact match of that name exists in the scan.
4. After Cancel on a row, "Choose file…" goes straight to the picker (no stored handle, no folder, no cache) so the user can pick another file.
5. Fallback prompt at dialog level when the row is not shown in the Sheets pane.
