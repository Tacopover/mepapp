# Test script B6: open the PDFs of a building without the file picker

For one PC with Windows. Use the test build of the branch `worktree-buildings-b6`. Parts A to C use Chrome or Edge. Part D uses Firefox. Part E uses a private window. The agent could not run a real browser profile, a real permission prompt, Firefox, Safari, Tauri or Windows. The steps below cover exactly these gaps.

Words in this script: a "handle" is a link that the browser keeps to one file on disk. The app stores handles in the browser (IndexedDB). The "band" is the strip at the top of the Sheets section. It shows the button "Reconnect PDFs…". "Allow on every visit" is a choice in the permission question of Chrome and Edge.

Use 5 real plan PDFs of one building on 2 levels. Put all 5 in one folder, for example `C:\Plans\Tower`. Level 0 gets 3 PDFs. Level 1 gets 2 PDFs. Use a building file that you made in B4, or make a new one ("Tower" with "Level 0" and "Level 1").

## Part A: Chrome or Edge, restart

1. Open the app. Open Manage Buildings. Open your building file. Check: both levels show their sheets. Click "Add PDF" on a level and pick the PDFs of that level. Check: each level shows its sheets.
2. Click "Open" on one sheet. Check: the PDF opens. Close the browser window fully (all windows of the browser).
3. Start the browser again. Open the app. Open Manage Buildings. Open the same building file. Check: the sheet rows say "Open", not "Choose file…". No band shows if the app can open every PDF from its stored handles.
4. Click "Open" on a sheet. Check: the browser may ask "View files?" or a similar permission question. Choose "Allow on every visit" if the question offers it. Check: the PDF opens at once. No file picker shows.
5. Click "Open" on another sheet. Check: the PDF opens. No question and no picker shows if you chose "Allow on every visit" in step 4. If you chose a one-time allow, one more question is normal.
6. Open the Risers tab. Click "Go to" on a riser part on a closed level. Check: the PDF opens. No file picker shows.

## Part B: Chrome or Edge, folder permission

7. Close the browser fully. Start it again. Open the app and the building file.
8. In the Sheets section, find the button "Allow access to the PDF folder…". Click it. Pick the folder `C:\Plans\Tower`. Check: the browser asks for permission for the folder. Allow it. Check: the notice says "Found all 5 PDFs in Tower." (or the number of PDFs of the scope that you chose).
9. Click "Open" on each sheet. Check: every PDF opens with no further question and no picker.
10. Close the browser fully. Start it again. Open the building file. Click "Open" on one sheet. Check: the browser asks for the folder permission once. Allow it. Check: the PDF opens. Click "Open" on a second sheet. Check: no further question shows.
11. Click "Open" two times quickly on two different sheets. Check: both PDFs open one after the other. No error notice shows. The second one can take some seconds.

## Part C: Chrome or Edge, failures

12. Move one PDF to another folder, for example `C:\Plans\Moved`. In the app, click "Open" on that sheet. Check: the notice says the app could not open the file. The row then says "Choose file…". Pick the PDF in its new place. Check: the PDF opens.
13. Rename a second PDF on disk. Click "Open" on that sheet. Check: the same notice and the same recovery.
14. Change a third PDF on disk (open it in a PDF tool, change it and save it, so that the size changes). Click "Open" on that sheet. Check: the app does not open the changed file by mistake. It asks you to choose the file. Write down what you see. This is an open item: the row can keep "Choose file…" until you use "Relink".
15. Click "Open" on a sheet. In the permission question, choose "Block". Check: the notice says "Access was not allowed. Choose the files with Reconnect PDFs…, or change the site setting in the browser." Click "Reconnect PDFs…" and select all 5 PDFs of the folder. Check: the notice says "Found all 5 PDFs." and the rows say "Open".
16. Select the PDFs of another building in "Reconnect PDFs…". Check: the notice says how many files are for other levels or other sheets, and it keeps the found count correct.
17. Clear the site data of the app in the browser settings. Open the app and the building file. Check: the rows say "Choose file…". The band shows "Reconnect PDFs…". One reconnect brings back all rows. This is the expected fallback.

## Part D: Firefox

18. Open the app in Firefox. Open the building file. Check: the rows say "Choose file…". The band shows "Reconnect PDFs…". The button "Allow access to the PDF folder…" does not show.
19. Click "Reconnect PDFs…". Select all 5 PDFs in the file dialog (Ctrl+A). Check: the notice says "Found all 5 PDFs." The rows say "Open". Click "Open" on a sheet. Check: the PDF opens.
20. Select only 3 PDFs. Check: the notice names the missing files.
21. Close Firefox. Start it again. Check: the rows say "Choose file…" again. This is expected. Firefox keeps no file access.

## Part E: private window (Incognito or InPrivate)

22. Open the app in a private window of Chrome or Edge. Open the building file. Check: the app works. If the browser keeps no handles, the rows say "Choose file…" and "Reconnect PDFs…" works. No error shows.

## Part F: no change for other users

23. In Chrome, open the app without any building. Open a PDF with the normal "Open" command. Check: it works as before.
24. Open a building, draw one segment, save. Check: the status line says "Saved". Open the building file again later. Check: the file has the same format as before (the building file is not changed by B6).

## What the agent did not run

- A real permission prompt, "Allow on every visit", a browser restart with a real profile, a real file that moves on disk, Firefox, Safari, Edge, Tauri and Windows.
- Headless Chromium crashed when it read a real stored file handle back from IndexedDB. The checks used a stand-in. Steps 3 to 10 are the first real test of this path. If a stored handle fails in a real browser, report the exact notice text.
- Open items the user decides: the old row text "Not linked yet" next to a working "Open" button; the two labels "Allow access to the PDF folder…" and "Reconnect PDFs…" that can look alike; a changed file that keeps "Choose file…" until "Relink"; denied files that have no bulk recovery.
