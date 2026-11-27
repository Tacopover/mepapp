# Test script B8, part A: riser arrows

Written 2026-11-27 for the branch `worktree-buildings-b8` (tasks T01 to T07). Part B of B8 (the Risers tab, T09 and T10) is not built. It starts only after you test this part and say go.

For one PC with Windows. Use Chrome or Edge. You can use the desktop app instead: then say so in your notes. The agent ran real browser checks in a headless Chromium (no real window, no real tooltip, no real focus ring). It could not run Windows display scaling, a real browser restart, a read-only file, a touchpad, Tauri or a real mouse. The steps below cover exactly these gaps. The end of the file lists which steps the agent ran headless and how.

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
- when you are done, so that I can tell the director. Part B (the Risers tab, T09 and T10) starts only after you say go.

## What the agent ran headless (2026-11-27)

The agent ran a headless Chromium with real clicks, real typing and real right-clicks. It did NOT draw the levels with a mouse. It made the levels (stamps, segments, fittings, sources) and the building file with the scene API and a dev hook. So every "place a source" and "connect" action of Part 3 was set by the API. The agent read the arrows from the scene (`getRiserMarks`) and from screenshots. The check files are `.claude/roadmap/work/b8-t08-check.mjs` and `b8-t08-check-b.mjs` to `b8-t08-check-e.mjs`. The screenshots are in `.claude/roadmap/work/shots-b8/` (names `B8-T08-*`).

- Compared by a check (a pass or a fail): 1.1 (default Return, option texts, label; the dialog title is not compared), 1.2, 1.3, 1.5; 2.4 (dotted; the change back to Solid is not compared); the zoom text of 2.6 and 2.7; 3.1, 3.2, 3.5, 3.9 (source set by API); 3.4 (Level 1 shows no arrow with two sources); 3.6 (the ring on Level 0 and Level 1 after the flip on Level 1; Level 2 is not compared); 4.9 (the tag, with the riser lane clicked); 4.10 (the message text); 4.11 (Undo); 4.15 (menu 12 px from the bottom right corner, at 1600 px width); 5.1 (one segment, the arrowhead points away from the source); 5.5 (ring and arrowhead).
- Printed and read by the agent, not compared: 1.7 (the Tab order: it matches the text of step 1.7), 3.4 (the warning text), 4.1 and 4.2 (the menu items and the tooltip texts), the Tab count of 4.8 (26), the labels of 5.1.
- Run with another set-up than the script: 3.12 (the building file was changed through the API so that Level 2 had no part of the riser; "Detach" was not clicked; the dashed ring and its menu were read), 3.15 and 3.16 (the editor and the building file were set through the API; no restart, no click in Manage Buildings, no "Solve flow" on Level 2).
- Reported by the earlier tasks and not run again here: 2.1, 2.2, 3.3, 3.8, 3.10, 3.13, 3.14 (T05 check), 4.3 to 4.8 and 4.13 (T06 check), 4.15 at 760 px (T06 narrow check), 5.2 and 5.4 (T07 check).
- Not run by the agent, so only you can test them: real tooltips (4.2), the Windows list of the editor (1.10), the narrow editor (1.11), the browser restart (1.8, 3.11, 3.15 and 4.12), the old live site (1.9), a read-only file (4.14), a touchpad right-click and the native menu of the browser (4.16), display scaling and the browser zoom (1.10, 2.9, 4.17, 5.9), a real focus ring (4.8), a real mouse (2.8, 3.13), a closed level with no stored summary (3.11), the real placing of equipment and segments (0.2, 0.4, 3.2 to 3.14), the "Close anyway?" question (3.10), a drain, plumbing or water return pipe (5.3, 5.6), Tauri. The app has no dark theme, so there is no step for it.
