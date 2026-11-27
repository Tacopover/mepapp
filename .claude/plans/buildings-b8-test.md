# Test script B8: riser arrows (part A tested, part B new)

Part A (Parts 0 to 7, tasks T01 to T07) was written 2026-11-27 for the branch `worktree-buildings-b8`. You tested part A on 2026-11-27 and said go. Part B (the Risers tab diagram, task T09) is new. It starts at the heading "Part B: the Risers tab diagram" after the end of part A, and its steps have the numbers B0.1 to B5.8. Do part B on the same branch after `git pull`.

For one PC with Windows. Use Chrome or Edge. You can use the desktop app instead: then say so in your notes. The agent ran real browser checks in a headless Chromium (no real window, no real tooltip, no real focus ring). It could not run Windows display scaling, a real browser restart, a read-only file, a touchpad, Tauri or a real mouse. The steps below cover exactly these gaps. The end of part A and the end of part B list which steps the agent ran headless and how.

Do not merge this branch into `master`. `master` goes live at once. Tell the director when you finish the test.

## How to use this script

Each step has the form: what to do, what you must see (after "Check:"), and a line with boxes. Tick one box for each step. Write the step number in your feedback (for example "3.5 fail"). Part 7 lists what to send.

`[ ] pass   [ ] fail   note: `

## Part 0: setup

Words in this script:
- A **riser** is a vertical duct or pipe that joins one network on two or more levels. Its **ring** is the purple circle on the canvas of one level. A solid ring means that a segment ends at the ring. A **dashed ring** means that the riser has no part on this level yet. A ring is always a full circle.
- A **source** is equipment (a stamp of category equipment, for example an air handling unit) that you connect to the network with a segment. The flow starts at the source. The level with the source is the **main level**.
- **Solve flow** is the button in the dock tab "Networks". It calculates the capacity of each segment and shows a number and a small arrowhead on each segment of the network that you select. The app also calculates the numbers by itself. The button only turns the display on.
- The **flow direction** of a network type is `Supply` (the flow goes away from the source) or `Return` (the flow goes toward the source). You set it in the network type editor. Each riser keeps its own **copy** of its network type. The riser arrows read the flow direction from that copy.
- An **arrow** at a ring is a diagonal arrow drawn over the ring. The arrow to the lower left is the one for the span (the part of the riser) to the next lower level. The arrow to the upper right is the one for the span to the next higher level.
- A **pictogram** is one of the eight arrow combinations of the picture in `.claude/plans/buildings-b8-riser-arrows.png` (the picture that you made). Open that picture next to this script. In the right-click menu and in the Properties panel, each pictogram has a small **picture** that you click.
- "Up" and "down" always mean higher and lower levels. They never mean a direction on the page.
- A "hand-set" ring is a ring where you chose the pictogram yourself ("Set by hand").

The eight pictograms. "Head at the ring" means that the arrow points toward the ring. "Head at the far end" means that the arrow points away from the ring.

| No. | Tooltip text | Arrow to the lower left | Arrow to the upper right |
|---|---|---|---|
| 1 | Comes up, goes up | head at the ring | head at the far end |
| 2 | Goes up | none | head at the far end |
| 3 | Comes up | head at the ring | none |
| 4 | Comes down, goes down | head at the far end | head at the ring |
| 5 | Comes down | none | head at the ring |
| 6 | Goes down | head at the far end | none |
| 7 | Goes up, goes down | head at the far end | head at the far end |
| 8 | Comes up, comes down | head at the ring | head at the ring |

0.1 Get the branch. In a terminal in the repository run `git fetch origin`, then `git checkout worktree-buildings-b8`, then `pnpm install`, then `pnpm build`. Start the web app with `pnpm --filter @mepapp/web dev`. Open the address that the command prints in Chrome or Edge. Check: the app opens. The onboarding overlay shows once.
`[ ] pass   [ ] fail   note: `

0.2 Get the test PDFs and the building. Use the building "Tower" with "Level 0", "Level 1" and "Level 2" from the B7 script (`.claude/plans/buildings-b7-test.md`). That script builds it in the paragraph before "Part A". Steps 1 to 12 of `buildings-b4-test.md` (Part A) make the building, the levels and the Supply Air riser. The B4 script has two levels. Add "Level 2" with "Add level", add its PDF, and draw a Supply Air segment onto the dashed ring as in B4 step 11. Then place the source and the terminals of the table in the B7 script. Use one air handling unit on Level 0 and terminals with 100, 300, 200 and 150. Save every level (Menu, Save). Check: Manage Buildings, tab "Risers (1)" lists the riser with 3 levels. The rows of the Capacity block say 650 and 150.
`[ ] pass   [ ] fail   note: `

0.3 Check the start state. Open Level 0, Level 1 and Level 2 in the app (Manage Buildings, "Open" on each sheet). Use the document switcher in the header to go between them. Check: all three levels are open. The Supply Air rings show arrows on all three levels (a source exists on Level 0). Write down what you see on each level.
`[ ] pass   [ ] fail   note: `

0.4 Make the Return Air riser (Part 3 needs it, and step 2.8). On Level 0 pick the network type Return Air. Draw a short run with a fitting that is at least 5 cm (on screen) away from the Supply Air fitting. Place a second equipment stamp (for example a fan) and connect it to the run. Right-click the new fitting and click "Make riser". Do the same on Level 1 and Level 2 (B4 steps 6 to 11, with the type Return Air). Keep the Return Air fittings at the same place on all three levels. Save every level. Check: Manage Buildings, tab "Risers (2)" lists two risers. The Return Air riser has a dashed lane in the diagram.
`[ ] pass   [ ] fail   note: `

## Part 1: Flow direction in the network type editor (T01)

"Open the editor" means: dock tab "MEP", sub-tab "Network Types", click the colored dot on the tile (its tooltip is "Edit"). A click on the tile name does not open the editor. Use the filter "All" to see all 14 types.

1.1 Open the editor for Return Air. Check: the dialog title is "Network type: Return Air". In the section "Flow and sizing" the row "Flow direction" shows "Return". The list has two options: "Supply" and "Return".
`[ ] pass   [ ] fail   note: `

1.2 Hover the small "i" next to the list. Check: a card shows the text `Supply goes away from the source. Return goes toward it. For the other direction of the same system, use Duplicate and change the copy.` The card is whole and inside the window.
`[ ] pass   [ ] fail   note: `

1.3 Open the editor for each of the other 13 library types, one after the other, and write down "Flow direction". Close each editor with Escape. Check: three types show "Return": Return Air, Exhaust Air and Sanitary Waste. The other eleven show "Supply": Supply Air, Chilled Water, Heating Water, Domestic Cold Water, Domestic Hot Water, Conduit, Cable Tray, Branch Circuit, Feeder, Wet Standpipe and Dry Standpipe.
`[ ] pass   [ ] fail   note: `

1.4 Open the editor for Return Air. Choose "Supply" and click Save. Open the editor again. Check: it shows "Supply". Choose "Return", click Cancel, open the editor again. Check: it still shows "Supply". Press Escape. Set it back to "Return" and click Save.
`[ ] pass   [ ] fail   note: `

1.5 Open the editor for Chilled Water. Click Duplicate. Check: the title is "Network type: Chilled Water_copy". The Name field says "Chilled Water_copy". "Flow direction" shows "Supply".
`[ ] pass   [ ] fail   note: `

1.6 Type the name "Chilled Water return". Choose "Return". Click Save. Check: the tile "Chilled Water return" shows in the list. Open the editor for "Chilled Water": it still shows "Supply". Open the editor for Exhaust Air and click Duplicate: the copy shows "Return" (a copy keeps the value of its source). Press Escape.
`[ ] pass   [ ] fail   note: `

1.7 Press Tab through the whole editor, starting in the field "Name". Check: the order is Name, Discipline, Color, Thickness (pt), Pattern, Flow direction, the "i" mark, Flow unit, Sizing method, Cancel, Duplicate, Save. The "i" shows its text when it has focus. Escape closes the text first. A second Escape closes the editor.
`[ ] pass   [ ] fail   note: `

1.8 Make sure the values stay after a restart. Open a PDF that is not part of a building. Set Return Air to "Supply" and "Chilled Water return" to "Return". Menu, Save. Close the browser tab. Open the app again. Open the saved PDF with Menu, Open. Check: Return Air shows "Supply". "Chilled Water return" shows "Return". Chilled Water shows "Supply".
`[ ] pass   [ ] fail   note: `

1.9 An old drawing. In a second tab open the live site `https://app.mepsketcher.com` (the old build). Open a PDF, draw one segment of the type Return Air, Menu, Save. Keep the file. In the test build use Menu, Open on that file. Check: the editor for Return Air shows "Return". Sanitary Waste shows "Return". Supply Air shows "Supply". Save the file again in the test build and open it again: the values stay. Use a copy of the file for the live site: the live site cannot open a file that the test build saved (project version 24).
`[ ] pass   [ ] fail   note: `

