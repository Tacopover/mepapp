# Test script B7: the capacity flows through the risers

T11 (2026-11-25): every network type reads the same words (D-B-113). The hints say "Place source equipment ..." and the tag says "Not a design flow", also for an electrical type.

For one PC with Windows. Use the test build of the branch `worktree-buildings-b7`. Part A to Part H use Chrome or Edge (desktop web store). Part I uses the desktop app, if the Tauri build is installed. The agent ran real browser checks in a headless Chromium. It could not run a real browser profile, a real permission prompt, a real scrollbar, Windows display scaling, Tauri or Windows. The steps below cover exactly these gaps.

Words in this script:
- A "riser" is a vertical duct or pipe that joins one network on two or more levels.
- A "span" is the part of a riser between two levels next to each other.
- The "main level" is the level where the flow starts (the level that has the source, for example an air handling unit).
- The "capacity" of a span is the sum of the capacities of all terminals that sit behind that span, seen from the main level.
- The "connected total" is the sum of all terminals of all levels of the riser. The app does not apply a concurrency factor (a factor that lowers the sum because not all terminals run at the same time). So the number is not a design flow.
- A "summary" is a small file that the app saves next to each PDF when you save. It holds the capacity numbers of that level.
- The rule for the other levels: a level that is open in the app counts with its live numbers, saved or not. A level that is not open counts with its saved summary. When you close a level, the app uses its saved summary again.
- "at least" is the text that the app puts before a number when a level has no summary. The app counts that level as 0.
- An "open end" is the end of a duct or pipe with nothing connected to it (no stamp and no other segment). A riser fitting is not an open end.
- "at most" is the text that the app puts before a number when the network has no source yet and two or more open ends could hold the source. Each number then shows the highest value for any place of the source. The numbers of two segments do not add up. Part J tests this.

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

7. Open Level 2. Change the terminal from 150 to 250 (type the number and press Enter). Do not save. Switch to Level 1 (the document switcher in the header). Click the riser fitting. Check: "Solved capacity" says 750 and "Connected total" says 850 m³/h (no concurrency factor). You did not save and you did not click "Read summaries now". The numbers of Level 2 reached Level 1 with the switch.
8. On Level 1 change the terminal 300 to 400. Do not save. Check at once, with no click on another place: the duct shows 600 and the riser fitting shows 850. The header says 600. Switch to Level 0. Click the exit fitting of the riser. Check: "Solved capacity" says 850 (600 of Level 1 and 250 of Level 2) and "Connected total" says 950 m³/h. Level 1 and Level 2 are both not saved. Write down if the numbers show later than the switch.
9. Switch to Level 1. Open Manage Buildings and the tab "Risers". Check: the rows say 850 for "Level 0 to Level 1" and 250 for "Level 1 to Level 2". The connected total is 950 m³/h. These are the live numbers of all open levels. Close the dialog. Close Level 2 with the close button in the document switcher and answer "Close anyway" (Level 2 is not saved). Open the tab "Risers" again. Check: the rows say 750 and 150, and the total says 850 m³/h. Level 2 is not open now, so it counts its saved summary (150). Level 1 is still open and counts its live 600.
10. On Level 1 change the terminal 400 to 450. Switch to Level 0 as fast as you can, with no wait. Click the exit fitting. Check: "Solved capacity" says 800 (650 of Level 1 and 150 of the saved Level 2). The last edit is not lost. Open Level 2 again (Menu, Open) before you go on.

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

