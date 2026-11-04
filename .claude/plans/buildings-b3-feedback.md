# B3-T12: Windows test feedback on the Building dialog

Source: the user ran `.claude/plans/buildings-b3-windows-test.md` on Windows (installer `desktop-v0.1.0-test.5`, commit `c9af4aa`) on 2026-11-03. This plan turns the answers into tasks. Rules are the same as in `buildings-b3-ui.md` (worktree only, push the branch only, one ledger step per task, screenshots on the dashboard, no B4).

## Decisions (provisional until the user says otherwise)

- **D-B-34** The elevation of a level sets its place in the tree and in every list: lowest elevation at the top, highest at the bottom. Equal elevation: sort by name. The buttons "Move up", "Move down" and "Sort by elevation" go away.
- **D-B-35** "Add folder…", "Add PDFs…" and "Add all open documents" assign the new pages to the selected level at once. The "Not placed" pane stays for the edge case with no level selected, or a building with no level. A pane that is empty does not show.
- **D-B-36** "Open" on a sheet opens the PDF in the viewer and keeps the dialog open. The user can open several PDFs in a row.
- **D-B-37** The buildings in the tree keep a fixed order: alphabetical, ignoring upper and lower case. Selecting a building does not move it.
- **D-B-38** There is no "Close building" command. The Export dialog always shows a Building select (the active building first, then the recent buildings). A change of building updates the Level select. The task lead reports whether the active building can follow the active PDF at a low cost (see T12c).
- **D-B-39** Export of a PDF that is not saved shows a question inside the app: "Save the drawing first so the export can be made?" with Save and Cancel. It does not fail quietly.
- **D-B-40** The Level pane and the Building sheets pane use clear sections: a title bar for each section, a thin line between sections, rows with fixed columns (name on the left and cut with an ellipsis plus a tooltip with the full name, status in one column, actions right aligned). "Name" and "Elevation" come first. "Open PDF" and "Add folder" become a small section at the bottom.

## Tasks

- **T12a** Order by elevation, remove the move and sort buttons, fixed alphabetical order of buildings (D-B-34, D-B-37). User items: general comment, step 11. **DONE 66a436c.**
- **T12b** Add to the selected level at once, "Not placed" only for edge cases, "Open" keeps the dialog open (D-B-35, D-B-36). User items: steps 3, 5, 7. Check again whether Open after Save opens a duplicate tab. **DONE 85382da.**
- **T12c** Remove "Close building" from the dialog and the Building menu. Export dialog: Building select that updates the Level select. Export of an unsaved PDF asks to save (D-B-38, D-B-39). Tooltip with the full text on the alert at the top right. User items: steps 14, 15. **DONE cc2a8fb.**
- **T12d** Layout of the Level pane, the Building sheets pane and the summaries row (D-B-40). User items: step 13 and the layout comments. **DONE 08069d4.**
- **T12e** Update `buildings-b3-windows-test.md` for the new behaviour and run all browser checks. **DONE (the commit that holds this line).**

## Step 9 (no second computer)

The "No access" state comes from the Tauri file scope (the list of paths the app may read). The app gets a path into the scope when the user picks it in a Windows dialog. A test on one PC: restart the app and look at the status of a sheet that was added in an earlier run. If the status is OK, the scope survives a restart and the "No access" path cannot be made on this PC. Then step 9 stays open and is not a failure.

## Status

T12a to T12e are done (commits above). The browser checks run green with `run-all-b3-checks.mjs`. The user tests run 2 with `buildings-b3-windows-test.md`.

Also fixed in T12e: the Level export after the Save question reads the building again after the save, so a sheet that the save linked no longer warns "no id yet". A save that works but leaves the file with no id shows a status message. The Summaries section now says how many sheets can be read and how many cannot.

Known open items:
- The path match applies to every open: a tab for a changed file can stay stale, and the match ignores upper and lower case on all platforms.
- The Export Building select has no "not placed" question.
- There is no building rename.
- The shared Dialog has no focus trap.
- The active PDF cannot pick the building: that needs a read of every building file.
- Step 9 (No access) stays open until a second PC is available.