1.10 The list of the browser. Click the "Flow direction" list. Check: the Windows list shows both texts in full ("Supply", "Return"). Set the browser zoom to 125 % and 150 % (Ctrl and +; or Windows display scaling if you can change it: write which one you used). Check: no row of the editor is cut. Cancel, Duplicate and Save show.
`[ ] pass   [ ] fail   note: `

1.11 Make the browser window 760 px wide and about 520 px high. Open the editor. Check: every row is whole. Save is visible.
`[ ] pass   [ ] fail   note: `

## Part 2: the eight pictograms on a ring (T04)

Use the Supply Air riser. To set a pictogram by hand: pick the Select tool, right-click the ring, and click the small picture with the tooltip text of the table. Part 4 tests this menu in detail. Go to Level 1 (the middle level). Zoom to 100 %: click the number in the status bar (its tooltip is "Reset to 100%"). The arrows are 64 pt long. At 100 % they are about 64 px long.

2.1 Right-click the ring on Level 1 and click "Goes up" (pictogram 2). Compare the ring with your picture. Check: one arrow, to the upper right, with its head at the far end. The ring is a full circle. The arrow starts at the line of the ring (not at the center). The arrow has the color and the line pattern of Supply Air.
`[ ] pass   [ ] fail   note: `

2.2 Do the same for each other picture, one by one: "Comes up, goes up" (1), "Comes up" (3), "Comes down, goes down" (4), "Comes down" (5), "Goes down" (6), "Goes up, goes down" (7) and "Comes up, comes down" (8). After each choice compare the ring with the table of Part 0 and with your picture. Write down each number that is not as in the table or not as in your picture. Check: all eight rings agree with the table. The arrowheads are small filled triangles. The shaft is a thin line.
`[ ] pass   [ ] fail   note: `

2.3 Set the pictogram back: right-click the ring and click "Use the flow solve". Check: the ring shows the pictogram of the flow solve again (pictogram 1 on Level 1).
`[ ] pass   [ ] fail   note: `

2.4 Line patterns. Open the editor for Supply Air. Set "Pattern" to "Dotted". Click Save. Check at once (no other click): the arrows of the Supply Air ring change to a dotted shaft. The arrowhead stays solid. The ring of the Return Air riser keeps a dashed shaft (the default pattern of Return Air).
`[ ] pass   [ ] fail   note: `

2.5 Set the pattern of Supply Air to "Dash-Dot", then back to "Solid". Check: the shaft follows the pattern each time. At "Solid" the shaft is a plain line.
`[ ] pass   [ ] fail   note: `

2.6 Zoom to 25 %. Use the minus and plus buttons in the status bar or the mouse wheel until the status bar says about 25 %. Look at the ring of Level 1. Check: the ring is small. The arrows are small and thin but you can still see them. Write down at which zoom you cannot see the arrows any more. The app draws them faint below 26 % and not at all at 5 % (known, D-B-122 and D-B-131 in Part 6).
`[ ] pass   [ ] fail   note: `

2.7 Zoom to 100 %, then 200 %, then 400 %. Check: the arrows grow with the zoom (about 64 px, 128 px and 256 px). The head and the shaft stay clear. The ring does not grow as much as the arrows. Nothing flickers while you zoom.
`[ ] pass   [ ] fail   note: `

2.8 Two rings close together. Move the Return Air fitting on Level 1 so that it is about 20 px (at 100 % zoom) from the Supply Air fitting. Both risers must have arrows (a source on both networks). Check: the arrows cross each other. This is known. Write down if you can still tell the two rings apart and which arrow belongs to which ring (color and pattern). Move the fitting back (the Undo button of the rail).
`[ ] pass   [ ] fail   note: `

2.9 Display scaling. Set the display scaling of Windows to 125 % and then 150 % (Settings, System, Display, Scale). Reload the page, open the building "Tower" and open the PDFs again. Look at the ring with pictogram 1. Check: the shaft is not too thin and the arrowhead is clear. The ring is a full, clean circle. If you do not want to change the display scaling, use the browser zoom and write "browser zoom, not display scaling".
`[ ] pass   [ ] fail   note: `

The app has no dark theme. There is no step for it.

## Part 3: the arrows follow the flow (T05, T02)

Start with the state of step 0.4: three levels open, a Supply Air riser and a Return Air riser. The Supply Air source is the air handling unit on Level 0. To see the arrows you do not save a PDF. The arrows of the open levels update by themselves within 3 seconds. Use the document switcher to go between levels. The expected pictogram numbers are the numbers of the table in Part 0.

3.1 No source. On Level 0 select the air handling unit (Select tool) and press Delete. Do not save. Go to Level 1 and Level 2. Check: the Supply Air rings show no arrow on all three levels. The rings stay. (Without a source the app does not know the direction.)
`[ ] pass   [ ] fail   note: `

3.2 A source on the lowest level. On Level 0 place the air handling unit again and connect it to the Supply Air network with a segment. Do not click anything else. Check: within 3 seconds Level 0 shows pictogram 2 (goes up). Level 1 shows pictogram 1 (comes up, goes up). Level 2 shows pictogram 3 (comes up). The arrows have the blue color of Supply Air and a solid shaft.
`[ ] pass   [ ] fail   note: `

3.3 Add a terminal. On Level 2 place a terminal and connect it to the Supply Air network. Check: the arrows do not change. (A terminal changes the numbers, not the direction.)
`[ ] pass   [ ] fail   note: `

3.4 Two sources. Place a second air handling unit on Level 2 and connect it. Check: the Supply Air rings lose their arrows on all levels. Open Manage Buildings, tab Risers. Open the box "Warnings (1)" if it is closed. Check: it shows `Riser <name> has more than one source level (Level 0, Level 2). Set one by hand.` with the real name of your riser. Close the dialog. Delete the second unit. Check: the arrows come back (pictograms 2, 1, 3).
`[ ] pass   [ ] fail   note: `

3.5 A supply type and a return type on one drawing. Make sure that the Return Air network has a source on Level 0 (step 0.4). Check: Level 0 shows pictogram 2 for the Supply Air riser and pictogram 5 (comes down) for the Return Air riser. Level 1 shows 1 and 4. Level 2 shows 3 and 6. The two risers have different colors. The Return Air shaft is dashed.
`[ ] pass   [ ] fail   note: `

3.6 Change Flow direction while a level is open. Go to Level 1. Open the editor for Supply Air. Choose "Return". Click Save. Do not save a PDF. Check: within 3 seconds the Supply Air ring on Level 1 shows pictogram 4. Go to Level 0: pictogram 5. Go to Level 2: pictogram 6. All levels agree. Open the editor again and choose "Supply". Click Save. Check: the rings go back to 2, 1 and 3 on Level 0, 1 and 2. (Decision D-B-130 B in Part 6. Step 5.5 looks at the arrowheads of the segments after this change.)
`[ ] pass   [ ] fail   note: `

3.7 The Risers tab and the return arrows. Open Manage Buildings, tab Risers. Click the lane of the Return Air riser. Scroll the card to the box "Flow direction". Check: the box says `Up · source: Level 0 · from the flow solve`. On the canvas the Return Air arrows point down (pictograms 5, 4, 6). The box and the arrows look opposite. This is known (D-B-135 in Part 6). Write down if this confuses you.
`[ ] pass   [ ] fail   note: `

3.8 A source on the middle level. Delete the air handling unit of Level 0. Place one on Level 1 and connect it to the Supply Air network. Check: Level 0 shows pictogram 5 (comes down). Level 1 shows pictogram 7 (goes up, goes down). Level 2 shows pictogram 3 (comes up).
`[ ] pass   [ ] fail   note: `

3.9 A source on the highest level. Delete the unit of Level 1. Place one on Level 2 and connect it. Check: Level 0 shows pictogram 5. Level 1 shows pictogram 4 (comes down, goes down). Level 2 shows pictogram 6 (goes down). Put the unit back on Level 0 and delete the unit of Level 2. Check: the rings show the pictograms of step 3.2 again.
`[ ] pass   [ ] fail   note: `

3.10 A level that is not open. Delete the unit of Level 0 and put one on Level 1 (as in step 3.8). Save every level (Menu, Save). Close Level 1 with the close button in the document switcher. If a question ends with "Close anyway?", click OK. Go to Level 0. Check: the ring on Level 0 still shows pictogram 5. Go to Level 2: pictogram 3. (The app uses the saved summary of Level 1.) Open Level 1 again (Manage Buildings, "Open" on its sheet).
`[ ] pass   [ ] fail   note: `

