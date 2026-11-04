# Windows test script: Buildings dialog (B3, run 2)

Use the desktop build (Tauri) on Windows. Use a build that has the T12a to T12e changes. Use two or three real PDFs of drawings. Put two PDFs in one folder (`C:\Test\Tower`). Put one PDF in another folder (`C:\Test\Other`).

## Run 1 and run 2

In run 1 (installer `desktop-v0.1.0-test.5`) you passed steps 1, 2, 4, 6, 8, 10, 12, 16 and 17 of the old script. In run 2, check again only what changed. A step marked "passed in run 1" needs a quick look, not a full test. Steps without that mark are new or changed: test them fully.

## What the web run could not prove

The browser check ran on the web build with a fake file picker. It did not run these:
- The real Windows file pickers (Add folder…, Add PDFs…, Open building…).
- Open by path, Grant access and the folder scope of the desktop file access.
- A PDF that the app opens by "Open with" or by drag (it may have no path).
- A real switch between two building files. The web store holds one file, so the check loaded the file into the store first.
- Screen reader, dark theme, and real Windows scaling.
- Whether the Windows save dialog and the "Open after Save" path give the same file path in the building and in the open tab.

## Steps

1. Passed in run 1, re-check only what changed. Start the app. Open Menu, Manage Buildings…. Click New building, type `Tower`, press Enter.
   Expected: the dialog shows Tower with "0 levels, 0 sheets".
2. Passed in run 1, re-check only what changed. Click "+ Add level". Type `Ground floor` and press Enter. Add a second level and type `Level 1`.
   Expected: the tree shows both levels.
3. Elevation order (new). Set the elevation of `Level 1` to 3000 and of `Ground floor` to 0. Add a third level `Basement` with elevation -3000.
   Expected: the levels show in this order, top to bottom: Basement, Ground floor, Level 1. Change an elevation: the order changes at once. No "Move up", "Move down" or "Sort by elevation" button shows. Two levels with the same elevation sort by name. In the building list, the buildings stay in alphabetical order. Selecting a building does not move it.
4. Add folder (changed). Select Ground floor. Click "Add folder…" and choose `C:\Test\Tower`.
   Expected: the folder picker opens. Each page of the PDFs in the folder appears under Ground floor at once. No "Not placed" node shows.
5. Add PDFs (changed). Select Level 1. Click "Add PDFs…" and choose the PDF in `C:\Test\Other`. If the picker lets you pick more than one file, pick two.
   Expected: the pages appear under Level 1 at once. If only one file is possible, say so in your notes. "Not placed" shows only in the edge case of a building with no level (see step 6).
6. Passed in run 1, re-check only what changed. Make a new building with no level and add a PDF (edge case). Close the dialog while pages still wait.
   Expected: the dialog asks "N pages are not placed. Close anyway?" with two buttons. "Keep working" keeps the dialog open. The focus stays inside the dialog.
7. Open keeps the dialog open (changed). On Level 1, click Open on a sheet. Then click Open on a sheet of Ground floor. Then click Open on a third sheet.
   Expected: each PDF opens in the viewer at the right page. The Manage Buildings dialog stays open after each click. No error text shows. Close the dialog: the viewer has one tab for each PDF.
8. Passed in run 1, re-check only what changed. Close the app. Move or rename the PDF from `C:\Test\Other` in Windows Explorer. Start the app and open Tower from the tree (Manage Buildings…).
   Expected: the sheet shows "Missing". The row has "Relink…". Click it and choose the moved file. The status turns OK.
9. No access (one PC test). You have no second PC, so you cannot make a path outside the granted scope. Do this test instead. Close the app. Start the app again. Open Manage Buildings… and look at the status of the sheets that you added in an earlier run.
   Expected: if all sheets show OK, the folder scope survives a restart and the "No access" state cannot be made on this PC. The step then stays open. It is not a failure. If a sheet shows "No access", the row must have "Grant access…". Click it and choose the file. The status turns OK. Write down which case you see.
