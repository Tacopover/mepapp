# Test script B4: risers between levels

For one PC with Windows. Use the test build of the branch `worktree-buildings-b4`. Part A uses Chrome or Edge (desktop web store). Part B repeats the main steps in the desktop app, if the Tauri build is installed. Use two real plan PDFs of one building, for example `00_arch_ground_floor.pdf` and `01_arch_first_floor.pdf`. A riser (a vertical duct or pipe that joins one network on two or more levels) is a new object in the building file. Fake pickers cannot prove these steps. A real picker and a real browser profile can.

Words in this script: "level 0" is the lower level, "level 1" is the upper level. "The ring" is the dashed circle that shows where a riser comes through a level that has no part of it yet.

## Part A: Chrome or Edge

### Set up the building

1. Open the app. Open the menu and choose Manage Buildings. Click New building. Type "Tower". Press Enter. Save the file on the Desktop. Check: the building opens and the location line shows `Tower.building.json`.
2. Click "Add level" two times. Check: the levels are "Level 0" and "Level 1". Their elevations are 0 mm and 3000 mm. Click "Add PDF" on level 0 and pick the ground floor PDF. Click "Add PDF" on level 1 and pick the first floor PDF. Check: each level shows "1 sheet".
3. Close the dialog. Open Manage Buildings again. Click "Open" on the sheet of level 0. Pick the PDF if the app asks for it ("Choose file…"). Check: the PDF opens and the header shows `Tower / Level 0`.
4. On level 0, pick the network type Supply Air. Choose the Segment tool. Click two points to draw one horizontal segment of about 5 cm on screen. Press Escape. Set the scale of the page: use the Scale control in the status bar and choose 1:100. Check: the status bar says "Scale 1:100". In the menu choose Save. Check: the status line says "Saved".
5. Repeat step 3 and step 4 for the sheet of level 1. Use the same network type. Draw the segment at a different place, away from the segment of level 0. Use a different scale (for example 1:110). Save. Check: the status line says "Saved".

### Make a riser and attach it

6. Go to level 0 (the document switcher in the header). Choose the Select tool. Right-click one end of the segment (the fitting). Check: the menu has the entry "Make riser" above a line.
7. Click "Make riser". Check: a toast says "Supply Air riser 1 made on Level 0. Sheets line up only if the PDFs share the same origin and orientation." A ring mark shows on the fitting. Right-click the fitting again. Check: the menu now has "Detach from riser" and "Delete riser" and no "Make riser".
8. Click the fitting and press Delete. Check: the fitting stays. A toast says "This fitting belongs to Supply Air riser 1. Detach the riser first, or use Delete riser."
9. Go to level 1. Check: a dashed ring shows on the sheet, with the label "Supply Air riser 1". The ring is at the real position of the riser, not on a segment.
10. Pick the network type Extract Air. Choose the Segment tool. Click in free space, then move the mouse onto the ring. Check: a red tip shows: "Supply Air riser 1 takes only Supply Air. This segment is Extract air." Click on the ring. Check: the riser does not get a part on level 1. Press Escape.
11. Pick the network type Supply Air again. Draw a new segment: click in free space, then click on the ring. Check: a toast says "Supply Air riser 1 attached on Level 1." The ring becomes a solid mark. If the two PDFs have a different page size, the toast can add "Page sizes differ ...: the sheets may not line up". This is expected for two different PDFs.
12. In the menu choose Save on level 1. Go to level 0 and Save there.

### Move, undo and conflict

13. On level 0, click the riser fitting and drag it 2 to 3 cm up and to the right. Release. Check: a toast says "Supply Air riser 1 moved to match the building." No dialog opens.
14. Go to level 1. Check: the riser fitting is at the matching real position (the other scale is taken into account). The tab of level 1 shows that it has unsaved changes.
15. Go to level 0. Click the Undo button in the left rail (no keyboard shortcut). Check: the fitting goes back. Go to level 1. Check: the fitting of level 1 also went back.
16. On level 1, change the scale in the status bar (for example to 1:120). Check: a dialog opens with the title "Supply Air riser 1 is not at the building position" and three buttons in this order: "Decide later", "Snap back", "Move the riser here". Check: a click on the dark background does not close it. Press Escape. Check: the dialog closes, a toast says the riser is not at the building position, and the ring mark is amber.
17. Go to level 0 and back to level 1. Check: the dialog opens again. Click "Snap back". Check: the fitting goes back to the building position and the dialog closes.
18. Change the scale of level 1 again (for example to 1:115). When the dialog opens, click "Move the riser here". Check: the dialog closes. Go to level 0. Check: the riser fitting of level 0 is at the new position.

### Pending move on a closed level

19. Save level 1. Close level 1 (the tab menu or the document switcher). Go to level 0. Drag the riser fitting a short way. Check: no error shows. Save level 0.
20. Open Manage Buildings. Click "Open" on the sheet of level 1 (pick the PDF if asked). Check: the PDF opens. A notice says "Supply Air riser 1 moved on Level 1 to match the building." The fitting is at the new position. The tab of level 1 shows unsaved changes. Save level 1.

