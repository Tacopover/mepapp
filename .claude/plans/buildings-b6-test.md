# Test script B6: open the PDFs of a building without the file picker

For one PC with Windows. Use the test build of the branch `worktree-buildings-b6`. Parts A to C and G use Chrome or Edge. Part D uses Firefox. Part E uses a private window. The agent could not run a real browser profile, a real permission prompt, Firefox, Safari, Tauri or Windows. The steps below cover exactly these gaps.

Words in this script: a "handle" is a link that the browser keeps to one file on disk. The app stores handles in the browser (IndexedDB). The "band" is the strip at the top of the Sheets section. It shows one button, "Reconnect PDFs…". In Chrome and Edge the button opens a menu with "Choose a folder…" and "Choose files…". In Firefox and Safari the button opens the file picker at once. "Allow on every visit" is a choice in the permission question of Chrome and Edge. A "changed" PDF is a PDF that another program saved after you added it to the building. Its size is different.

Use 5 real plan PDFs of one building on 2 levels. Put all 5 in one folder, for example `C:\Plans\Tower`. Level 0 gets 3 PDFs. Level 1 gets 2 PDFs. Use a building file that you made in B4, or make a new one ("Tower" with "Level 0" and "Level 1").

## Part A: Chrome or Edge, restart

1. Open the app. Open Manage Buildings. Open your building file. Check: both levels show their sheets. Click "Add PDF" on a level and pick the PDFs of that level. Check: each level shows its sheets.
2. Click "Open" on one sheet. Check: the PDF opens. Close the browser window fully (all windows of the browser).
3. Start the browser again. Open the app. Open Manage Buildings. Open the same building file. Check: the sheet rows say "Open", not "Choose file…". The band can show the hint "5 PDFs are saved in this browser. Click Reconnect PDFs… to open them all." Each row that needs a file says "The browser needs this PDF file again. Click Choose file…"
4. Click "Open" on a sheet. Check: the browser may ask "View files?" or a similar permission question. Choose "Allow on every visit" if the question offers it. Check: the PDF opens at once. No file picker shows.
5. Click "Open" on another sheet. Check: the PDF opens. No question and no picker shows if you chose "Allow on every visit" in step 4. If you chose a one-time allow, one more question is normal.
6. Open the Risers tab. Click "Go to" on a riser part on a closed level. Check: the PDF opens. No file picker shows.

## Part B: Chrome or Edge, folder permission

7. Close the browser fully. Start it again. Open the app and the building file.
8. In the Sheets section, click "Reconnect PDFs…". Check: a small menu shows with "Choose a folder…" and "Choose files…". Each item has one line of help text. Click "Choose a folder…". Pick the folder `C:\Plans\Tower`. Check: the browser asks for permission for the folder. Allow it. Check: the notice says "Found all 5 PDFs in Tower." (or the number of PDFs of the scope that you chose). The band is gone.
9. Click "Open" on each sheet. Check: every PDF opens with no further question and no picker.
10. Close the browser fully. Start it again. Open the building file. Check: the band says "… Click Reconnect PDFs… and use the folder Tower to open them." Click "Open" on one sheet. Check: the browser asks for the folder permission once. Allow it. Check: the PDF opens. Click "Open" on a second sheet. Check: no further question shows.
11. Click "Open" two times quickly on two different sheets. Check: both PDFs open one after the other. No error notice shows. The second one can take some seconds.
12. Close the browser. Start it again. Open the building file. Click "Reconnect PDFs…". Check: the menu shows "Use the folder Tower", "Choose another folder…" and "Choose files…". Click "Use the folder Tower". Check: Chrome asks once. Allow it. Check: the band goes away. Check that the band never shows the text "Allow access to the PDF folder".

## Part C: Chrome or Edge, failures

13. Move one PDF to another folder, for example `C:\Plans\Moved`. In the app, click "Open" on that sheet. Check: the notice says the app could not open the file. The row then says "Choose file…". Pick the PDF in its new place. Check: the PDF opens.
14. Rename a second PDF on disk. Click "Open" on that sheet. Check: the same notice and the same recovery.
15. Click "Open" on a sheet. In the permission question, choose "Block". Check: the notice says "Access was not allowed. Click Reconnect PDFs… and choose the files, or change the site setting in the browser." Click "Reconnect PDFs…", then "Choose files…", and select all 5 PDFs of the folder. Check: the notice says "Found all 5 PDFs." and the rows say "Open".
16. Select the PDFs of another building in "Reconnect PDFs…" then "Choose files…". Check: the notice says how many files are for other levels or other sheets, and it keeps the found count correct.
17. Clear the site data of the app in the browser settings. Open the app and the building file. Check: the rows say "Choose file…". The band shows "Reconnect PDFs…". One reconnect brings back all rows. This is the expected fallback.

## Part D: Firefox

18. Open the app in Firefox. Open the building file. Check: the rows say "Choose file…". The band shows "Reconnect PDFs…". No menu shows and no word "folder" shows in the band.
19. Click "Reconnect PDFs…". Check: the file dialog opens at once. Select all 5 PDFs in the file dialog (Ctrl+A). Check: the notice says "Found all 5 PDFs." The rows say "Open". Click "Open" on a sheet. Check: the PDF opens.
20. Select only 3 PDFs. Check: the notice names the missing files.
21. Close Firefox. Start it again. Check: the rows say "Choose file…" again. This is expected. Firefox keeps no file access.
22. In Firefox, edit one PDF in another program and save it. Click "Reconnect PDFs…" and select all PDFs. Check: the prompt "<name> changed. Use the new file for N sheets?" shows. No word "folder" shows on the screen.