18. Delete the air handling unit on Level 0 and the duct that went to it, so that no level has an open end. Save every level. Open the Risers tab. Check: the rows say "not known yet (no source level)". "Main level" says "not known yet". The total still shows 750 m³/h. The hint is the old hint for this case (it says to click "Set by hand" and choose a source level). Open Level 1 and click the riser fitting. Check: the section says that the number counts this level only until the main level is known.
18b. Now give each level one open end. Draw a short duct from any fitting of the network of each level and leave its end open. Save every level. Open the Risers tab. Check: the rows say "at most 650 m³/h" for "Level 0 to Level 1" and "at most 600 m³/h" for "Level 1 to Level 2". "Main level" says "not known yet (no source level)". The total shows "750 m³/h (no concurrency factor)". Three hints show: `No source level yet. Each span shows the largest flow for any source position.`, `Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0.` and `Place source equipment on a level, or click Set by hand and choose a main level.` The link "Set by hand" shows under the box with no scrolling, also in a small window. Open Level 1 and click the riser fitting. Check: "Solved capacity" says "at most 650". The section says "Main level" "not known yet (no source level)". Write down if the third hint (the action) is easy to miss: it is the last text of the card (open question, D-B-110). Click "Set by hand". Check: the focus moves to the list "Source level" (it is above "Direction"). Choose "Level 0". Check: the rows say 650 and 150 with no "at most" and no hint. Choose "From the flow solve". Check: "at most" comes back.
19. Put an air handling unit on Level 0 and one on Level 2. Save both. Check: the rows say "not known yet (more than one source level)" and a warning names Level 0 and Level 2. Click "Set by hand" and choose Level 0. Check: the numbers show.
20. Put one air handling unit on Level 0 only. Put a fan coil unit (a stamp of category equipment with its own capacity of 200) on Level 1 and connect it. Save. Check: the main level stays "Level 0". The connected total grows by 200 (950 m³/h) and Level 1 does not become a source.

## Part F: other network types

21. Make a second riser of the type Sanitary Waste (a drain) through two levels, or change the network type of a test riser. Open the Risers tab. Check: the Capacity block shows a tag "Not a design flow" and the hint "These numbers are a plain sum of connected capacities, with no concurrency factor. They are not a design flow for this network type." The word "Main level" is used. No word "up" or "down" shows in the new text. If the drain has no source equipment and has an open end on each level, the rows read "at most" like every other network type (a drain can go up with a pump, so the same rule holds). The hint says "Place source equipment", the same words as for every other type. The tag "Not a design flow" stays.
22. Repeat the check with a fire protection (sprinkler) network type and with an electrical network type, if the app has a riser for them. Check: a fire protection riser keeps the tag "Not a design flow". An electrical riser shows the same tag "Not a design flow" in the Risers tab and in the Properties panel. The hint says "Place source equipment", the same words as for every other type (D-B-113: one wording for all network types). Write down what you see.
23. Make a network type that has no flow unit (open Networks and clear the unit). Check: the numbers show with no unit and a hint says: `This network type has no flow unit, so the numbers have no unit.`

## Part G: the takeoff and Excel

24. Open the takeoff (Quantities) for the scope "Building". Open the table "Risers". Check: the last three columns are "Capacity", "Capacity unit" and "Capacity complete". The rows show 650 and 150, the unit m³/h and "Yes". The warnings do not contain "Flow is not summed across levels." One warning says: `Capacity is a plain sum of connected capacities, with no concurrency factor. It is not a design flow.` Now remove the air handling unit again (the state of step 18b: no source, one open end on each level) and open the takeoff again. Check: the column "Capacity complete" says "At most" for both rows and one more warning says: `Riser R1 has no source level yet. Each capacity shows the largest flow for any source position.` (with the real riser name). Put the unit back: the cells say "Yes" again and the new warning is gone. The takeoff with the scope "Building" counts the live numbers of the open level only. An unsaved edit on another open level is not in the takeoff (known). Save before you export.
25. Export the takeoff to Excel and open the file. Check: the table "Risers" has the same columns. Sum the column "Capacity" and filter on the column "Capacity unit". Write down if the numbers in the column "Capacity" are numbers (right aligned, they sum) or text.
26. Choose the scope "Level" (Level 1). Check: the Risers table shows the spans that touch Level 1. The warning list can name warnings of other levels. This is accepted.

## Part H: no change for other users

27. Open the app with no building. Open a PDF. Draw two segments and one terminal with a capacity. Check: the header total and the Properties numbers are the same as in the last version. No section "Main level" shows.
28. Open a building that has no riser. Open a level. Click a fitting. Check: no section "Main level" shows and the numbers did not change.
29. Open a PDF that is not a level of the building. Click a fitting. Check: no riser section shows.
30. Open a building file of B4 or B6 (made before B7). Check: it opens with no message about the format. The building file is not changed by B7 (open it in Notepad: no new fields).

## Part I: Windows only (the desktop app, the real screen)

