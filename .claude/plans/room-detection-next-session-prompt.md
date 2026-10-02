# Prompt for the next room detection session

Copy the text below the line into a new session. Start it in the worktree `room-detection-plan` (branch `worktree-room-detection-plan`, at master `b3545ab`). Do not start it in a fresh worktree: the new PDF is untracked and exists only in this worktree.

---

We continue the MepApp room detection work. Read `.claude/plans/room-detection.md` first. The STATUS entries describe the latest state, the measurements, the rejected options and the "not verified" lists. Also read the memory notes for this project.

Working pattern: implement one topic at a time, verify with evidence (tests, Node measurements on the fixtures, Playwright for UI), add a STATUS entry to the plan, commit, and ask before you push. I test on Windows after each push. The fixture PDFs are in `fixtures/pdfs/` (some untracked). Run `pnpm install` and `pnpm build` at the repo root before you start.

## Topic 4: Detect rooms finds few rooms on a new drawing

STATUS: DONE 2026-10-02 (merged to master `e7e7da8`). Cause: each label has three lines and the area line uses a smaller font, and numbers like `10A.00.030` matched no pattern, so only 2 labels had a name. Fix: labels are now found from the area line (`labels.ts` `areaAnchoredBlocks`) and any number format is accepted. The new drawing now gives 37 named labels and 34 rooms at 1:100 (13 within 15 % of the printed area). Remaining on this drawing: room shapes (for example `NSA ruimte 1` 15 m2 against 53.7 printed) and 4 labels without an area. See `room-detection.md` STATUS "Topic 4". The original task text follows.

New fixture: `fixtures/pdfs/plattegrond begane grond 10A.pdf` (13 MB, untracked, added 2026-10-01). Detect rooms finds only a few rooms, but the floor plan has many more. The Fill room tool (click-to-fill) adds good rooms in the rooms that I click. So the walls close the rooms, and the problem is in the automatic step.

Find the cause first, change nothing until you report it. Check which step loses the rooms, for example:
- Are the room labels found (text runs, number/name/area pattern)? Compare the label count with the rooms on the plan.
- Does Detect rooms use a different gap, scale or region than click-to-fill (calibration, page size, region of interest)?
- Do the room seeds fail, or do the fills get rejected afterwards (overlap, misplaced-room rule, area checks)?
- Is the drawing different from the other fixtures (layers, text as outlines, rotation, very large page)?
Use Node scripts on the core package (like `scripts/room-labelled.mjs`) for the measurements. Then propose a fix and ask me before you build it.

## Topic 1: Keep improving the room detection

STATUS 2026-10-01: PAUSED. Line-label work done (labels 5 -> 20 of 46, door rule, misplaced rooms become label rectangles); room score flat, so the user chose "good enough" details. Open: shared open spaces (24 rooms), toilets -20..-28 %, see room-detection.md.

Known remaining problems (see the plan for details):
- Open-plan lobby on the ground floor (0.2 Entree, 0.34 Ontvangstzone): shapes are still wrong (8.0 and 11.4 m2 against 14 and 20 printed).
- Labels without a room: ground floor 3 (W-0a Bestek note, 0.5a Werkkast, 0.19 Werkplek inside the large circulation region), first floor 6 (five generic "Space" duplicates and a note). Idea: a filter for generic or duplicate label names.
- Area agreement with the printed areas is lower since the overlap rule (Example_2 26, Example_3 24, ground floor 37, first floor 22 rooms within 15 %).
- Bounded (open-plan) rooms stop at the printed area, so their sides do not always reach the walls (0.37 Werkplek 56 m2 against 49 printed).
- Axis-parallel notches (door frames, 100 mm jogs) stay in the outlines. The orthogonal pass only handles slanted edges.
- Rectangular cuts are axis-aligned only (rotated plans are not handled).
- Example_1 needs OCR for the outline text.
- Detect rooms takes 15 to 19 s on Example_2 and Example_3.
- Dashed lines as soft partitions were never tried.

Start by asking me which of these I see as most important after testing on Windows, and ask for screenshots of the rooms that look wrong.

## Topic 2: Easier editing of placed rooms (UI)

STATUS: DONE (f6efb62, merged to master 37d2a2e 2026-10-01).

The user must edit a placed room polygon more easily. Required: select several vertices (snap points) of a polygon at once (click, shift-click, box select), then drag them together or delete them. Check what the vertex editing in `packages/render` and `packages/ui` supports today (`updateRoom`, vertex drag, merge) and reuse the existing selection and undo mechanisms. Every edit must be one undo step. Verify with real mouse input in Playwright, not only through the scene API (an earlier bug hid behind a scene-API-only check).

## Topic 3: A dragged room is clipped, not the room it is dragged into

STATUS: DONE 2026-10-01 (cba1cff, merged to master 37d2a2e): dragged vertices stop at the other room's edge, the edited outline wraps around other rooms, other rooms never change.

Today the overlap rule (`rooms/overlap.ts`, `planRoomOverlaps` in `render/scene.ts`) trims the existing detected rooms when a locked or edited room overlaps them. Change this for a room that the user drags or edits: the dragged room is clipped by the other rooms, and the other rooms stay unchanged. Then the user can draw a big open room around existing rooms, and the remaining space becomes the polygon of the big room (the existing rooms become holes or cut-outs in it). Decide with me how the priority rule should change (the current rule gives locked and hand-made rooms priority 2). Check how holes display and edit in the UI, because that was not verified. Keep the exact undo (`replaceRoomsCommand`).

## Not decided yet

Phase 9 (element-to-room assignment and per-room calculations): I still need to give you the list of calculations. Do not start it.
