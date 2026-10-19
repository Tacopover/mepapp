# R6 small fixes (low items open at the end of R6)

Origin: `auto-routing-r6.md`, the audit and the domain check of R6, and the task lead findings of T21 to T26. The user wants these later. The task lead did not do them.

## From the audit and the domain check

- (a) The target markers of the Route dialog use `findRoutePorts` with the default 'nearest' (`RouteDialog.tsx` about 104-116 and 137-141). The planner uses portChoice 'order' (`scene.ts` about 2951). A marker can sit on another port than the one the route reaches. Fix: pass 'order', or take the target list from the scene.
- (b) A hand-inserted fitting (`route-marks.ts:65-69`, `segmentTool.ts:83-105`) stays as an orphan after a re-run. Fix: a re-run also removes an unmarked fitting when no outside segment uses it.
- (c) The walk (`route-marks.ts:47-56`) can join two runs that the user linked by hand at a shared fitting. A re-run of one run then removes the other run. Write this as a known limit, or add a test.
- (d) The walk differs from plan step 2.1 when 2 or more marked segments sit on the start port. Fix round B covers this now. Update the plan text.
- (e) The list of gravity types exists twice: `ROUTE_GRAVITY_TYPE_IDS` in core `route-plan-warnings.ts:5` and `GRAVITY_TYPE_IDS` in ui `routePlan.ts:4`. Export one constant from core.
- (f) `applyRoute` ignores the return value of `adoptNetworkTypes` (`scene.ts` about 3044). The 'missing' ids are not checked.
- (g) 'Place route' falls back to a new plan when `applyRoute` returns null (`RouteBuildSection.tsx` about 80). It shows no notice.
- (h) From the auditor: the Warning no-limits shows when `sizeNetwork` returns a status other than ok (`route-build.ts` about 463), although the cause is not the limits.
- (i) On the first floor, 28 of 33 rooms are off the route graph (84.8 percent), and the route has 26 wall crossings. This works as designed (Q-R6-04 A). The user must judge the result on screen.

## From the task lead

- A real stamp whose library definition is missing gets no sprite when the project loads (`scene.ts:4390-4392` skips it). `writeAnnotationForId` then writes no annotation (`scene.ts:4554-4556`), so a later Open counts the stamp as a missing annotation and shows the drift banner "annotations differ from its saved project data", and a Save drops it without a notice. Proposed fix: skip stamps without a sprite in `domainSyncEntries` (`scene.ts:4500`). The banner after Open in the T24 and T26 checks is a test artifact of this (the checks load their stamps through `loadProjectFromJson`). R6 does not cause it.
- A drag or a delete in the middle of a run leaves marked segments that an unmarked item holds. The dialog now says so (the Note `held-by-hand`), but the user must undo or delete by hand to free the ports. A command "Free the ports of this run" is a later idea.
- The gravity Error `gravity-not-routed` shows only through `scene.planRoute`, because the type list of the dialog leaves gravity types out.
- The whole export JSON is not byte-equal after Save As and Open (stamps, segments, fittings and port groups are equal). The field that differs is not found.
- The room list in the Route lines cuts a name at 20 characters (for example "10A.00.040 computer..."). A longer cut or the number only would help.
- Two rooms with the same name give lines that look alike. The room number is now in the line.
- The Undo rail button is covered by the backdrop of the Route dialog (`mep-modal-backdrop--route`). The user must close the dialog first.
- The pending line "Calculating the route…" shows while the debounce waits, but the plan itself runs on the main thread (about 150 ms on the first floor). A worker is not needed now.
- Dark mode: the app has no dark theme, so the dark state of the Route section was not checked.
- The Route lines have no screenshot for the failed Place (`route-build-failed`).
