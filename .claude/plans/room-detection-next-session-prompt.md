# Prompt for the next room detection session

Copy the text below the line into a new session. Start it in the worktree `room-detection-plan` (branch `worktree-room-detection-plan`, last commit `e7764a2`, pushed).

---

We continue the MepApp room detection work. Read `.claude/plans/room-detection.md` first. The STATUS entries 8e to 8j describe the latest state, the measurements, the rejected options and the "not verified" lists. Also read the memory notes for this project.

Working pattern: implement one topic at a time, verify with evidence (tests, Node measurements on the fixtures, Playwright for UI), add a STATUS entry to the plan, commit, and ask before you push. I test on Windows after each push. The fixture PDFs are in `fixtures/pdfs/` (untracked). Run `pnpm install` and `pnpm build` at the repo root before you start.

## Topic 1: Keep improving the room detection

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

The user must edit a placed room polygon more easily. Required: select several vertices (snap points) of a polygon at once (click, shift-click, box select), then drag them together or delete them. Check what the vertex editing in `packages/render` and `packages/ui` supports today (`updateRoom`, vertex drag, merge) and reuse the existing selection and undo mechanisms. Every edit must be one undo step. Verify with real mouse input in Playwright, not only through the scene API (an earlier bug hid behind a scene-API-only check).

## Topic 3: A dragged room is clipped, not the room it is dragged into

Today the overlap rule (`rooms/overlap.ts`, `planRoomOverlaps` in `render/scene.ts`) trims the existing detected rooms when a locked or edited room overlaps them. Change this for a room that the user drags or edits: the dragged room is clipped by the other rooms, and the other rooms stay unchanged. Then the user can draw a big open room around existing rooms, and the remaining space becomes the polygon of the big room (the existing rooms become holes or cut-outs in it). Decide with me how the priority rule should change (the current rule gives locked and hand-made rooms priority 2). Check how holes display and edit in the UI, because that was not verified. Keep the exact undo (`replaceRoomsCommand`).

## Not decided yet

Phase 9 (element-to-room assignment and per-room calculations): I still need to give you the list of calculations. Do not start it.