### Change the network type of the run

21. On level 0, click the segment of the riser run. In the Properties panel change the network type to Exhaust Air. Check: a toast says "Type changed on 2 levels for Exhaust Air riser 1." Go to level 1. Check: the run that touches the riser is Exhaust Air too. A segment of level 1 that does not touch the riser keeps Supply Air. Save both levels.
22. Close level 1. On level 0 change the type of the run back to Supply Air. Open level 1 from Manage Buildings. Check: a notice says "Supply Air riser 1 changed to Supply Air on Level 1." and the run has the type Supply Air. Save both levels.

### Delete a level that holds a riser part

23. Open Manage Buildings. Click "Level 1" in the tree. Check: the text "This level has 1 sheet. Move or remove it to delete the level." shows. Click "Delete". Check: nothing is deleted. Both levels stay in the tree.

### The Risers tab

24. Click the tab "Risers (1)". Check: a diagram shows two level lines (Level 1 above Level 0) with one riser line between them. A legend explains the three ring states (at position, waiting, not at position). The Supply Air filter checkbox is on.
25. Clear the Supply Air checkbox. Check: the riser line disappears. Set it again. Check: the line comes back.
26. Click the riser line. Check: the info box shows "Supply Air riser 1", "Level 0 to Level 1", "2 levels", "3.00 m", the flow direction "Not known yet", and one row for each level with the status "OK".
27. Press the Right Arrow key. Check: the selection moves to the next riser (with one riser it stays). Press Enter. Check: the focus moves to the title of the info box.
28. Click "Go to" on the row of Level 1. Check: the viewer shows level 1 and the dialog stays open. Click "Set by hand", choose "Down" in the list, and then click "Use the flow solve". Check: the direction goes back to "Not known yet".

### Export

29. Close the dialog. In the menu choose "Export quantities to Excel…". Choose the scope "Building". Click Export. Save the file on the Desktop. Open it in Excel.
30. Check the workbook. The sheet "Risers" has one row: riser "Supply Air riser 1", from Level 0 to Level 1, floor-to-floor length 3 m, floor crossings 1, flow direction "unknown", "Flow set by" = "Not known yet". The sheet "Building networks" has a row for Supply Air with the length of the segments and the riser length. The sheet "Fittings" has a column "Riser" with "Supply Air riser 1" on two fittings. The sheet "Segments" has the column "Building network" as its last column. The sheet "Warnings" has "Flow is not summed across levels." and the fire damper text.

### Detach and Delete riser

31. Open Manage Buildings and the tab "Risers". Click the riser. Click "Detach" on the row of Level 1. Check: a notice says "Supply Air riser 1 detached from Level 1." The riser has one row. Go to level 1. Check: the ring shows again, and the segment stays.
32. Click "Delete riser". Check: a question asks "Delete Supply Air riser 1? The fittings stay on the sheets." and the focus is on "Cancel". Press Escape. Check: only the question closes, and the riser stays. Click "Delete riser" again and confirm. Check: the Risers tab says that no risers exist. The ring mark is gone on level 0. The fitting stays.

### Restart of the web store

33. Make a riser again (steps 6 to 11). Close ALL Chrome windows. Open the app again. Open Manage Buildings and click "Tower". If the card "Allow access" shows, allow it. Check: the building opens and the tab "Risers (1)" lists the riser.
34. Check the sheets: the row button says "Choose file…". This is expected after a restart (D-B-53): the browser keeps no access to a PDF, so each PDF needs one "Choose file…". Click it for both sheets. Check: both PDFs open, the rings and the riser marks show, and no conflict dialog opens.

## Part B: desktop app (only if the Tauri build is installed)

35. Open the desktop app. Repeat steps 1 to 5 and 6 to 11. Check: the same texts show. The sheets open with "Open" and no "Choose file…" is needed.
36. Repeat steps 13 to 22 (move, undo, conflict, pending move, type change). Check: the same results.
37. Repeat steps 23 to 32 (delete level, Risers tab, export, Detach, Delete riser). Check: the same results. The save window of the export is the Windows window.
38. Close the app. Open it again. Open the building from the list. Check: the riser shows in the tab "Risers (1)" and the sheets open with "Open".

## What the agent did not run

- The agent ran no step on Windows. It ran the browser checks in Chromium on Linux with fake file pickers (OPFS handles) and a test store that stands in for the building file store.
- The agent did not run the desktop app (Tauri). Steps 35 to 38 are untested.
- The agent used no real browser profile. The agent did not test Allow on every visit, a restart, Edge, Firefox or Incognito for risers.
- The agent set the scale of a page through the scene API in the browser check, not through the status bar control. Steps 4, 5, 16 and 18 test the real control.
- The agent did not test with a large building (more than 10 levels or more than 5 risers) or with a PDF that has a rotated page.
- The agent did not test a shared coordinate system for the sheets. This is part B5: sheets line up only if the PDFs share one origin.
- The check on "Page sizes differ" uses two different real plans. A building with equal page sizes does not show that text.
