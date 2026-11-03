# Windows test script: Buildings dialog (B3)

Use the desktop build (Tauri) on Windows. Use two or three real PDFs of drawings. Put two PDFs in one folder (`C:\Test\Tower`). Put one PDF in another folder (`C:\Test\Other`).

## What the web run could not prove

The browser check ran on the web build with a fake file picker. It did not run these:
- The real Windows file pickers (Add folder…, Add PDFs…, Open building…).
- Open by path, Grant access and the folder scope of the desktop file access.
- A PDF that the app opens by "Open with" or by drag (it may have no path).
- A real switch between two building files. The web store holds one file, so the check loaded the file into the store first.
- Screen reader, dark theme, and real Windows scaling.

## Steps

1. Start the app. Open Menu, Manage Buildings…. Click New building, type `Tower`, press Enter.
   Expected: the dialog shows Tower with "0 levels, 0 sheets".
2. Click "+ Add level". Type `Ground floor` and press Enter. Add a second level and type `Level 1`.
   Expected: the tree shows both levels.
3. Select Ground floor. Click "Add folder…" and choose `C:\Test\Tower`.
   Expected: the folder picker opens. Each page of the PDFs in the folder appears under "Not placed" in the tree.
4. Select one PDF and choose "Assign all pages" to Ground floor.
   Expected: the pages go to Ground floor. The Not placed node shrinks or goes away.
5. Click "Add PDFs…" and choose the PDF in `C:\Test\Other`. If the picker lets you pick more than one file, pick two.
   Expected: the pages wait under Not placed. If only one file is possible, say so in your notes.
6. Close the dialog while pages still wait.
   Expected: the dialog asks "N pages are not placed. Close anyway?" with two buttons. "Keep working" keeps the dialog open. The focus stays inside the dialog.
7. Assign the waiting pages to Level 1. On Level 1, click Open on the sheet from `C:\Test\Other`.
   Expected: the PDF opens in the viewer at the right page. No error text shows.
8. Close the app. Move or rename the PDF from `C:\Test\Other` in Windows Explorer. Start the app and open Tower from the tree (Manage Buildings…).
   Expected: the sheet shows "Missing". The row has "Relink…". Click it and choose the moved file. The status turns OK.
9. Make a sheet whose PDF is outside the granted folder (for example open Tower on a PC where `C:\Test\Other` was never granted). Look at its row.
   Expected: the status says "No access". The row has "Grant access…". Click it and choose the file. The status turns OK.
10. Close the app. In Explorer, right-click a PDF of the building, choose Open with MepApp (or drag the PDF onto the app).
    Expected: the PDF opens. Open Manage Buildings…, then Open in the viewer. If the PDF is in the building, it links to its sheet. If the file has no path, the row says "Save it to link it". Write down which case you see.
11. Create a second building `Annex` with Menu, Manage Buildings…, Building menu, New building…. Add one level.
    Expected: the tree lists Tower and Annex. Annex has the Open marker.
12. Click Tower in the tree. Then click Annex.
    Expected: each click opens that building at once. The levels of the clicked building show. If a file is missing, the dialog shows a message with Dismiss.
13. Open a building where some sheets have no summary.
    Expected: the header shows "N sheets have no summary" and the button "Read summaries now". Click it. The result says "Read N of M summaries". The button goes away when all sheets are read. A failed sheet shows Relink and Choose file….
14. Click Building menu, Close building. Close the dialog. Open Menu, Export quantities to Excel….
    Expected: Level and Building are off. A select "Building" and the buttons "Open building…" and "Manage Buildings…" show. Choose Tower in the select. Level and Building turn on.
15. Choose Level, pick Ground floor, click Export. Save the file.
    Expected: Excel opens a file named `Tower-Ground floor-quantities.xlsx` with the rows of that level only.
16. Export again with scope Building.
    Expected: the file holds the rows of all levels. The Export dialog keeps the same width for each scope.
17. Make the window small (about 760 by 640 pixels). Open Manage Buildings….
    Expected: a select replaces the tree. No button is cut off. The Close button shows.

Report each step as pass or fail. For a fail, write the text on the screen.
