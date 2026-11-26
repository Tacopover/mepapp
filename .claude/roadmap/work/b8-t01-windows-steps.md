# B8-T01 platform test script (Windows, one PC)

Tester: one person, one PC, Chrome or Edge. Start from a new browser profile. Open the build under test and a second tab with the live site `https://app.mepsketcher.com` (the old build, needed in step 3 only). Each step lists what to do and what to see. "Open the editor" means: dock tab MEP, sub-tab Network Types, click the colored dot on the tile (its hover text is "Edit"). Clicking the tile name does not open the editor.

Note for step 1 and step 2: Menu > Save writes the project into the PDF (status text "Saved drawing.pdf."). There is no separate project file. The spec text "project file" means the saved PDF.

1. Save and open with a real file on disk (spec step 1, J3).
   1. Open a PDF with Menu > Open. Open the editor for Return Air. Flow direction shows "Return (toward source)".
   2. Choose "Supply (away from source)". Click Save.
   3. Open the editor for Chilled Water. Click Duplicate. Type the name "Chilled Water return". Choose "Return (toward source)". Click Save.
   4. Menu > Save. In the real file dialog pick a folder on disk. Read the status text "Saved ...".
   5. Close the tab. Open the app again. Menu > Open. Pick the saved PDF from disk.
   6. Open the editor for Return Air: it shows Supply. Click Cancel. Open the editor for "Chilled Water return": it shows Return. Open Chilled Water: it shows Supply.
2. A drawing saved before this change (spec step 2, J6). One PC can do it with the live site as the old build.
   1. In the tab with the live site (old build), open a PDF, draw one segment with Return Air, Menu > Save, keep the file.
   2. In the tab with the build under test, Menu > Open, pick that file.
   3. Open the editor for Return Air: it shows "Return (toward source)". Open the Plumbing filter, open Sanitary Waste: it shows Return. Open Supply Air: it shows Supply.
   4. Save the file again in the new build and open it again: the values stay.
3. Native select popup (spec step 3).
   1. Open the editor for any type. Click the Flow direction select. Read both option texts in full in the Windows popup list: "Supply (away from source)" and "Return (toward source)".
   2. Set Windows display scale to 125 % (Settings > System > Display > Scale). Reload the page. Repeat step 3.1. Check that no row of the editor is cut and that Cancel, Duplicate and Save are visible.
   3. Repeat at 150 %. If the tester does not want to change the display scale, use the browser zoom (Ctrl and +) at 125 % and 150 % and write "browser zoom, not display scale" in the result.
4. The "i" mark (spec step 4).
   1. Hover the "i" next to Flow direction. The text reads: "A network type has one flow direction. For the other direction of the same system, use Duplicate and change the copy." The text is whole and inside the window.
   2. Click in the Flow direction select, then press Tab. The focus is on the "i" and the text shows. Press Escape: only the text closes and the editor stays open. Press Escape again: the editor closes.
   3. Press Tab through the whole editor from the Name field. The order is: Name, Discipline, Color, Thickness, Pattern, Flow direction, "i", Flow unit, Sizing method, Cancel, Duplicate, Save.
5. Duplicate of a type never used (spec step 5).
   1. Open a new drawing with a PDF and draw nothing. Open the editor for Chilled Water. Click Duplicate. The title shows "Network type: Chilled Water_copy".
   2. Type the name "Chilled Water return". Choose "Return (toward source)". Click Save. The tile "Chilled Water return" shows in the Network Types list. Chilled Water still shows Supply.
6. Narrow window (spec step 6).
   1. Make the browser window 760 px wide (drag the edge, or use the window of the desktop app). Open the editor. Every row is whole. Cancel, Duplicate and Save are visible. Make the window low (about 520 px high): Save is still visible.
7. Leave without saving (goal G3, not in spec section 11).
   1. Open the editor. Change the name and the Flow direction. Click Cancel. Open the editor again: the old name and the old value show.
   2. Repeat with the Escape key, then with a click on the dark area outside the editor. Each time nothing is saved.
   3. Open the editor, click Duplicate, click Cancel. Write down if a tile "..._copy" stays in the list (the check on the web build shows that it stays).
8. Long names (stress, not in spec section 11).
   1. Make 3 copies with names of 80 characters. Look at the Network Types tab at the width of the dock. Write down if the tiles stay inside the panel and if the sub-tabs stay visible (the web check shows that the grid grows wider than the panel).
9. Desktop app, only if a Windows build exists (tag `desktop-v*`). Do step 1 again in the desktop app with the native Save and Open dialogs. The same PC runs both the browser and the desktop app.

Not a step: an older build that refuses a version 24 file (one PC cannot hold both builds in the same state; the core unit test covers it).