10. Passed in run 1, re-check only what changed. Close the app. In Explorer, right-click a PDF of the building, choose Open with MepApp (or drag the PDF onto the app).
    Expected: the PDF opens. Open Manage Buildings…, then Open in the viewer. If the PDF is in the building, it links to its sheet. If the file has no path, the row says "Save it to link it". Write down which case you see.
11. Second building (changed). Create a second building `Annex` with Menu, Manage Buildings…, Building menu, New building…. Add one level.
    Expected: the tree lists Annex and Tower in alphabetical order. Annex has the Open marker. Click Tower, then Annex: the order of the two buildings does not change.
12. Passed in run 1, re-check only what changed. Click Tower in the tree. Then click Annex.
    Expected: each click opens that building at once. The levels of the clicked building show. If a file is missing, the dialog shows a message with Dismiss.
13. Summaries (changed). Open a building where some sheets have no summary and some files are missing.
    Expected: the Summaries section says "N sheets have no summary and can be read now." and, below, "M more sheets have no summary and cannot be read now: ..." with the reason (missing, no access or not checked yet). The footer of the sheets list says "X of Y sheets have a summary". The numbers add up: N + M = Y - X. Click "Read summaries now". The result says "Read N of M summaries". The button goes away when all readable sheets are read. A failed sheet shows Relink and Choose file….
14. No Close building (changed). Open the Building menu. Close the dialog. Open Menu, Export quantities to Excel….
    Expected: the Building menu has no "Close building". The Export dialog shows a select "Building" (label "Read from") with the open building first. Level and Building are on. Choose Annex in the select: the Level select shows the levels of Annex. Choose Tower again.
15. Level export and the Save question (changed). Open a PDF from disk, add a stamp and do not save. Choose Level, pick Ground floor, click Export.
    Expected: the question "Save the drawing first so the export can be made?" shows with Save and Cancel. Cancel: nothing is exported and the drawing stays as it is. Export again and click Save. The save runs. Then the Save dialog for the xlsx file opens. Save the file.
    Expected: Excel opens a file named `Tower-Ground floor-quantities.xlsx` with the rows of that level only. The Warnings sheet does not say "the document has no id yet" for the sheet of this PDF. If the save worked but the file has no id, the status shows "Saved, but the drawing has no id in the file yet…" and nothing is exported.
16. Passed in run 1, re-check only what changed. Export again with scope Building.
    Expected: the file holds the rows of all levels. The Export dialog keeps the same width for each scope.
17. Passed in run 1, re-check only what changed. Make the window small (about 760 by 640 pixels). Open Manage Buildings….
    Expected: a select replaces the tree. No button is cut off. The Close button shows.
18. Layout (new). Open Manage Buildings… at a wide window (about 1600 pixels) and at a narrow window (about 760 pixels).
    Expected: the Level pane and the Building sheets pane show sections with a title bar and a thin line between them. "Name" and "Elevation" come first. Sheet rows have fixed columns: the name on the left (a long name is cut with an ellipsis and has a tooltip with the full name), the status in one column, the actions on the right. "Add PDFs" and "Add folder" are a small strip at the bottom. The summaries row is not cut. At 760 wide, nothing overlaps and no button is cut off.
19. Tooltip on the status text (new). Make a long status text at the top right (for example fail an export). Hold the pointer over the text.
    Expected: a tooltip shows the full text.
20. No duplicate tab after Save (new). Add a PDF to a building with Add PDFs…. Open it with Open in the dialog. Edit it and click Save. Click Open on the same sheet again.
    Expected: the app switches to the tab that is open. It does not open a second tab of the same file. If the file changed on disk after your save and a second tab opens, write down the file name and the time. This is a known open item (see the feedback plan).

Report each step as pass or fail. For a fail, write the text on the screen.