3.11 A closed level with no stored summary. Close the browser fully and open the app again. Open the building "Tower" (if the card "Allow access" shows, allow it). Open only Level 0. Do not open Level 1 and Level 2. Write down what the Supply Air ring on Level 0 shows. If the ring shows no arrow: open Manage Buildings, tab Risers, and click "Read summaries now". Check: the arrows show after the click, or the notice says that a PDF needs to be opened first. When you finish, open Level 1 and Level 2 again. (The agent did not run this case headless.)
`[ ] pass   [ ] fail   note: `

3.12 A dashed ring. Make sure that one unit is on Level 0 and that no other level has a unit. Open Manage Buildings, tab Risers. Click the lane of the Supply Air riser. Click "Detach" on the row of Level 2. Close the dialog and go to Level 2. Zoom to 100 %. Check: the ring on Level 2 is dashed and has a label with the riser name at its right. The label is easy to read. The ring shows no arrow, so no arrow crosses the label. Right-click the ring: the menu has no block "Riser arrows". Level 0 shows pictogram 2. Level 1 shows pictogram 3 (it is the top of the riser now). To go back, draw a Supply Air segment onto the dashed ring (B4 step 11). (Decision D-B-132 in Part 6.) Only a dashed ring has a label. A solid ring has none.
`[ ] pass   [ ] fail   note: `

3.13 Page change with no flash. Make sure that Level 0, Level 1 and Level 2 are open. Switch between them ten times, fast, with the document switcher. Watch the arrows. Check: the arrows do not blink off and on at a switch. Write down any flash.
`[ ] pass   [ ] fail   note: `

3.14 Delete the source. Delete the air handling unit of Level 0. Check: the Supply Air arrows go on all levels. The rings stay. Put the unit back and check that the arrows come back.
`[ ] pass   [ ] fail   note: `

3.15 The editor with no building open. Close the browser tab and open the app again. Do not open Manage Buildings. Open the PDF of Level 2 with Menu, Open. Open the editor for Supply Air, choose "Return" and click Save. Then open Manage Buildings, open the building "Tower" (a click on its name) and click "Open" on the sheet of Level 2. If the app opens a second copy of the PDF, close the copy. Check: the Supply Air ring on Level 2 shows pictogram 3 (the old direction "Supply"), not 6. This is expected. The riser keeps its own copy of the type, and the copy is old. Select a segment of Level 2 and click "Solve flow": its arrowhead follows the type of the drawing (Return). So the ring and the arrowhead can disagree here.
`[ ] pass   [ ] fail   note: `

3.16 Save the editor with the building open. Open the editor for Supply Air on Level 2. It shows "Return". Click Save (no change). Check: within 3 seconds the Supply Air ring on Level 2 shows pictogram 6. On Level 0 it shows pictogram 5. The copy in the building is new now. (Set Supply Air back to "Supply" in the editor when you finish.)
`[ ] pass   [ ] fail   note: `

## Part 4: choose a pictogram by hand (T06)

Use the Supply Air riser with the source on Level 0. Go to Level 1.

4.1 Pick the Select tool. Right-click the ring on Level 1. Check: a menu opens. It shows "Draw from". Next it shows a small heading "Riser arrows" and 8 small pictures in 2 rows of 4. Next it shows "No arrows", then "✓ Use the flow solve" (dim), then "Detach from riser" and "Delete riser". No picture has a dark frame. The whole menu is inside the window.
`[ ] pass   [ ] fail   note: `

4.2 Hover each of the 8 pictures, one by one, and wait for the tooltip. Read each text. Check: the texts are, in order: "Comes up, goes up", "Goes up", "Comes up", "Comes down, goes down", "Comes down", "Goes down", "Goes up, goes down", "Comes up, comes down". Hover "No arrows": the tooltip says "Show no arrows on this ring." Hover "Use the flow solve": the tooltip says "Show the arrows that the flow solve gives."
`[ ] pass   [ ] fail   note: `

4.3 Click the picture "Goes up". Check: the menu closes. The ring shows pictogram 2 at once. Right-click the ring again. Check: the picture "Goes up" has a dark frame. "Use the flow solve" is not dim now and has no check mark.
`[ ] pass   [ ] fail   note: `

4.4 Click "No arrows". Check: the ring shows no arrow. Right-click the ring: "No arrows" has a check mark. Click "Use the flow solve". Check: the ring shows pictogram 1 again (the flow solve).
`[ ] pass   [ ] fail   note: `

4.5 Choose the same picture two times in a row. Check: nothing changes and no text shows the second time.
`[ ] pass   [ ] fail   note: `

4.6 Select the ring: click it with the Select tool. Open the dock tab "Properties". Check: the panel shows "Fitting · <id>" and below it a section with the heading "Riser <name>". It has the rows "Main level" (Level 0), "Connected total" and "Arrows". The row "Arrows" says "From the flow solve". The 8 pictures show in 2 rows, then "No arrows" and "Use the flow solve". Under them a grey line says `Up and down mean higher and lower levels.`
`[ ] pass   [ ] fail   note: `

4.7 Click the picture "Comes down" in the panel. Check: the row "Arrows" says "Set by hand". The picture has a dark frame. The picker stays open. The ring on the canvas shows pictogram 5. Click "Use the flow solve": the row says "From the flow solve".
`[ ] pass   [ ] fail   note: `

4.8 Keyboard in the panel. Click the ring, then press Tab until the focus is on the picker. Write down how many Tab presses it takes. The decision text says 25. The agent counted 26 in a headless browser, from the click on the ring with the dock tab Properties already open. Check: the focus is on one picture. Press the Right arrow 2 times: the focus moves and nothing changes on the ring. Press Space: the ring changes and the focus stays on the same picture. Press the Down arrow: the focus moves 4 pictures on, or to "No arrows" from the second row. Press Enter on "No arrows": the ring shows no arrow. Press Tab: the focus goes to "Use the flow solve". Press Enter: the ring follows the flow solve. (Decision D-B-139 in Part 6.)
`[ ] pass   [ ] fail   note: `

4.9 The Risers tab tag. Set "Goes down" on Level 1 (right-click, picture). Open Manage Buildings, tab Risers. Click the lane of the Supply Air riser. Check: the row of Level 1 shows a second line `Arrows set by hand`. The line can wrap to two lines. It is not cut. The rows keep their order (highest level first). Rows of levels where you set no pictogram show no second line. Make the window 760 px wide and look again.
`[ ] pass   [ ] fail   note: `

4.10 Two rings that disagree. Keep "Goes down" on Level 1. Close the dialog. Go to Level 0. Right-click the ring and click "Goes up". Check: a message shows `Arrows of <riser name> disagree on the span Level 0 to Level 1. Change the arrows on one of the two levels.` Open Manage Buildings, tab Risers. Open the box "Warnings (1)" if it is closed: it holds the same text. If the Return Air riser has the same levels, do the same for it: its line has its own riser name.
`[ ] pass   [ ] fail   note: `

4.11 Undo does not change the arrows. Delete one terminal on Level 1 (Select tool, Delete key). Set a pictogram on the ring of Level 1. Click the Undo button in the left rail. Check: the terminal comes back. The pictogram stays. (The building file has no undo.)
`[ ] pass   [ ] fail   note: `

4.12 A pictogram that you set by hand stays. Set "Goes up" on Level 1. Close all browser windows. Open the app again. Open the building "Tower" (if the card "Allow access" shows, allow it) and open the sheet of Level 1. Check: the ring shows pictogram 2. Properties, row "Arrows", says "Set by hand". Open Level 0: the pictogram that you set there stays too.
`[ ] pass   [ ] fail   note: `

4.13 Click "Use the flow solve" on every ring that you changed in this part (menu or panel). Check: the Risers tab shows no line `Arrows set by hand` and no warning.
`[ ] pass   [ ] fail   note: `

4.14 A read-only building file. Close the app. In Windows Explorer open the Properties of `Tower.building.json` and tick "Read-only". Open the app, open the building and set a pictogram on a ring. Check: a message says `The building file was not saved: ...` (the rest of the text depends on the system). The ring keeps its old arrows. Remove the read-only mark again. If no message shows, write down what happens.
`[ ] pass   [ ] fail   note: `

4.15 The menu at the edge. Zoom and move the page so that a ring is at the bottom right corner of the canvas. Right-click it. Check: the menu stays inside the window. No picture is cut. Make the window 760 px wide and do it again.
`[ ] pass   [ ] fail   note: `

4.16 The right click of a laptop touchpad. Right-click a ring with the touchpad (a two-finger tap, or a press at the lower right of the pad). Check: only the menu of the app shows. The menu of Edge or Chrome does not show.
`[ ] pass   [ ] fail   note: `

