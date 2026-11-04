# B3-T13: second Windows test feedback on the Building dialog

Source: the user ran `buildings-b3-windows-test.md` (run 2, installer `desktop-v0.1.0-test.6`, commit `6e76d2c`) on 2026-11-04. Rules are the same as in `buildings-b3-feedback.md` (worktree only, push the branch only, no B4).

## Decisions (provisional until the user says otherwise)

- **D-B-41** A building can be renamed with a "Rename" button next to its name in the building header. An empty name is refused. Two buildings with the same name are allowed (they have different ids) but the dialog warns.
- **D-B-42** The "Open in the viewer" list never shows an Untitled document with no PDF. It shows only documents that hold a PDF.
- **D-B-43** The text "Remove its 2 sheets first" under a level name means: the Delete button is off because the level still holds 2 sheets. New text: "This level has 2 sheets. Move or remove them to delete the level."
- **D-B-44** PDFs go on a level only. With the building node selected, "Add PDFs…", "Add folder…" and "Add to <level>" are not offered. The strip shows "Select a level to add PDFs." (or "Add a level first." when the building has no level). The "Not placed" pane stays for old data only.
- **D-B-45** The "Open" button of a sheet is off (label "Opened") while that PDF is open in the viewer. It turns on again when the document closes.
- **D-B-46** The "Open" badge next to a building in the tree is removed.
- **D-B-47** The tree shows the PDF names under each level. Levels are collapsed by default. Each level has its own expand arrow. A PDF node selects its level and marks the sheet.
- **D-B-48** When a folder or file holds pages that are already assigned to another level, the result text names them: "2 pages are already on Level 1 and were not moved."
- **D-B-49** A PDF that was never saved by MepApp gets its sheet id when it is added to a level (the app mints the id and keeps it in the building file). When the user opens that PDF from the dialog, or opens the same file by path, the document adopts that id. Then the summary can be written at once and "Save it to link it" does not show. If an adopt is not possible without changing a PDF file on disk, the task lead reports why.
- **D-B-50** The file picker for "Add PDFs…" allows more than one file where the platform allows it (Tauri dialog `multiple`, browser `showOpenFilePicker` with `multiple`).

## Tasks

- **T13a** D-B-41, D-B-42, D-B-46, D-B-47 (rename, no Untitled entry, no Open badge, PDF names in the tree). DONE f36c290.
- **T13b** D-B-43, D-B-44, D-B-45, D-B-48, D-B-50 (delete text, PDFs on levels only, Opened state, already-assigned alert, multi-file picker). DONE (commit on branch worktree-buildings-model, see the ledger). Check: `b3-t13b-check.mjs` 27 passed, 0 failed. Old checks `b3-t11e` (from line 173), `b3-t04`, `b3-check`, `b3-t11c`, `b3-t11g*`, `b3-t11h`, `b3-t12b` (Step 5) still expect the Not placed flow and need an update in T13c. The real Windows picker is not tested.
- **T13c** D-B-49 (link at add: minted sheet id with the flag idMinted, adopted when the PDF opens; status "Not opened yet") and the update of `buildings-b3-windows-test.md` (run 3) and of all old browser checks. DONE baa9dcf, e5a496f, 85116d8. Check: `b3-t13c-check.mjs` 22 passed, 0 failed. Known open items: the path match runs only when a PDF opens; Export Building has no not-placed ask; the dialog has no focus trap (focus falls to body when Open turns into Opened); the active PDF cannot pick its building; Read summaries still tries a not-opened sheet and fails it with "not saved yet"; old sheets with no id still say "Not saved yet"; the web run cannot prove the path match or that the PDF file on disk stays unchanged.

## Status

T13a, T13b and T13c done.
