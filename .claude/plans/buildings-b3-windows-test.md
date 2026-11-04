# Windows test script: Buildings dialog (B3, run 3)

Use the desktop build (Tauri) on Windows. Use a build that has the T13a, T13b and T13c changes. Use three real PDFs of drawings. Put two PDFs in one folder (`C:\Test\Tower`). Put one PDF in another folder (`C:\Test\Other`). One of the PDFs must be a PDF that MepApp never saved.

## Earlier runs

- Run 1 (installer `desktop-v0.1.0-test.5`): you passed steps 1, 2, 4, 6, 8, 10, 12, 16 and 17 of the old script.
- Run 2 (installer `desktop-v0.1.0-test.6`): you found 13 points. T13a, T13b and T13c fix them.
- A step marked "passed in run 1" needs a quick look, not a full test. A step marked "new in run 3" or "changed in run 3" needs a full test.

## What the web run could not prove

The browser check ran on the web build with a fake file picker. It did not run these:
- The real Windows file pickers (Add folder…, Add PDFs… with two files, Open building…).
- Open by path, Grant access and the folder scope of the desktop file access.
- A PDF that the app opens by "Open with" or by drag (it may have no path).
- A real switch between two building files. The web store holds one file, so the check loaded the file into the store first.
- Screen reader, dark theme, and real Windows scaling.
- Whether the Windows save dialog and the "Open after Save" path give the same file path in the building and in the open tab.
- That a PDF stays unchanged on disk after Add and Open. The web run has no file path. Check the "Date modified" of the PDF in Explorer in step 22.

## Steps

1. Passed in run 1, re-check only what changed. Start the app. Open Menu, Manage Buildings…. Click New building, type `Tower`, press Enter.
   Expected: the dialog shows Tower with "0 levels, 0 sheets". The list of "Open in the viewer" shows no "Untitled" document (new in run 3).
2. Rename a building (new in run 3). Click Rename next to the name Tower. Type `Tower A` and press Enter.
   Expected: the header shows `Tower A`. An empty name is refused and the old name stays. Rename it back to `Tower`.
3. Passed in run 1, re-check only what changed. Click "+ Add level". Type `Ground floor` and press Enter. Add a second level and type `Level 1`.
   Expected: the tree shows both levels. The levels are closed (collapsed). Each level has its own arrow.
4. Elevation order. Set the elevation of `Level 1` to 3000 and of `Ground floor` to 0. Add a third level `Basement` with elevation -3000.
   Expected: the levels show in this order, top to bottom: Basement, Ground floor, Level 1. Change an elevation: the order changes at once. No "Move up", "Move down" or "Sort by elevation" button shows. Two levels with the same elevation sort by name.
5. Building node offers no add (new in run 3). Click the building name `Tower` in the tree.
   Expected: no "Add PDFs…", no "Add folder…" and no "Add to <level>" button shows. The text "Select a level to add PDFs." shows. The Refresh button stays. Make a new building with no level: the text says "Add a level first."
6. Add folder (changed in run 3). Select Ground floor. Click "Add folder…" and choose `C:\Test\Tower`.
   Expected: the folder picker opens. Each page of the PDFs in the folder appears under Ground floor at once. No "Not placed" node shows. A line says "Added N pages …".
7. Add PDFs, two files (changed in run 3). Select Level 1. Click "Add PDFs…". In the picker, select two PDFs with Ctrl-click (one from `C:\Test\Other`, and one more from any folder).
   Expected: the picker lets you pick two files. The pages of both files appear under Level 1. The line says "Added N pages (2 PDFs) to Level 1." If the picker allows only one file, write that down.
8. Already on another level (new in run 3). Select Level 1. Click "Add folder…" and choose `C:\Test\Tower` again.
   Expected: the line says "N pages are already on Ground floor and were not moved." Nothing moves. Select Ground floor and add the same folder: the line says "N pages are already on this level."
9. Tree (new in run 3). Look at the tree with the levels closed. Click the arrow of Ground floor.
   Expected: the level opens and shows the PDF names. Click a PDF name: its level is selected and its sheet is marked. No "Open" badge shows next to a building.
10. Add a PDF, then Open it (new in run 3). Add a PDF that MepApp never saved to Level 1. Look at its status. Click Open on its row.
    Expected: before Open the status says "Not opened yet" (not "Not saved yet"). The PDF opens in the viewer. In a few seconds the status turns "OK" and the row shows "Summary saved …". The row never says "Save it in MepApp to link it". The Open button now says "Opened" and is off.
11. Opened button (new in run 3). With the PDF of step 10 open, look at its row. Close its tab in the viewer.
    Expected: the button says "Opened" while the PDF is open. After the tab closes, the button says "Open" again.
12. Open keeps the dialog open. On Level 1, click Open on a sheet. Then click Open on a sheet of Ground floor. Then click Open on a third sheet.
    Expected: each PDF opens in the viewer at the right page. The Manage Buildings dialog stays open after each click. No error text shows. Close the dialog: the viewer has one tab for each PDF.