4.17 Display scaling 125 % and 150 %. Open the menu and the Properties picker. Check: the 8 pictures are clear. The ring and the arrowheads are not blurred or cut. (If you cannot change the display scaling, use the browser zoom and say so.)
`[ ] pass   [ ] fail   note: `

4.18 Pictures in the picker and on the canvas. Compare the 8 small pictures of the picker with the rings on the canvas and with your picture. Check: the picker shows the same arrows as the canvas. Write down if two pictures look alike (for example 2 and 3) and if the ring is too big in the small picture (D-B-137 in Part 6).
`[ ] pass   [ ] fail   note: `

## Part 5: arrowheads on segments (T07)

The small arrowheads on segments show after you click "Solve flow" and select a segment. They are teal. Each segment of the selected network shows a capacity number and an arrowhead at its middle.

5.1 Go to Level 0 with the source on Level 0. Open the dock tab "Networks" and click "Solve flow". Select a Supply Air segment with the Select tool. Check: every segment of the Supply Air network shows a number and a small arrowhead. The arrowheads point away from the source (toward the riser fitting and toward the terminals).
`[ ] pass   [ ] fail   note: `

5.2 Select a Return Air segment on the same level. Check: the arrowheads of the Return Air network point toward the source.
`[ ] pass   [ ] fail   note: `

5.3 A drawing that you saved before B8. Open a PDF that you saved with the B7 test build and that has a Supply Air network with a source. Click "Solve flow" and select a segment. Check: the arrowheads point away from the source. In the B7 build they pointed toward the source for every network type. This is a deliberate change of B8 (D-B-123). Write down if you want it back.
`[ ] pass   [ ] fail   note: `

5.4 Flip with the segment selected. Keep a Supply Air segment selected. Open the editor for Supply Air, choose "Return" and click Save. Check: the arrowheads flip at once, with no new click on "Solve flow". Set it back to "Supply".
`[ ] pass   [ ] fail   note: `

5.5 The other levels keep their own type. Go to Level 1. Open the editor for Supply Air, choose "Return" and click Save (as in step 3.6). Go to Level 0, click "Solve flow" and select a Supply Air segment. Check: the ring on Level 0 shows the return arrows (pictogram 5). The arrowhead of the segment on Level 0 still points away from the source (Supply), because the drawing of Level 0 has its own copy of the type. This is known. Open the editor for Supply Air on Level 0 and click Save: the arrowheads change. Write down if this is acceptable (item N1 in Part 6). Set Supply Air back to "Supply" on both levels.
`[ ] pass   [ ] fail   note: `

5.6 A water return pipe that uses the supply type (D-B-127). On a plumbing or heating drawing, draw a segment with the type Chilled Water or Heating Water and a source. Click "Solve flow" and select the segment. Check: the arrowheads point away from the source (Supply), also if the pipe is a return pipe. Make a copy of the type (editor, Duplicate), name it "Chilled Water return" and set "Return". Select the pipe and choose the copy in "Network Type" in the Properties panel. Check: the arrowheads point toward the source.
`[ ] pass   [ ] fail   note: `

5.7 No source. Delete the source of a network. Select a segment. Check: the numbers show, but no arrowhead shows.
`[ ] pass   [ ] fail   note: `

5.8 A short segment. Select a very short segment (about 2 cm on screen) at a stub. Check: write down if the arrowhead overlaps the capacity number or the fitting. This is known (the old layout).
`[ ] pass   [ ] fail   note: `

5.9 High-DPI. At 125 % and 150 % display scaling look at an arrowhead. Check: it is visible and its lines are not blurred. (The agent could not run this.)
`[ ] pass   [ ] fail   note: `

## Part 6: known limits and open questions

You have not answered the provisional decisions below yet. The app does what the second column says. To change one, tell the director the id and your option. The questions and options are copied from the ledger (`.claude/roadmap/ledger-buildings.jsonl`). In D-B-132 and D-B-133 the sentences that name the spec file, the tooltips and the wireframe are left out. The rows D-B-122 and D-B-123 are answers, not questions. The row N1 is D-B-142 (options A, B, C in the ledger).

| Id | What the app does now | Question and options (from the ledger) | Where you look |
|---|---|---|---|
| D-B-122 (answered by you, changed) | The arrows scale with the zoom. The ring keeps its old size rule. The arrows are faint below zoom 0.26 and invisible at 0.05. | Answer: "The arrows scale with the zoom (world units)". Reason: "The earlier proposal (constant size on the screen) is dropped." Open (plan section 7, and the reason of D-B-131): you decide on a size limit after the Windows test. | Steps 2.6 and 2.7 |
| D-B-123 (answered, adapted by the director; you can correct it) | The arrowheads on segments follow the flow direction: Supply points away from the source, Return points toward it. | Answer: "The arrowheads on segments follow the flow sense too (supply: away from the source; return: toward the source, as today). This is task T07." | Steps 5.1 to 5.3 |
| D-B-125 | A network type has the field "Flow direction" (Supply or Return). The library defaults are Return for Return Air, Exhaust Air and Sanitary Waste, and Supply for the other eleven. The project file has version 24. | The flow sense of a network type: field NetworkType.flowSense ('supply' or 'return'), editor label "Flow direction", project schema 23 to 24 with a backfill of the library values, one reading function flowSenseOf. Library defaults: return for return-air, exhaust-air and sanitary-waste; supply for the other eleven. A: As written (the domain checker accepted the 14 defaults). | Steps 1.1 to 1.9 |
| D-B-126 | The save of the editor also writes the new type into the copy of every riser with that id in the open building. Other levels keep their own drawing type until you open and save them there. | The editor save changes only the type of the open drawing. The riser keeps its own copy of the type, and the arrows read that copy. How does an edit of Flow direction reach the riser? A: The save of the editor also writes the new type into the riser copy of every riser with that id in the open building. Other levels keep their value until the user opens and saves them. B: The riser arrows read the live type of the open drawing when one is open, else the copy. | Steps 3.6, 3.15, 3.16 and 5.5 |
| D-B-127 | A return pipe that uses a supply type (Chilled Water, Heating Water, Domestic Hot Water) shows supply arrows. You make a copy of the type and set Return. | Chilled water, heating water and domestic hot water have one library type each. A return pipe uses the same type, so it shows supply arrows. What now? A: Add no library type now. A user who needs a return pipe copies the type and sets Return in the editor. (D-B-113: no specific changes to the types for now.) B: Add the library types chilled-water-return, heating-water-return and domestic-hot-water-return, set to return. | Step 5.6 |
| D-B-128 | Conduit and Cable Tray have the default Supply, so their risers show arrows. | Conduit and cable tray carry no flow. The default supply draws arrows on their risers. What now? A: Keep supply. The user can change it in the editor. B: Add a third value none (no arrows, no arrowhead) and make it the default of these two types. | Step 1.3 (the default). Make a Conduit riser to see its arrows. |
| D-B-129 | The editor options read "Supply" and "Return". The hint is in the "i" card. | Editor texts of Flow direction: the options read Supply and Return. The hint reads: "Supply goes away from the source. Return goes toward it. For the other direction of the same system, use Duplicate and change the copy." Right? A: Keep these texts. B: Use the long option texts: Supply (away from the source equipment) and Return (toward the source equipment). | Steps 1.1 and 1.2 |
| D-B-130 (revised) | The direction of the riser arrows comes from the copy of the type in the riser, on every level. The live type of the open drawing gives only the color and the line pattern. | Revised: the flow sense of the arrows comes from the riser copy of the network type (riser.networkType), on every level. The live type of the open drawing gives only the color and the line pattern. Reason: the first build used the live type for the sense and showed Level 0 and Level 2 of one riser with different directions after an editor flip. The editor save updates the riser copy only when a building is open. B: Sense from the riser copy, color and pattern from the live type (built, 763b1d4). A: Everything from the live type (first build; levels can disagree). | Steps 3.6, 3.15 and 3.16 |
| D-B-131 | The arrow starts on the line of the ring (not at the center). It is 64 pt long. The shaft is 2 pt wide, not the line width of the network type. | The arrows start on the line of the ring (as drawn now). In your picture they start at the center of the ring. The arrow is 64 pt long and the shaft is 2 pt wide, not the line width of the network type. Right? A: Keep: start on the ring line, fixed 2 pt shaft. B: Start at the center of the ring. C: Use the line width of the network type for the shaft. | Steps 2.1, 2.6 and 2.7 |
| D-B-132 | A dashed ring (no part of the riser on this level) shows no arrow and has no picker. | UX of T05 (arrows follow the live flow). It adds no new text and no control. Marked rings (solid, a fitting of the riser is there) show the arrows. A dashed ring (free anchor, no level member yet) shows NO arrow and has no picker, because the arrows are stored for each member level. When you draw from the dashed ring, the level becomes a member and the arrows follow. Is it right that a dashed ring shows no arrow? A: Yes: a dashed ring shows no arrow and has no picker. B: No: a dashed ring also shows the arrows of the span that holds its level (needs a new function and a new field in the building file, so a format change you must approve first). | Step 3.12 |
| D-B-133 | One picker with 8 pictures plus "No arrows" and "Use the flow solve" in the right-click menu (inline block) and in the Properties panel. | UX of T06 (choose a pictogram by hand). One picker with the eight pictograms (4 by 2 grid of 36 px cells, in the order of your picture) plus two text items "No arrows" and "Use the flow solve". It sits in two places: (1) the right-click menu of a marked ring, as an inline block under the heading "Riser arrows", (2) the Properties panel of a riser fitting, new row "Arrows" with the value "From the flow solve", "Set by hand" or "None yet". The Risers tab shows a second line "Arrows set by hand" in the row of the level. The change is not undoable (as Direction and Source level); "Use the flow solve" goes back. Right? A: As written: inline block in the menu, picker in the menu and in Properties, a ninth choice "No arrows". B: Menu only (no Properties row). C: A submenu "Riser arrows" in the menu instead of an inline block (the menu has no submenu today). | Steps 4.1 to 4.8 |
| D-B-134 | The warning has the riser name. It does not cover a hand-set ring against a derived ring. | The warning of D-B-121 has no riser name, so two risers give two equal lines. New text, shown in the Risers tab and as a toast after the action: "Arrows of R1 disagree on the span Level 0 to Level 1. Change the arrows on one of the two levels." It replaces the T03 text "Arrows disagree on the span X to Y". It does not cover a hand-set ring against a derived ring. Right? A: Yes, use the new text with the riser name. B: Keep the T03 text. | Step 4.10 |
| D-B-135 | The Risers tab box "Flow direction" says "Up · source: Level 0 · from the flow solve", where "Up" means away from the main level. For a Return type the arrows point toward the main level. | The Risers tab box "Flow direction" reads "Up · source: Level 0" for a whole riser, where Up means away from the main level (B7). For a Return type the arrows on the rings point toward the main level, so the box and the arrows can look opposite. This is part B (T09). Do you want the box changed in part A already? A: No: leave the box until part B (T09). The Windows test script names the difference. B: Yes: change the box in part A, for example to "Away from Level 0" or "Toward Level 0" (a neutral word for every type). | Step 3.7 |
| D-B-136 | While a ring follows the flow solve, the picker marks no picture. "Use the flow solve" has a check mark. | While a ring follows the flow solve, should the picker mark the pictogram that the ring shows now? A: No: mark none and put a check on Use the flow solve (built). B: Yes: mark the current pictogram with a light frame. | Steps 4.1 and 4.6 |
| D-B-137 | In the picker the ring is 9 px and the arrow 13 px. | Size of the ring in the pictures of the picker. In your picture the ring and the arrow are about 1 to 3. In the picker the ring is 9 px and the arrow 13 px (1 to 1.4), so pictograms 2 and 3 can look alike at a glance. A: Keep: ring 9 px, arrow 13 px (built, spec 2.10). B: Ring 7 px, arrow 15 px (closer to your picture). | Step 4.18 |
| D-B-138 | A ring that you set by hand has no mark on the canvas. Only the Properties row and the Risers tab say "Set by hand". | Should a ring with a hand-set pictogram have a mark on the canvas? Today only the Properties row and the Risers tab say that a pictogram is set by hand. A: No mark on the canvas (built). B: A small dot or another ring style on the canvas. | Steps 4.3, 4.7 and 4.9 |
| D-B-139 | The Tab order to the picker in Properties is long (the decision text says 25 Tab presses from the canvas). | The Tab order to the picker in Properties is long (25 Tab presses from the canvas, the general focus order of the app). Change it? A: Leave it (built); the right-click menu is the fast way. B: Move the focus to the picker when a ring is selected with Enter. | Step 4.8 |
| N1 = D-B-142 (found while the script was written; provisional, option A is built) | After you change Flow direction on one level, the riser arrows on every level follow the new value (the copy in the building). The arrowheads on segments of the other levels follow the type that their own drawing holds, until you open the editor on that level and click Save. So on Level 0 the ring can show return arrows while the segment arrowheads still show supply. The agent checked this in a headless browser. | Is it acceptable? Options: leave it (known limit of D-B-126 A), or ask for a change so that the arrowheads also read the copy of the riser. | Step 5.5 |

