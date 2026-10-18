# R5 small fixes (low items open at the end of R5)

Origin: `auto-routing-r5.md`, list "Open at the end of R5". The medium item (EN 1505 side list) is in that plan and needs a decision of the user.

- Total flow can count a capacity twice when the start stamp has its own capacity (`sizing-network.ts:207`, `flow.ts:49-55`).
- The free series has a 70 mm minimum and a hidden 1250 mm cap (`sizing-air.ts:84-85`).
- `withCleanSizing` does not check `sizingMethod` (`project.ts:449-458`).
- DN is used as the inner diameter, and the DN list stops at DN300.
- Water is fixed at 20 C with one roughness.
- "Use suggested values" for water clears a saved delta T (plan D-R5-05 says the field stays empty).
- An empty delta T field has no red border when `no-delta-t` shows.
- `setNetworkSizing(undefined)` on a pair with no entry marks the document dirty.
- Capacity writes are not undoable, and `setTerminalCapacity` and `setCapacityForSelection` may not call `markDirty`.
- The Auto-place "kept the unit" line (`ap-unit-note`) is not checked through the real DOM.
- Limits are not copied on paste or duplicate.
- R6 needs a saved network entry for its start pair.
- The T22 "Use suggested values" and limits screens: three screenshot files had identical sizes (maybe the same state).
- The sources for EN 1506, EN 1505, the water limits, EN 806-3 and EN 12056-2 are not verified.
- The capacity conversion skips mixed-type stamps.
