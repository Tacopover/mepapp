# Test script B7: the capacity flows through the risers

For one PC with Windows. Use the test build of the branch `worktree-buildings-b7`. Part A to Part H use Chrome or Edge (desktop web store). Part I uses the desktop app, if the Tauri build is installed. The agent ran real browser checks in a headless Chromium. It could not run a real browser profile, a real permission prompt, a real scrollbar, Windows display scaling, Tauri or Windows. The steps below cover exactly these gaps.

Words in this script:
- A "riser" is a vertical duct or pipe that joins one network on two or more levels.
- A "span" is the part of a riser between two levels next to each other.
- The "main level" is the level where the flow starts (the level that has the source, for example an air handling unit).
- The "capacity" of a span is the sum of the capacities of all terminals that sit behind that span, seen from the main level.
- The "connected total" is the sum of all terminals of all levels of the riser. The app does not apply a concurrency factor (a factor that lowers the sum because not all terminals run at the same time). So the number is not a design flow.
- A "summary" is a small file that the app saves next to each PDF when you save. It holds the capacity numbers of that level. The other levels read it.
- "at least" is the text that the app puts before a number when a level has no summary. The app counts that level as 0.

Use 3 real plan PDFs of one building, one for each level. Use the building "Tower" with "Level 0", "Level 1" and "Level 2" from the B4 script (steps 1 to 12 of `buildings-b4-test.md`, Part A), and make one Supply Air riser through the three levels. The terminals and the source of this script:

| Level | Source | Terminals (capacity in m³/h) |
|---|---|---|
| Level 0 | one air handling unit (a stamp of category equipment), capacity left empty | one terminal with 100 |
| Level 1 | none | two terminals with 300 and 200 |
| Level 2 | none | one terminal with 150 |

Set the capacity of a terminal: select the terminal, type the number in the field "Capacity" of the Properties panel, and press Enter. Connect each terminal and the riser fitting of the level with segments of the network type Supply Air. The air handling unit connects to the same network on Level 0. Set the unit of the network type Supply Air to m³/h (Networks tab). Save every level with "Save" in the menu. Check: the status line says "Saved" each time.

The numbers below hold for these terminals. The total is always 750.

## Part A: the worked example

1. Open Manage Buildings and the tab "Risers". Select the riser. Check: the block "Capacity" shows "Main level" with "Level 0" and "Connected total" with "750 m³/h (no concurrency factor)". The rows say "Level 0 to Level 1" with "650 m³/h" and "Level 1 to Level 2" with "150 m³/h". No hint shows. The old box "Flow direction" is still there and says "Up · source: Level 0".
2. Close the dialog. Open Level 1. Click the duct that ends at the riser fitting. Check: the Properties panel says "Solved capacity" 500. A line says "This segment is on the network of riser R1. Select the riser fitting to see the connected total." (the riser can have another name).
3. Click the riser fitting of Level 1. Check: "Solved capacity" says 650. A section shows "Main level" with "Level 0" and "Connected total" with "750 m³/h (no concurrency factor)". Write down if you find any word with a direction ("up", "down") in this section. There must be none.
4. Look at the header. Check: it says 500 for the capacity of this level (it counts this level only). Write down if this difference (500 in the header, 650 at the fitting) is confusing. This is an open question for the next round.
5. Open Level 0. Click the exit fitting of the riser. Check: "Solved capacity" says 650 (the flow that goes to the other levels). Click the terminal. Check: "Capacity" says 100.
6. Open Level 2. Click the riser fitting. Check: "Solved capacity" says 150. The section says "Main level" "Level 0".

## Part B: change a capacity, and a level that is not saved

7. Open Level 2. Change the terminal from 150 to 250. Do not save. Open the Risers tab. Check: the rows say 750 for "Level 0 to Level 1" and 250 for "Level 1 to Level 2". The connected total is 850 m³/h (the open level counts its live numbers).
8. Close the dialog. Switch to Level 1 (the document switcher in the header). Click the riser fitting. Check: it still says the old numbers (650, and 750 m³/h for the total), because Level 2 is not saved. This is the rule of the app: the other levels count the saved summary. Write down if this surprises you.
9. Switch to Level 2. Save. Switch to Level 1. Click the riser fitting. Check: "Solved capacity" says 750 and "Connected total" says 850 m³/h (no concurrency factor). You did not reopen anything.
10. On Level 1 change the terminal 300 to 400. Do not save. Check at once, with no click on another place: the duct shows 600 and the riser fitting shows 850. The header says 600. Press Save. Open the Risers tab. Check: the rows say 850 and 250. The total says 950 m³/h.

## Part C: the main level by hand

11. Put the terminals back to 100, 300, 200 and 150 and save every level. Open Manage Buildings, tab Risers. Click "Set by hand" in the block "Flow direction" and choose the source level "Level 2". Check: the block "Capacity" says "Main level" "Level 2". The rows say 100 for "Level 0 to Level 1" and 600 for "Level 1 to Level 2". The total stays 750.
12. Choose "Level 1" as the source level. Check: the rows say 100 and 150. The total stays 750.
13. Choose the automatic setting again (the choice "From the flow solve"). Check: the numbers come back to 650 and 150.

## Part D: a level with no data