Items with no step: D-B-140 and D-B-141 are code details (no screen change). The segment arrowhead direction comes from the type in the drawing, else from the library by id, else Supply.

## Part 7: what to tell me

For every step that does not pass, send:
- the step number (for example "3.5"),
- "pass", "fail" or "note",
- what you saw (one or two short sentences),
- a screenshot for each fail (for the arrows, zoom in so that the ring and the arrows fill the picture),
- for display scaling steps: which scale you used, or "browser zoom".

Also tell me:
- your answers to the questions of Part 6 (an id and an option, for example "D-B-131 A"),
- which browser and Windows version you used,
- if you used the desktop app,
- when you are done, so that I can tell the director.

## What the agent ran headless for part A (2026-11-27)

The agent ran a headless Chromium with real clicks, real typing and real right-clicks. It did NOT draw the levels with a mouse. It made the levels (stamps, segments, fittings, sources) and the building file with the scene API and a dev hook. So every "place a source" and "connect" action of Part 3 was set by the API. The agent read the arrows from the scene (`getRiserMarks`) and from screenshots. The check files are `.claude/roadmap/work/b8-t08-check.mjs` and `b8-t08-check-b.mjs` to `b8-t08-check-e.mjs`. The screenshots are in `.claude/roadmap/work/shots-b8/` (names `B8-T08-*`).

- Compared by a check (a pass or a fail): 1.1 (default Return, option texts, label; the dialog title is not compared), 1.2, 1.3, 1.5; 2.4 (dotted; the change back to Solid is not compared); the zoom text of 2.6 and 2.7; 3.1, 3.2, 3.5, 3.9 (source set by API); 3.4 (Level 1 shows no arrow with two sources); 3.6 (the ring on Level 0 and Level 1 after the flip on Level 1; Level 2 is not compared); 4.9 (the tag, with the riser lane clicked); 4.10 (the message text); 4.11 (Undo); 4.15 (menu 12 px from the bottom right corner, at 1600 px width); 5.1 (one segment, the arrowhead points away from the source); 5.5 (ring and arrowhead).
- Printed and read by the agent, not compared: 1.7 (the Tab order: it matches the text of step 1.7), 3.4 (the warning text), 4.1 and 4.2 (the menu items and the tooltip texts), the Tab count of 4.8 (26), the labels of 5.1.
- Run with another set-up than the script: 3.12 (the building file was changed through the API so that Level 2 had no part of the riser; "Detach" was not clicked; the dashed ring and its menu were read), 3.15 and 3.16 (the editor and the building file were set through the API; no restart, no click in Manage Buildings, no "Solve flow" on Level 2).
- Reported by the earlier tasks and not run again here: 2.1, 2.2, 3.3, 3.8, 3.10, 3.13, 3.14 (T05 check), 4.3 to 4.8 and 4.13 (T06 check), 4.15 at 760 px (T06 narrow check), 5.2 and 5.4 (T07 check).
- Not run by the agent, so only you can test them: real tooltips (4.2), the Windows list of the editor (1.10), the narrow editor (1.11), the browser restart (1.8, 3.11, 3.15 and 4.12), the old live site (1.9), a read-only file (4.14), a touchpad right-click and the native menu of the browser (4.16), display scaling and the browser zoom (1.10, 2.9, 4.17, 5.9), a real focus ring (4.8), a real mouse (2.8, 3.13), a closed level with no stored summary (3.11), the real placing of equipment and segments (0.2, 0.4, 3.2 to 3.14), the "Close anyway?" question (3.10), a drain, plumbing or water return pipe (5.3, 5.6), Tauri. The app has no dark theme, so there is no step for it.

## Part B: the Risers tab diagram

Written 2026-11-27 for the branch `worktree-buildings-b8` (task T09, commit 263bce7). It follows part A (Parts 0 to 7 above). The part A steps are unchanged. The step numbers of part B start with the letter B (for example "B2.4"), so they never clash with the part A numbers.

Part B tests one change. The diagram in the Risers tab of Manage Buildings shows the flow direction of each span. The box "Flow direction" has new words. Part B changes no other screen and no file format. The rules of the paragraph "How to use this script" in part A apply: tick one box for each step and write the step number in your feedback (for example "B2.4 fail").