31. In the desktop app with PDFs on disk, repeat steps 1 to 3 and steps 7 and 8. Check: the same numbers, with no save. Then save Level 2 and switch to Level 1. Check: the numbers do not change. The real save writes a PDF and a summary that holds the same numbers as the live data.
32. In the desktop app click "Read summaries now" with one level not saved. Check: no picker opens, the numbers lose "at least", and the notice says "Read N of N summaries."
33. Open the Risers tab in a window of 1366 x 768. Check: the block "Capacity" is visible without scrolling the dialog, or the hint is visible. In the state of step 18b the link "Set by hand" is visible with no scrolling. The scrollbar of Windows does not hide a text.
34. Set the display scaling of Windows to 125 % and then to 150 %. Open the Risers tab and the Properties panel of a riser fitting at the smallest dock width. Check: texts wrap. Nothing is cut. The tab name "Properties" can be cut at the right edge at the smallest dock width (known, from B4).
35. Make a riser with more than 8 levels (or ask the agent for a file). Check: the list of spans scrolls with the mouse wheel and the keyboard (Tab to the list, then the arrow keys).

## Part J: no source yet (Chrome or Edge)

This part tests a network with no source (no air handling unit, fan, pump or other equipment). Before this version, an open end with nothing behind it read 0. Now each open end can be the place of the source, and each number shows the highest value for any such place. Use the network type Supply Air unless the step says otherwise.

36. Open a PDF with no building. Draw a terminal with the capacity 100. Draw a duct from the terminal to a point and two more ducts from that point to two free ends (a T with two open ends). Click the three ducts and the fitting at the T. Check: "Solved capacity" says "at most 100" every time. The hint under the number says: `No source yet. Each number shows the largest flow for any source position. Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0. Place source equipment to set the source.` The numbers on the canvas say 100 with no arrowhead. Write down if you must run "Solve flow" before the numbers show on the canvas.
37. Type 250 in the field "Capacity" of the terminal and press Enter. Check: all numbers say "at most 250" at once. The document shows the changed mark (the tab or the close button asks about unsaved changes). Put the value back to 100.
38. Place an air handling unit (capacity empty) so that it joins one of the open ends. If it does not join, drag the free end of the duct onto the unit (write down if joining is hard). Check: the duct at the unit says 100, the other open duct says 0, there is no "at most" and no hint. Arrowheads show. Delete the unit again.
39. Open the building "Tower" with the three levels of Part A. Delete the air handling unit and every terminal except the terminal of Level 0 (capacity 100). On Level 1 and Level 2 keep a short duct from the riser fitting and leave its end open. Save every level. Check: the open duct of Level 1 and of Level 2 says "at most 100". The riser fitting of both levels says "at most 100". The Risers tab says "at most 100 m³/h" for both rows, "Main level" says "not known yet (no source level)" and the total says "100 m³/h (no concurrency factor)".
40. On Level 0 type 250 in the terminal and press Enter. Do not save. Switch to Level 1. Check: the open duct says "at most 250" with no save and with no click on "Read summaries now".
41. Put the terminal of Level 0 back to 100. On Level 2 delete the open duct and put a terminal with the capacity 50 at the end of the duct from the riser fitting. Now only Level 1 has an open end. Save every level. Check: the rows say 100 for "Level 0 to Level 1" and 50 for "Level 1 to Level 2". The numbers are plain: no "at most" and no hint. The open duct of Level 1 says 150. "Main level" says "none yet (no source level)" (open question D-B-111). The agent checked the numbers of steps 39 to 42 in a headless browser with a scripted setup (the real mouse drawing is part of your test).
42. Place an air handling unit at the open end of Level 1. Save. Check: the rows are plain numbers and "Main level" says "Level 1". Delete the unit again.
43. Draw the T of step 36 again in a plain PDF, but with the network type Sanitary Waste (a drain network) and a terminal with 100. Check: the numbers say "at most 100" like any other network type. The hint says "Place source equipment", the same words as for every other type. Then make a riser of this type with an open end on each level and open the Risers tab. Check: the tag "Not a design flow" stays.
44. Open a building file that you saved with the earlier test build of B7 (before this version), where the riser has no air handling unit, or ask the agent for one. Open the Risers tab. Check: the note `The summary of Level 1 has no open-end data. Read the summaries.` shows (with the real level name) and the link "Read summaries now" shows. Click the link. Check: the note goes and the rows read "at most".
45. In a plain PDF draw a closed ring of three ducts with three fittings. Put one terminal with 100 on one duct. Do not draw an open end. Click a duct of the ring. Check: a plain number shows (no "at most") and the hint says: `This network has a loop and no source. The numbers use one start point. Place source equipment to set the source.` Write down if this is clear enough. A ring with no source can show 0 on a terminal feed and "Not solved" on the closing duct (known, open question D-B-109).