14. Open the app in Chrome or Edge. Close the browser fully and start it again. Open the building file. Do not open Level 2 and do not reconnect the PDFs. Open the Risers tab. Check: one of these happens. (a) The numbers read as in Part A (the summary is in the browser store). (b) The row "Level 1 to Level 2" says "at least 150 m³/h" and the total says "at least", and a hint says: `Some levels have no data, so some numbers read "at least". The warnings above name each level.` Write down which one you see.
15. In case (b), click "Read summaries now" in the block "Capacity". Check: the notice in the header says "Read N of N summaries." (or says "1 PDF needs to be opened first." when a PDF has no stored handle), and the numbers lose "at least" when all summaries are read. No file picker opens for a PDF with a stored handle.
16. In case (b), open Level 1 and click the riser fitting. Check: a hint in the Properties panel says that some levels have no data and that a number reads "at least". The lines "Main level" and "Connected total" still show. The number "Solved capacity" does not read "at least" (known: the hint says it in words).
17. Open a building that you saved with the test build of B6 (before B7), or ask the agent for one. The summaries have no riser data. Open the Risers tab. Check: the warning says "The summary of Level 1 has no riser data. Read the summaries." (with the real level name) and the link "Read summaries now" shows. Click it. Check: the warning goes away.

## Part E: no main level, two main levels

18. Delete the air handling unit on Level 0 and save. Open the Risers tab. Check: the rows say "not known yet (no source level)". "Main level" says "not known yet". The total still shows 750 m³/h. The hint says: `Click Set by hand and choose a source level.` Open Level 1 and click the riser fitting. Check: the section says that the number counts this level only until the main level is known.
19. Put an air handling unit on Level 0 and one on Level 2. Save both. Check: the rows say "not known yet (more than one source level)" and a warning names Level 0 and Level 2. Click "Set by hand" and choose Level 0. Check: the numbers show.
20. Put one air handling unit on Level 0 only. Put a fan coil unit (a stamp of category equipment with its own capacity of 200) on Level 1 and connect it. Save. Check: the main level stays "Level 0". The connected total grows by 200 (950 m³/h) and Level 1 does not become a source.

## Part F: other network types

21. Make a second riser of the type Sanitary Waste (a drain) through two levels, or change the network type of a test riser. Open the Risers tab. Check: the Capacity block shows a tag "Not a design flow" and the hint "These numbers are a plain sum of connected capacities, with no concurrency factor. They are not a design flow for this network type." The word "Main level" is used. No word "up" or "down" shows in the new text.
22. Repeat the check with a fire protection (sprinkler) network type and with an electrical network type, if the app has a riser for them. Write down what you see.
23. Make a network type that has no flow unit (open Networks and clear the unit). Check: the numbers show with no unit and a hint says: `This network type has no flow unit, so the numbers have no unit.`

## Part G: the takeoff and Excel

24. Open the takeoff (Quantities) for the scope "Building". Open the table "Risers". Check: the last three columns are "Capacity", "Capacity unit" and "Capacity complete". The rows show 650 and 150, the unit m³/h and "Yes". The warnings do not contain "Flow is not summed across levels." One warning says: `Capacity is a plain sum of connected capacities, with no concurrency factor. It is not a design flow.`
25. Export the takeoff to Excel and open the file. Check: the table "Risers" has the same columns. Sum the column "Capacity" and filter on the column "Capacity unit". Write down if the numbers in the column "Capacity" are numbers (right aligned, they sum) or text.
26. Choose the scope "Level" (Level 1). Check: the Risers table shows the spans that touch Level 1. The warning list can name warnings of other levels. This is accepted.

## Part H: no change for other users

27. Open the app with no building. Open a PDF. Draw two segments and one terminal with a capacity. Check: the header total and the Properties numbers are the same as in the last version. No section "Main level" shows.
28. Open a building that has no riser. Open a level. Click a fitting. Check: no section "Main level" shows and the numbers did not change.
29. Open a PDF that is not a level of the building. Click a fitting. Check: no riser section shows.
30. Open a building file of B4 or B6 (made before B7). Check: it opens with no message about the format. The building file is not changed by B7 (open it in Notepad: no new fields).

## Part I: Windows only (the desktop app, the real screen)

31. In the desktop app with PDFs on disk, repeat steps 1 to 3 and step 9. Check: the same numbers. The real save writes a PDF. The other level must read the new summary at once.
32. In the desktop app click "Read summaries now" with one level not saved. Check: no picker opens, the numbers lose "at least", and the notice says "Read N of N summaries."
33. Open the Risers tab in a window of 1366 x 768. Check: the block "Capacity" is visible without scrolling the dialog, or the hint is visible. The scrollbar of Windows does not hide a text.
34. Set the display scaling of Windows to 125 % and then to 150 %. Open the Risers tab and the Properties panel of a riser fitting at the smallest dock width. Check: texts wrap. Nothing is cut. The tab name "Properties" can be cut at the right edge at the smallest dock width (known, from B4).
35. Make a riser with more than 8 levels (or ask the agent for a file). Check: the list of spans scrolls with the mouse wheel and the keyboard (Tab to the list, then the arrow keys).

## What to write down

For every step where the result is not as written, write the step number, what you saw, and a screenshot. These items are open questions, so write down your opinion for them: step 4 (header 500 and fitting 650), step 8 (the saved summary counts), step 25 (Excel cells), and the word "Main level" (steps 1, 3, 21). The old box "Flow direction" can say "Up · source: Level 0" while the block "Capacity" says "Main level: not known yet". This is known. B8 solves it.