Part A step 3.7 and the row D-B-135 describe the old words of the box ("Up · source: Level 0 · from the flow solve"). Part B replaces them (decision D-B-143, built as option A). Use the new words of part B.

## Part B0: setup

Words in part B (the words of Part 0 stay valid):
- The **diagram** is the picture at the top of the tab "Risers" in Manage Buildings. The levels are in a column at the left. Level 2 is at the top.
- A **lane** is the vertical line of one riser. Its name is above it. It has a ring at each level. The lanes have the order of the list "Show" above the diagram: the return lane is at the left of the supply lane (Return Air comes before Supply Air).
- A **span** is the part of a lane between two levels that are next to each other.
- A **head** is a small filled triangle in the middle of a span. It shows the flow direction of the span. It points up (the flow goes to the higher level) or down (the flow goes to the lower level). A head is about 12 px wide and 10 px high. It has the color of its lane.
- The **box "Flow direction"** is the blue-grey box with a dashed edge in the card of the selected riser. It is under the block "Capacity". Its heading is "Flow direction". The text in the box is **line 1**. A grey line under it is a **note**.
- The **main level** is the level with the source, as in part A.
- A **block** is a part of the card with a heading, for example "Capacity". A **list** is a drop-down list in the card, for example "Source level".
- "The supply riser" and "the return riser" are the Supply Air riser and the Return Air riser of part A.

B0.1 Update the branch. In a terminal in the repository run `git fetch origin`, `git checkout worktree-buildings-b8`, `git pull`, `pnpm install` and `pnpm build`. Start the web app again with `pnpm --filter @mepapp/web dev`. Open the address in Chrome or Edge. Check: the app opens. The onboarding overlay does not show again.
`[ ] pass   [ ] fail   note: `

B0.2 Make the start state. Use the state of part A step 3.5: the building "Tower" with Level 0, Level 1 and Level 2 open, a Supply Air riser and a Return Air riser, and one air handling unit on Level 0 that is connected to each network (two units). Open the editor for Supply Air (dock tab "MEP", sub-tab "Network Types", click the colored dot on the tile). Check: "Flow direction" shows "Supply" and "Pattern" shows "Solid". Click Save. Open the editor for Return Air. Check: "Flow direction" shows "Return" and "Pattern" shows "Dashed". Click Save. (The save writes the type into the risers of the building. Steps 1.4, 2.4, 3.6 and 5.5 of part A changed these values: this step puts them back.) Also remove what part A left. Right-click each ring that you set by hand and click "Use the flow solve". Delete extra units, so that each network has one unit on Level 0. Check: in the Risers tab no grey note shows in the box "Flow direction".
`[ ] pass   [ ] fail   note: `

B0.3 Open Manage Buildings (Menu, "Manage Buildings…") and click the tab "Risers (2)". Check: the tab shows two lanes. The red dashed lane (Return Air) is at the left. The blue solid lane (Supply Air) is at the right. Each lane has three rings. Close the dialog with Escape. Write down the names of the two risers.
`[ ] pass   [ ] fail   note: `

## Part B1: the heads in the diagram

Use the start state of B0.2. Part B needs no save of a PDF. The diagram reads the open levels live and the closed levels from their saved summaries. Keep all three levels open.

B1.1 Open Manage Buildings, tab "Risers". Wait one second. Check: at the right of the diagram a legend shows four rows: "at position", "waiting", "not at position" and "flow direction". The row "flow direction" has a small grey triangle that points up. (In a window narrower than 1200 px the legend is under the diagram: see B5.6.)
`[ ] pass   [ ] fail   note: `

B1.2 Look at the supply lane (blue, solid). Check: two small filled blue triangles. Both point up. One is between Level 0 and Level 1. One is between Level 1 and Level 2. Each head is in the middle of its span. No head touches a ring. A thin white edge cuts the lane around each head.
`[ ] pass   [ ] fail   note: `

B1.3 Look at the return lane (red, dashed). Check: two small filled red triangles. Both point down. The heads are solid, not dashed. The lane under them stays dashed.
`[ ] pass   [ ] fail   note: `

B1.4 Compare the diagram with the canvas (the same picture as the ring arrows, span by span). Close the dialog. Go to Level 0, Level 1 and Level 2 one after the other. Write down the pictogram of the supply ring and of the return ring on each level (the numbers of the table in Part 0). Check: the supply rings show 2, 1 and 3. The return rings show 5, 4 and 6. One span is shown twice on the canvas. The span between Level 0 and Level 1 is the upper arrow of the ring on Level 0 and the lower arrow of the ring on Level 1. For the supply riser both arrows mean "up". For the return riser both mean "down". Open the Risers tab again. Check: each head agrees with the two ring arrows of its span.
`[ ] pass   [ ] fail   note: `

B1.5 Click one head of the return lane with the mouse. Check: the return lane gets the light halo. The card below the diagram shows the name of the return riser. In the box "Flow direction", line 1 reads `Toward Level 0 · from the flow solve`. (A click on a head selects its lane. A head is not a separate control.)
`[ ] pass   [ ] fail   note: `

B1.6 Click the name of the supply lane. Scroll the card to the box "Flow direction". Check: line 1 reads `Away from Level 0 · from the flow solve`. No grey note shows. The old words "Up" and "source:" do not show in the box.
`[ ] pass   [ ] fail   note: `

B1.7 Press Tab until a lane has the focus (a frame shows around it). Press the Left arrow and the Right arrow. Check: the selection moves to the next lane. The heads, the legend and the scroll position of the card stay. No dialog closes.
`[ ] pass   [ ] fail   note: `

## Part B2: where the source is

Part A steps 3.8, 3.9, 3.1 and 3.4 show how to move a source. Do the same here. Each time: close the dialog, change the source on the canvas, wait 3 seconds and open the Risers tab again. Click the lane to read the box.

B2.1 A source in the middle of three levels. Delete the air handling unit of the supply network on Level 0. Place one on Level 1 and connect it to the supply network (part A step 3.8). Keep the return unit on Level 0. Open the Risers tab. Check: the supply lane has one head up (between Level 1 and Level 2) and one head down (between Level 0 and Level 1). Both heads point away from Level 1. The return lane still shows two heads that point down. Click the supply lane: line 1 reads `Away from Level 1 · from the flow solve`. On the canvas the supply rings show 5 (Level 0), 7 (Level 1) and 3 (Level 2).
`[ ] pass   [ ] fail   note: `

B2.2 A return riser with the source in the middle. Move the return unit from Level 0 to Level 1 in the same way. Check: the return lane has one head down (between Level 1 and Level 2) and one head up (between Level 0 and Level 1). Both heads point toward Level 1. Click the return lane: line 1 reads `Toward Level 1 · from the flow solve`. On the canvas the return rings show 2, 8 and 6.
`[ ] pass   [ ] fail   note: `

B2.3 A source on the top level. Move the supply unit to Level 2. Check: the supply lane has two heads that point down. Line 1 reads `Away from Level 2 · from the flow solve`. Put the supply unit and the return unit back on Level 0 when you finish. Check: the lanes show the heads of B1.2 and B1.3 again.
`[ ] pass   [ ] fail   note: `

B2.4 No source. Delete the supply unit. Open the Risers tab. Check: the supply lane has no head. The return lane keeps its two heads. Click the supply lane: line 1 reads `No arrows yet: no source level.` Above the card the box "Warnings" shows `Riser <name> has no source level. Set one by hand.` with the real name of the supply riser. On the canvas the supply rings show no arrow. Put the supply unit back on Level 0.
`[ ] pass   [ ] fail   note: `

B2.5 Two sources. Place a second supply unit on Level 2 and connect it. Open the Risers tab. Check: the supply lane has no head. Line 1 reads `No arrows yet: more than one source level.` The box "Warnings" shows `Riser <name> has more than one source level (Level 0, Level 2). Set one by hand.` Delete the second unit. Check: the heads come back.
`[ ] pass   [ ] fail   note: `

B2.6 The same height. Write down the elevation of each level (Manage Buildings, tab "Levels and sheets", click the level, field "Elevation (mm)"). Set the elevation of Level 1 and of Level 2 to the elevation of Level 0 (type the number and press Enter). Open the tab "Risers" and click the supply lane. Check: no lane has a head. Line 1 reads `No arrows. The levels of this riser have the same height.` Set the two elevations back to the numbers that you wrote down. Check: the heads come back.
`[ ] pass   [ ] fail   note: `

## Part B3: the box "Flow direction", the two lists and the grey notes

Use the start state of B0.2 (the heads of B1.2 and B1.3). All the texts here are in the box "Flow direction" or under it.

The texts of line 1 (the app writes one of them):