## Part E: private window (Incognito or InPrivate)

23. Open the app in a private window of Chrome or Edge. Open the building file. Check: the app works. If the browser keeps no handles, the rows say "Choose file…" and "Reconnect PDFs…" works. No error shows.

## Part F: no change for other users

24. In Chrome, open the app without any building. Open a PDF with the normal "Open" command. Check: it works as before.
25. Open a building, draw one segment, save. Check: the status line says "Saved". Open the building file again later. Check: the file has the same format as before (the building file is not changed by B6).

## Part G: Chrome or Edge, a PDF that another program changed

26. Add `plan-L1.pdf` (2 sheets) with "Add PDFs…". Open it in another viewer (Edge or Acrobat), add a text note, and save. Close the other viewer.
27. In MepApp click "Open" on a row of the PDF. Check: the prompt "plan-L1.pdf changed. Use the new file for 2 sheets?" shows under the row. Read it word for word. Check: the sheet is not open yet.
28. Click "Cancel". Check: the sheet does not open. The row button says "Choose file…". The row line says "The PDF changed after it was added. Click Choose file… and use the new file."
29. Click "Choose file…". Pick the file. Check: the prompt shows again. Click "Use new file". Check: the sheet opens. The notice says "Using the new plan-L1.pdf for 2 sheets." Both rows say "Open" (or "Opened"). Restart Chrome and open the building. Check: the rows still say "Open" and open with no prompt.
30. (Opening a locked PDF.) Edit and save the PDF again with the other viewer still open (file lock). Click "Open". Write down what you see: the prompt, or "Could not open …". This is an open item: the real result depends on the other viewer.
30b. Open a PDF in MepApp and keep it open in another viewer. Make a change and press Save in MepApp. Check: a toast shows "Could not save <name>. Another program may have the file open. Close it there and save again. Your changes are still in MepApp." The toast stays until you click it. The status line says "Failed to save." Check that the close dialog (close the document from the document list) still warns about unsaved changes. Close the other viewer and press Save again. Check: the status line says "Saved <name>." and the toast is gone. If your viewer does not lock the file, write down that the text did not show.
31. Edit three PDFs. Click "Reconnect PDFs…", then "Choose files…", press Ctrl+A in the picker, and confirm. Check: one prompt names the 3 PDFs and the sheet count. Click "Use new files". Check: the notice says "Using the new files for 3 PDFs (N sheets)." All rows say "Open".
32. Repeat step 31 and click "Cancel". Check: the notice names the 3 PDFs and does not say "Found all". The band says "3 PDFs changed after they were added. Click Reconnect PDFs… and choose the new files." The rows show the changed line.
33. Put 3 edited PDFs in a folder, with 2 old copies that have another file name next to them. Click "Reconnect PDFs…", then "Choose a folder…". Check: the prompt names only the 3 PDFs.
34. Copy one edited PDF into two sub folders. Change one copy so that its size is different. Scan the folder. Check: the notice says "the folder has two different files with another size". Check that "Choose file…" on the row works.
35. Remove page 3 of a 3-page PDF in the other viewer. Click "Open" on the row of page 1. Check: the prompt names the lost page ("The sheet for page 3 cannot open."). Click "Use new file". Click "Open" on the row of page 3. Check: the error notice says "Could not open … page 3. The file has 2 pages." and the row line says "Page 3 is not in the file. Remove this sheet, or choose another file." Click "Remove" on it.
36. Edit a large PDF (50 MB or more). Check how long the prompt takes and that nothing freezes.
37. Pick a PDF from another project with the same file name. Check: the old question "… is a different document than the sheets of … Relink the sheets to it?" shows, and no second question.

## Part H: the menu and the row texts

38. Menu with the keyboard: press Tab to "Reconnect PDFs…", press Enter, press Arrow Down two times, press Esc. Check: the focus returns to the button. Press Enter again, then Enter on "Choose files…". Check: the file picker opens.
39. Check the menu at the window widths 1600, 1100 and 760 px, and in a small window (1366 x 768) at the bottom right of the screen. Check: the menu is not cut by the dialog.
40. Row texts: look at one row of each state: open in a tab ("Opened", no line), can open (no line), needs the file ("The browser needs this PDF file again. Click Choose file…"), changed, and a PDF with no MepApp id ("This sheet finds its PDF by file name and size. Save the PDF once in MepApp to link it for good."). Read each line.
41. Desktop app: nothing of the menu, the prompt or the new row lines shows. The rows and "Relink…" work as before.

## What the agent did not run

- A real permission prompt, "Allow on every visit", a browser restart with a real profile, a real file that moves on disk, a real save by another viewer (in place or by rename), a file lock, Firefox, Safari, Edge, Tauri and Windows.
- Headless Chromium crashed when it read a real stored file handle back from IndexedDB. The checks used a stand-in. Steps 3 to 12 and 26 to 29 are the first real test of this path. If a stored handle fails in a real browser, report the exact notice text.
- A PDF with a MepApp project id of another document (step 37). The fixtures have no id, so the "different document" question was not reached in the browser.
- Open items the user decides: the old row text "Not linked yet" next to a working "Open" button (the line under the row now explains it); denied files that have no bulk recovery; "Choose file…" after a cancelled prompt goes to the file picker at once.