## Part K: the concurrency rename (Chrome or Edge)

T12 (2026-11-25, D-B-114): the saved name of the circuit load factor changed from `diversityPercent` to `concurrencyPercent`, and the project file got schema version 23. This part checks that a project saved BEFORE this version still opens with the same values. Use a PDF that you saved with an earlier build and that has a distribution panel with circuits. Some circuits must have their own value in the field "Concurrency %". The panel must have a default value there. If you have no such file, ask the agent for one.

46. Open the old PDF. Open the Circuits list and click a circuit that has its own concurrency value. Check: the field "Concurrency %" shows the same value as before the new build. Click a circuit with no own value. Check: the field shows the panel default (dashed, as inherited).
47. Type a new value in "Concurrency %" of that circuit and press Enter. Check: the value stays and the document shows the changed mark. Save. Close the document and open it again. Check: the new value is still there and the other circuits show the same values as in step 46.
48. Click the panel and open "Schematics...". Open the schematic of the panel (or create one with the first built-in template). Check: the cells for the concurrency value show numbers, not empty cells. In the totals table of a schematic that came from a built-in template, the row is now "Concurrent VA" (before this version: "Diversified VA"). Its number is the sum of capacity times concurrency of the circuits.
49. In the template editor, open a template that you made yourself before this version (if you have one) and that shows the diversified capacity. Check: it still shows numbers. The list of expressions now says `circuit.concurrencyPercent` and `circuit.concurrentCapacity`.
50. Write down any value that differs from the old build, any empty cell in a place where the old build showed a number, and any word "diversity" or "diversified" that you still see on a screen.

## Part L: a stale building (Chrome or Edge)

T13 (2026-11-26): a recent building whose file does not answer must not freeze the dialog. A "stale building" is an entry in the list of Manage Buildings whose file moved, was deleted, is offline or is a cloud-only file. Use the same PC and the same two stale entries as in your report, or move the file of one building to another folder.

51. Open Manage Buildings with a stale building in the list. Click the stale building. Check: either the message `The building file "<name>" was not found. Use Open building… to find it.` shows at once, or the dialog waits up to 10 seconds and then shows `The building file "<name>" did not answer. Check that the file exists and that its folder is online. Use Open building… to find it.` Write down which message you see and how long it took.
52. While you wait, and after the message shows, open the "Building" menu at the top right. Check: "New building…" and "Open building…" are active (not grey). Write down if they were grey at any time.
53. Click a level of a good building in the list, and click the other good building. Check: the building opens and the tree shows its levels. The message goes away.
54. Click the "×" of the stale building. Check: the entry leaves the list. Write down any step where a button stayed grey or the dialog did not react.

## What to write down

For every step where the result is not as written (Part K: steps 46 to 50, Part L: steps 51 to 54), write the step number, what you saw, and a screenshot. These items are open questions, so write down your opinion for them: step 4 (header 500 and fitting 650), step 9 (a closed level that is not saved counts its saved summary), step 25 (Excel cells), and the word "Main level" (steps 1, 3, 21). For Part J also write down: the words "at most" and the hints (are they clear? D-B-97, D-B-104), whether the canvas label should also say "at most" (D-B-108), whether the action text in the Risers hint should come first (D-B-110, step 18b), the text "none yet (no source level)" for a group with only one possible source (D-B-111), the one source word for all network types (D-B-107, D-B-113), and a ring (step 45, D-B-109). The old box "Flow direction" can say "Up · source: Level 0" while the block "Capacity" says "Main level: not known yet". This is known. B8 solves it.