| Text | When |
|---|---|
| `Away from Level 0 · from the flow solve` | A supply type. The main level comes from the source. |
| `Toward Level 0 · from the flow solve` | A return type. The main level comes from the source. |
| `Away from Level 1 · Set by hand` or `Toward Level 1 · Set by hand` | You chose the main level in the list "Source level". |
| `No arrows yet: no source level.` | No source on any level (B2.4). |
| `No arrows yet: more than one source level.` | Two sources (B2.5). |
| `No arrows. The levels of this riser have the same height.` | B2.6. |
| `No arrows. This riser has one level.` | A riser with one level. No step makes it. |
| `Reading the saved summaries…` | The app reads the saved summaries. It shows for a short time. |

B3.1 Set the source level by hand. Delete the supply unit (no source). Open the tab "Risers" and click the supply lane. Under the block "Capacity" click "Set by hand". Check: a hint shows `Choose a level in the list "Source level".` The two lists "Source level" and "Direction" show in the card, and a link "Use the flow solve". The list "Source level" has the options "From the flow solve", "Level 2", "Level 1" and "Level 0" (the highest level first). Choose "Level 1". Check: the supply lane gets one head up and one head down at once. Line 1 reads `Away from Level 1 · Set by hand`.
`[ ] pass   [ ] fail   note: `

B3.2 Close the dialog. Go to the canvas of Level 0, Level 1 and Level 2. Check: the supply rings follow the source level that you chose by hand: 5 on Level 0, 7 on Level 1 and 3 on Level 2. (The source level that you set by hand is the main level for the flow solve, so the rings follow.)
`[ ] pass   [ ] fail   note: `

B3.3 Two sources and a source level by hand. Put a supply unit on Level 0 and a supply unit on Level 2 (two sources). Open the tab "Risers" and click the supply lane. Check: the lane keeps its heads (one up, one down). Line 1 still reads `Away from Level 1 · Set by hand`. The source level that you chose wins. Choose "From the flow solve" in the list "Source level". Check: the heads go. Line 1 reads `No arrows yet: more than one source level.` The two lists close. Click "Set by hand" again and choose "Level 0". Check: the lane gets two heads that point up. Line 1 reads `Away from Level 0 · Set by hand`.
`[ ] pass   [ ] fail   note: `

B3.4 The list "Direction". The list has the options "Up", "Down" and "Both". Choose "Up", then "Down", then "Both". After each choice look at the diagram. Check: no head changes. Line 1 does not change. A grey note shows under line 1: `Direction set by hand: Up. The arrows do not use it.` The note names the word that you chose ("Down" and "Both" in the next two notes). The list changes no arrow (decision D-B-146 in the table of Part B6).
`[ ] pass   [ ] fail   note: `

B3.5 Click "Use the flow solve". Check: the two lists go. Line 1 reads `No arrows yet: more than one source level.` again. The grey note is gone. Delete the second supply unit (on Level 2). Check: the heads come back (up, up). Line 1 reads `Away from Level 0 · from the flow solve`.
`[ ] pass   [ ] fail   note: `

B3.6 A ring with a pictogram that you set by hand. Close the dialog. Go to Level 1. Pick the Select tool, right-click the supply ring and click the picture "Comes down, goes down" (pictogram 4). Check: the ring shows pictogram 4. Open the tab "Risers". Check: the supply lane still shows two heads that point up. The diagram follows the flow solve and not the ring that you set (decision D-B-144). Click the supply lane. Check: under line 1 a grey note reads `Some rings use arrows set by hand. The diagram shows the flow solve.` In the list of levels at the right of the card, the row "Level 1" has the tag `Arrows set by hand` (it can wrap to a second line).
`[ ] pass   [ ] fail   note: `

B3.7 Go back. Close the dialog. Right-click the ring on Level 1 and click "Use the flow solve". Check: the ring shows pictogram 1 again. Open the tab "Risers" and click the supply lane. Check: the grey note and the tag "Arrows set by hand" are gone.
`[ ] pass   [ ] fail   note: `

## Part B4: a flip of the flow direction, patterns, tooltip and lane label

B4.1 A flip on the open level. Go to Level 1. Open the editor for Supply Air. Choose "Return" in "Flow direction" and click Save. Do not save a PDF. Open Manage Buildings, tab "Risers". Check: the supply lane now has two heads that point down (as the return lane). Click the supply lane: line 1 reads `Toward Level 0 · from the flow solve`. Close the dialog. Check: the supply rings show 5, 4 and 6 on Level 0, Level 1 and Level 2.
`[ ] pass   [ ] fail   note: `

B4.2 The same flip seen on another level. Go to Level 0. Open Manage Buildings, tab "Risers". Check: the supply lane shows the same two heads that point down and the same line 1. The diagram reads the copy of the type in the building (decision D-B-126 of part A). The save of the editor writes that copy for all levels. So the diagram has no gap between levels. Compare with part A step 5.5 (item N1, D-B-142). On Level 0 click "Solve flow" and select a supply segment. Its small arrowhead follows the old type until you open the editor on Level 0 and click Save. Write down if you want the segment arrowheads to follow the building copy too.
`[ ] pass   [ ] fail   note: `

B4.3 Flip back. Open the editor for Supply Air, choose "Supply" and click Save. Open the tab "Risers". Check: the supply lane shows two heads that point up again.
`[ ] pass   [ ] fail   note: `

B4.4 A dotted lane next to a solid lane. Open the editor for Supply Air. Set "Pattern" to "Dotted". Click Save. Open the editor for Return Air. Set "Pattern" to "Solid". Click Save. Open the tab "Risers". Check: the supply lane is a thin dotted line. The return lane is a plain line. All four heads are solid filled triangles, also on the dotted lane. You can read the direction of each head. A thin white edge cuts the dotted lane around each head. (Decision D-B-145.) Write down if a head is hard to see. Then set the patterns back: Supply Air "Solid", Return Air "Dashed".
`[ ] pass   [ ] fail   note: `

B4.5 The legend row. Look at the row "flow direction" of the legend. Check: its triangle is grey. It does not have the color of a lane. The text is in lower case, as in the other rows.
`[ ] pass   [ ] fail   note: `

B4.6 The tooltip of a head. Put the mouse pointer on a head of the supply lane and keep it still for about one second. Check: a tooltip shows `Flow goes up: Level 0 to Level 1` for the lower head and `Flow goes up: Level 1 to Level 2` for the upper head. For the return lane the tooltip shows `Flow goes down: Level 1 to Level 0` for the lower head and `Flow goes down: Level 2 to Level 1` for the upper head. The tooltip names the two levels in flow order: the level where the flow starts, then the level where it ends. Move the pointer to the lane line away from a head. Check: the tooltip shows only the name of the riser or nothing. (The agent could not see a real tooltip.)
`[ ] pass   [ ] fail   note: `

B4.7 The lane label. The text above a lane is the name of the riser only. A screen reader reads more. Open the developer tools (F12), tab "Elements", and select a lane with the pointer tool of the developer tools. The lane is an element `g` with `role="radio"`. Open the pane "Accessibility" and read "Name". Check: the supply lane has the name `<riser name>, Level 0 to Level 2, 3 levels, 6.00 m, flow away from Level 0`. The return lane ends with `, flow toward Level 0`. A lane that has no head (delete the supply unit and look again) has no text about flow. If you use Narrator (Windows key, Ctrl and Enter), press Tab until a lane has the focus and write down what Narrator says.
`[ ] pass   [ ] fail   note: `

## Part B5: Windows screens and the real browser

B5.1 Display scaling. Set the display scaling of Windows to 125 % and then 150 % (Settings, System, Display, Scale). Reload the page. Open the tab "Risers". Check at each scale: the heads are clear. The white edge around a head is not blurred. No head touches a ring. The legend triangle shows. If you do not want to change the display scaling, use the browser zoom and write "browser zoom, not display scaling".
`[ ] pass   [ ] fail   note: `

B5.2 Zoom 200 %. Set the browser zoom to 200 % (Ctrl and +). Open the tab "Risers". Check: the dialog stays inside the window. The lane names and the heads are whole. You can reach the box "Flow direction" by scrolling the card. Set the zoom back to 100 %.
`[ ] pass   [ ] fail   note: `

B5.3 A 1366 x 768 screen. Make the browser window 1366 px wide and about 768 px high (a small laptop screen; on a big screen use the window edge or the developer tools). Open the tab "Risers" and click the supply lane. Write down: do you see the box "Flow direction" at once, or must you scroll the card? (The agent saw the box outside the visible area at this size. This is finding J2 in the table of Part B6.) Scroll the card with the mouse wheel or the touchpad and read the box. Check: you can read the whole box after the scroll.
`[ ] pass   [ ] fail   note: `

