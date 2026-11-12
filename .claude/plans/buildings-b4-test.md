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
11. Pick the network type Supply Air again. Draw a new segment: click in free space, then click on the ring. Check: a toast says "Supply Air riser 1 attached on Level 1." The ring becomes a solid mark (not proven in a browser check: tell us what you see). If the two PDFs have a different page size, the toast can add "Page sizes differ ...: the sheets may not line up". This is expected for two different PDFs.
12. In the menu choose Save on level 1. Go to level 0 and Save there.

### Move, undo and conflict

13. On level 0, click the riser fitting and drag it 2 to 3 cm up and to the right. Release. Check: a toast says "Supply Air riser 1 moved to match the building." No dialog opens.
14. Go to level 1. Check: the riser fitting is at the matching real position (the other scale is taken into account). The tab of level 1 shows that it has unsaved changes (not proven in a browser check).
15. Go to level 0. Click the Undo button in the left rail (no keyboard shortcut). Check: the fitting goes back. Go to level 1. Check: the fitting of level 1 also went back.
16. On level 1, change the scale in the status bar (for example to 1:120). Check: a dialog opens with the title "Change the scale of Level 1 to 1:120?" and the text "PDFs that share a riser must have the same scale." It has three buttons in this order: "Cancel", "Set 1:120 on all 2 PDFs", "Disconnect the risers". The focus is on "Cancel". Check: a click on the dark background does not close it. Press Escape. Check: the dialog closes, a message says "The scale of Level 1 stays 1:100." (or the scale you had), and nothing moved.
17. Change the scale of level 1 again to 1:120 and click "Disconnect the risers". Check: a message says "1 riser disconnected. Its fittings are normal fittings now." The ring marks are gone and the riser is gone from the Risers tab. The fittings and segments stay. The Undo button does not bring the riser back (known). Make the riser again (steps 6 to 11) and go on.
18. Change the scale of level 1 again to 1:120 and click "Set 1:120 on all 2 PDFs". Check: a message says "The scale is 1:120 on 2 PDFs. The risers stay at the same real-world positions." Go to level 0. Check: the status bar says 1:120 there too, and the riser fitting did not move on the real-world position. Both PDFs now have one scale. A scale of 1:110 or 1:100 can only be set again through the same dialog.

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
27. Press the Right Arrow key. Check: the selection moves to the next riser (with one riser it stays; not proven in a browser check). Press Enter. Check: the focus moves to the title of the info box.
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

### Feedback round 1 (steps F1 to F9)

F1. Add one PDF to a level. Use "Save As" to make a copy of the PDF and add the copy to the same level. Make a riser on the first PDF (steps 6 and 7). Click "Remove" on the first PDF. Check: nothing is removed, and a message says "Could not remove <file> page 1. Detach <riser> first." Detach the riser. Click "Remove" again. Check: the PDF goes. Try the "Move to" list on a PDF that holds a riser part. Check: the same kind of message shows.
F2. Draw a segment with network type Supply Air on level 0 and make a riser (steps 6 and 7). Go to level 1. Choose the Select tool. Click the dashed ring. Check: the ring gets thicker with a faint fill. Click on empty canvas. Check: the ring is normal again.
F3. Right-click the ring. Check: a menu shows with one entry "Draw from". Click it. Check: a toast says "Supply Air riser 1 attached on Level 1." and a riser mark shows on a fitting at the ring. Move the mouse and click to draw a segment. Check: the segment has the network type Supply Air, also when another type is picked in the toolbar. Press Escape.
F4. Click the Undo button after "Draw from". Check: the fitting goes, a toast says "Supply Air riser 1 detached from Level 1.", and the ring shows again. Right-click the ring and choose "Draw from" again. Check: it works.
F5. On any level, draw a segment with network type Extract Air. Pick the network type Supply Air in the toolbar. Right-click the end fitting of the segment and choose "Draw from". Draw a segment. Check: the new segment is Extract Air, the type of the fitting, and not Supply Air.
F6. Start with a building that has no riser and two levels at different scales (steps 1 to 5). Make a riser on level 0 (it has one PDF, so this works). Go to level 1. Right-click a fitting that has the same network type. Check: "Make riser" is greyed and the hint says "Make riser is not possible here: the scale of Level 1 differs from Level 0." Draw a segment into the ring of the riser. Check: the ring turns red, nothing is drawn, and a message says to set the same scale first.
F7. Close level 1 with a riser that joins level 0 and level 1. On level 0 change the scale and choose "Set <scale> on all 2 PDFs". Check: a note in the dialog says that Level 1 is closed and gets the scale when it opens. Open level 1 from Manage Buildings. Check: the status bar shows the new scale and the riser fitting is at the real-world position.
F8. Use "Calibrate" in the left rail on a page that shares a riser, and set a new distance. Check: the same three-button dialog opens before the scale changes. Press Escape. Check: the scale did not change.
F9. Open a plain app with no building. Change the scale in the status bar. Check: no dialog opens and the scale changes at once.

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
- Feedback round 1 (F1 to F9): the agent ran these in Chromium on Linux only. A building file with a "set scale" pending change is refused by a B4 build from before this change (it names the kind as unknown). The file version stays 1.
- Known gaps in round 1: Undo on page 1 can remove a riser fitting of page 0 without a detach. The right-click menu can open behind the right dock when the ring is near it. A scale change has no undo. A PDF with no scale is ignored by the "same scale" rule.
- The agent did not test with a large building (more than 10 levels or more than 5 risers) or with a PDF that has a rotated page.
- The agent did not test a shared coordinate system for the sheets. This is part B5: sheets line up only if the PDFs share one origin.
- The check on "Page sizes differ" uses two different real plans. A building with equal page sizes does not show that text.