13. Delete text (new in run 3). Select a level that holds sheets.
    Expected: the text says "This level has N sheets. Move or remove them to delete the level." The Delete button is off. The old text "Remove its N sheets first" does not show. Remove the sheets, then delete the level: it works.
14. Passed in run 1, re-check only what changed. Make a new building with no level. Close the dialog.
    Expected: no question shows, because no page waits (the "Not placed" list is only for old buildings).
15. Passed in run 1, re-check only what changed. Close the app. Move or rename the PDF from `C:\Test\Other` in Windows Explorer. Start the app and open Tower from the tree (Manage Buildings…).
    Expected: the sheet shows "Missing". The row has "Relink…". Click it and choose the moved file. The status turns OK.
16. No access (one PC test). Close the app. Start the app again. Open Manage Buildings… and look at the status of the sheets that you added in an earlier run.
    Expected: if all sheets show OK, the folder scope survives a restart and the "No access" state cannot be made on this PC. The step then stays open. It is not a failure. If a sheet shows "No access", the row must have "Grant access…". Click it and choose the file. The status turns OK. Write down which case you see.
17. Open with from Explorer (changed in run 3). Close the app. In Explorer, right-click a PDF that is a sheet of the building, choose Open with MepApp (or drag the PDF onto the app).
    Expected: the PDF opens. Open Manage Buildings…. The sheet of this PDF shows "Opened". If the PDF was added to a level before and never saved, its status is "OK" with a summary (the app adopted the id of the sheet). If the file has no path, write that down. Write down which case you see.
18. Second building. Create a second building `Annex` with Menu, Manage Buildings…, Building menu, New building…. Add one level.
    Expected: the tree lists Annex and Tower in alphabetical order. No "Open" badge shows. Click Tower, then Annex: the order does not change.
19. Passed in run 1, re-check only what changed. Click Tower in the tree. Then click Annex.
    Expected: each click opens that building at once. The levels of the clicked building show. If a file is missing, the dialog shows a message with Dismiss.
20. Summaries. Open a building where some sheets have no summary and some files are missing.
    Expected: the Summaries section says "N sheets have no summary and can be read now." and, below, "M more sheets have no summary and cannot be read now: ..." with the reason (missing, no access, not opened yet or not checked yet). The footer of the sheets list says "X of Y sheets have a summary". Click "Read summaries now". The result says "Read N of M summaries". A failed sheet shows Relink and Choose file….
21. Level export and the Save question. Open a PDF from disk, add a stamp and do not save. Choose Level, pick Ground floor, click Export.
    Expected: the question "Save the drawing first so the export can be made?" shows with Save and Cancel. Cancel: nothing is exported. Export again and click Save. The save runs. Then the Save dialog for the xlsx file opens. Save the file. Excel opens a file named `Tower-Ground floor-quantities.xlsx` with the rows of that level only. The Warnings sheet does not say "the document has no id yet" for a PDF that you added and opened (new in run 3).
22. PDF stays unchanged (new in run 3). In Explorer, note the "Date modified" of a PDF. Add it to a level and click Open. Do not save. Look at the date again.
    Expected: the date did not change. The app writes the id into the PDF only when you save.
23. Passed in run 1, re-check only what changed. Make the window small (about 760 by 640 pixels). Open Manage Buildings….
    Expected: a select replaces the tree. No button is cut off. The Close button shows.
24. Layout. Open Manage Buildings… at a wide window (about 1600 pixels) and at a narrow window (about 760 pixels).
    Expected: sections have a title bar and a thin line between them. Sheet rows have fixed columns. "Add PDFs" and "Add folder" are a small strip at the bottom. At 760 wide, nothing overlaps and no button is cut off.
25. Tooltip on the status text. Make a long status text at the top right (for example fail an export). Hold the pointer over the text.
    Expected: a tooltip shows the full text.
26. No duplicate tab after Save. Add a PDF to a building with Add PDFs…. Open it with Open in the dialog. Edit it and click Save. Click Open on the same sheet again.
    Expected: the app switches to the tab that is open. It does not open a second tab of the same file. If a second tab opens, write down the file name and the time. This is a known open item.

Report each step as pass or fail. For a fail, write the text on the screen.

## Known open items

- The app checks for a path match on a PDF only when the PDF opens. It does not check again for each later open.
- Export Building (the select in the Export dialog) has no question for pages that are not placed.
- The dialog has no focus trap.
- The active PDF cannot pick the building it belongs to.
- A PDF that was open before you added it to a level gets the id of its sheet at once. Its summary is written at the next Save.
- Read summaries still tries a sheet that says Not opened yet and fails it with "not saved yet". Open the PDF instead.
- An old sheet with no id (made before run 3) still says "Not saved yet". Save the PDF once in MepApp to link it.