B5.4 "Set by hand" and the mouse wheel. At 1366 x 768 click the supply lane. Click "Set by hand" under the block "Capacity". Write down what the dialog shows now. Does the diagram stay in view, or does the card scroll so that the top of the diagram is cut? (The agent saw this. The top of the diagram was about 25 px above the card. The lane names and the top rings were cut. The box and the two lists were in view. This is finding J1.) Scroll up with the mouse wheel or the touchpad, with the pointer on the card. Check: the content moves back and the whole diagram shows again. Choose a "Source level". Turn the wheel as needed to see the heads. Click "Use the flow solve" when you finish.
`[ ] pass   [ ] fail   note: `

B5.5 A tall window. Make the window 1600 px wide and 900 px high. Do B5.4 again. Check: the whole diagram stays in view after "Set by hand". Write down what you see if it does not.
`[ ] pass   [ ] fail   note: `

B5.6 A window 760 px wide. Make the browser window 760 px wide. Open the tab "Risers". Check: the legend is under the diagram as a row of four items. The heads are whole. Click a lane: the box and the grey notes wrap to a second line and no text is cut. If you made more than six risers, the diagram scrolls sideways inside its own box and the heads scroll with the lanes.
`[ ] pass   [ ] fail   note: `

B5.7 A closed level with no stored summary. Save each open level (Menu, Save). Close the browser fully. Open the app again with your normal browser profile (not a private window). Open the building "Tower" (if the card "Allow access" shows, allow it). Open only Level 0. Open Manage Buildings, tab "Risers", and click the supply lane. Write down what you see: heads or no heads, and what line 1 says. If the block "Capacity" shows the link "Read summaries now", click it. Check: after the click the numbers and the heads show, or a notice says that a PDF must be opened first. Open Level 1 and Level 2 again. (The agent did not run this case. If no level lacks a saved summary, write "not testable".)
`[ ] pass   [ ] fail   note: `

B5.8 The real profile after a restart. Open Level 0, Level 1 and Level 2 again and save each one. Close the browser fully. Open the app, open the building "Tower" and open the tab "Risers". Check: the heads of B1.2 and B1.3 show (the closed levels use their saved summaries). Line 1 of both risers is the same as in B1.5 and B1.6.
`[ ] pass   [ ] fail   note: `

## Part B6: known limits and open questions

The app does what the second column says. To change one, tell the director the id and your option. The questions and options come from the ledger (`.claude/roadmap/ledger-buildings.jsonl`). J1 and J2 are findings of the journey tester. They are not the journeys J1 to J5 of the UX spec. The findings are open. They are not decisions yet, so each row shows the real behavior and one question.

| Id | What the app does now | Question and options | Where you look |
|---|---|---|---|
| D-B-143 (answers D-B-135 for part B; provisional, option A built) | The box "Flow direction" reads `Away from <main level>` (supply) or `Toward <main level>` (return), then `· from the flow solve` or `· Set by hand`. The words "Up", "Down" and "source:" are gone from the box. | The box read "Up · source: Level 0" and Up meant away from the main level. For a Return type the arrows point toward the main level, so the box and the arrows could look opposite. What should the box say now that the diagram shows arrows? A: A neutral phrase that fits the type: "Away from Level 0" (supply) or "Toward Level 0" (return), and the arrows in the diagram. The Direction select stays as it is. B: Keep the box text. Add only the arrows to the diagram. | Steps B1.5, B1.6, B2.1 to B2.6 and B3.1 |
| D-B-144 (provisional, option A built) | The heads follow the flow solve, not the pictogram that you set by hand on a ring. A grey note in the box says so. | The arrows in the Risers tab diagram follow the flow solve, not the pictogram that you set by hand on a ring. A span has one direction, a ring pair has two ends. A grey note in the box says it when a ring has a hand-set pair. Is this right? A: Yes: the diagram shows the flow solve only. B: The diagram also shows a hand-set pair when one ring of the span has it (more rules, a span can then contradict itself). | Steps B3.6 and B3.7 |
| D-B-145 (provisional, option A built) | The head is always a solid triangle, also on a dashed or dotted lane. The lane under it keeps its pattern. | The plan said "in the pattern of the lane". Is a solid head right? A: Yes: solid head, as the ring arrowhead on the canvas. B: Head with the pattern of the lane (a dotted triangle is hard to read at 12 px). The contrast of the blue head with its white edge is about 2.5 to 1, the same as the lane: look at it on your screen. | Steps B1.2, B1.3 and B4.4 |
| D-B-146 (provisional, option A built) | The list "Direction" (Up, Down, Both) changes no head, no number and no text of line 1. A grey note says so. Only the Excel takeoff reads the value. | The list changes nothing on the screen. Keep it? A: Keep it for now. A later task decides (remove it, or let it set the arrows). B: Remove it from the Risers tab now (a change to a field of the building file that old files still hold). | Step B3.4 |
| J1 (finding of the journey tester, medium, open) | After you click "Set by hand" the card scrolls to the two lists. At 1366 x 768 the top of the diagram moves out of view, so you cannot see all the heads while you pick the "Source level". At 1600 x 900 the diagram stays in view. The old pane did the same. | Accept it, or keep the diagram in view (for example a fixed diagram above a card that scrolls)? Tell the director "J1 accept" or "J1 change". | Steps B5.4 and B5.5 |
| J2 (finding of the journey tester, medium, open) | On a small screen (1366 x 768) and in a window 760 px wide, the box "Flow direction" is outside the visible area: you scroll the card to read it. The box is under the block "Capacity". | Accept it, or put the box higher in the card? Tell the director "J2 accept" or "J2 change". | Steps B5.3 and B5.6 |

Items with no step: arrows for the open end of a riser, a word for the direction of each span in the list "Capacity", a riser with the source on the level of another riser only, and a dark theme (the app has none). Three texts of line 1 have no step because a short test on one PC cannot make them with the real screens: `No arrows. This riser has one level.`, `No arrows yet: the risers make a loop.` and `No arrows yet: two main levels set by hand.` A unit test of the app checks the first one.

## Part B7: what to tell me

Send what Part 7 asks for, with the step numbers of part B (for example "B2.4 fail"). Also tell me:
- your answers to the questions of the table in Part B6 (an id and an option, for example "D-B-145 A" or "J2 change"),
- the display scale or the browser zoom that you used in B5.1,
- the size of your screen for B5.3,
- when you are done, so that I can tell the director.

## What the agent ran headless for part B (2026-11-27)

The agent ran a headless Chromium with real clicks, real typing and real right-clicks, as for part A. It made the three levels and the building file with the scene API and a dev hook. So every "place a unit" and "connect" action of Parts B2 and B3 was set by the API. It read the heads, the texts, the tags and the notes from the DOM, and the ring pictograms from the scene (`getRiserMarks`). The check files are `.claude/roadmap/work/b8-t09-check.mjs` (52 passed), `b8-t10-check.mjs` (65 passed) and `b8-t10-check-b.mjs` (23 passed). The screenshots are in `.claude/roadmap/work/shots-b8/` (names `B8-T09-*`).

- Compared by a check (a pass or a fail): B1.1 (the four rows of the legend), B1.2, B1.3, B1.4 (the ring pictograms 2, 1, 3 and 5, 4, 6 next to the heads), B1.5 (a real click on a head), B1.6, B1.7 (the arrow key), B2.1 to B2.6 (with the Elevation field typed in the real Levels tab), B3.1 to B3.5, B3.6 and B3.7 (the real ring menu), B4.1 to B4.3 (the real editor), B4.4 (the real editor; the dash of the lane and of the heads), B4.6 (the text of the tooltip, read from the SVG title), B4.7 (the name of the lane, read from the DOM and found by its role), B5.4 (a mouse wheel event in the headless browser), B5.6 (the legend under the diagram at 760 px).
- Printed and read by the agent, not compared: B3.1 (the hint under "Set by hand"), B4.5 (the color of the legend triangle, read in a screenshot), B5.3 and B5.4 (the position of the diagram and of the box at 1366 x 768 and at 1600 x 900: the numbers are in the text of J1 and J2), the screenshots.
- Run with another set-up than the script: B2.1 to B2.5 and B3.1 to B3.5 (units set by the API, not placed with the mouse), B3.6 (the check used pictogram 4 as the script does), B4.1 (the level was changed with the switcher and the editor was real).
- Not run by the agent, so only you can test them: B0.1, B0.2 (the real placing of units and the editor values), a real tooltip (B4.6), the Accessibility pane of the developer tools and Narrator (B4.7), display scaling (B5.1), the zoom 200 % (B5.2), a real 1366 x 768 screen and a real mouse wheel (B5.3 to B5.5), a closed level with no stored summary (B5.7), a real browser profile and a restart (B5.7 and B5.8), Tauri. The app has no dark theme, so there is no step for it.
