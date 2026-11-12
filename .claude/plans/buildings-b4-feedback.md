# B4 feedback round 1 (Windows test, 2026-11-12)

The user tested B4 on Windows with `buildings-b4-test.md`. These items came out of the test.

| Task | Item | Kind | Notes |
|---|---|---|---|
| B4-F1 | A PDF that was saved as a copy ("Save As") and assigned to the same level cannot be removed from the level, for the first PDF. | bug | Likely a sheet match problem: both files carry the same sheet id or the same name and size. Find the cause first (`findSheets`, `sheetRemovalBlock`, remove path in `buildingController`). Core and ui. |
| B4-F2 | The riser ring on the level above must be selectable. Right-click "Draw from" on the ring turns the ring into a riser fitting (attach as a member) and starts a segment from it. | feature | Render: ring hit test and selection. Ui: menu entry on a ring. It uses `makeRiser`-free path: create the fitting at the anchor and call `attachMember`. No new dialog. |
| B4-F3 | "Draw from" on any fitting: the new segment inherits the network type of the fitting (or of its connected segment). For a ring fitting this is the type of the riser. Fix at the common level, not only for risers. | change of default behaviour | Render drawing tool or ui menu handler. A no-flag check is needed: this changes plain behaviour on purpose (the user asked). Domain rule: a connected run has one network type. |
| B4-F4 | Scale change on a level that shares a riser. The T07a conflict dialog (three buttons) moves the riser. Replace by: 1 Cancel the scale change. 2 Set the PDFs that this riser touches to the same new scale. 3 Disconnect the risers and reset the fittings to normal fittings. Different scales across PDFs that share a riser must not be possible. | new dialog | Needs the wireframe on the dashboard first. Option 2 for a closed PDF needs a way to change its scale later: a new pending op kind in the building file would change the data model. Decision D-B-64 asks the user. |

Order: F1, F3, F2 (F2 uses F3), then F4 after the decision.
