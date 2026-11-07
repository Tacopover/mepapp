# Test script B1-T19: buildings in the browser

For one PC. Use Chrome (steps 1 to 12) and Firefox (steps 13 to 17). Use the test build of the branch `worktree-buildings-t19`. Fake pickers cannot prove these steps. Check: the button of each sheet says "Open". Click "Open" on one sheet. Check: the PDF opens in the viewer and no file window opens. The app keeps the picked file in memory for this tab only. A real picker proves that the kept file handle still reads the file.

## Chrome

1. Open the app. Open the menu and choose Manage Buildings. Check: no text "Use the desktop app". The text "No building is open" shows. No yellow alert shows.
2. Click New building. Type "Office 12". Press Enter. Check: the real Windows save window opens. Save the file on the Desktop. Check: the building opens and the location line shows `Office 12.building.json`. Check: the file exists on the Desktop.
3. Click "Add level", then "Add PDF". Choose two PDFs in one pick (hold Ctrl). Check: both PDFs show as sheets of the level.
4. Close the dialog. Close ALL Chrome windows. Open Chrome and the app again.
5. Open Manage Buildings. Check: "Office 12" is in the list.
6. Click "Office 12". Check: a card shows with the button "Allow access" and the text about Allow on every visit.
7. Click "Allow access". Check: the Chrome prompt shows. Choose "Don't allow". Check: the card stays and says "Access was not given."
8. Click "Allow access" again. Choose "Allow on every visit". Check: the building opens with the level and the two sheets.
9. Check the sheets: the chip never says "Missing" or "No access". The row button says "Choose file…". Click it and pick the PDF. Check: the PDF opens in the viewer.
10. Close all Chrome windows. Open the app. Click "Office 12". Check: no prompt (Allow on every visit) and the building opens at once.
11. Close the dialog. In Windows Explorer, rename `Office 12.building.json` to `Office 13.building.json`. In the app click "Office 12" in the list. Check: the red message "The building file "Office 12" was not found. Use Open building… to find it." Click Open building… and choose the renamed file. Check: the building opens.
12. Open a Chrome Incognito window. Open the app and create a building. Check: it works. Close the window. Check nothing else changes in the normal window.

## Firefox

13. Open the app in Firefox. Open Manage Buildings. Check: the alert "This browser keeps the building inside the browser. Use Chrome or Edge if you want to see or move the file." shows at the top of the right pane.
14. Click New building. Type "Home". Press Enter. Check: no save window opens and no file downloads. The building opens. The location line says "Kept inside this browser".
15. Reload the tab. Open Manage Buildings, click "Home". Check: the building opens at once, with no Allow access card.
16. Open the Building menu and choose "Save a copy…". Check: Firefox downloads `Home.building.json`. Then choose Open building… and pick that file. Check: the building opens.
17. Clear the site data of the app (Settings, Privacy, Cookies and Site Data, Manage Data). Reload. Check: "Home" is gone (expected: the building lives only in the browser).
