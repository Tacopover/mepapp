# Prompt: routing to the placed stamps — R2, which network (systems)

Written 2026-10-16, after part 1 of `auto-routing.md` (routing targets on stamps, P0 to P6). Start a new session with:

> Read `.claude/plans/auto-routing-r2-prompt.md` on branch `worktree-auto-routing` and do it.

---

## Where the thread is

The user wants the stamps that Auto-place puts into rooms to connect into networks automatically. `auto-routing.md` §8 has a road map with the parts R2 to R8. Each part gets its own plan.

Part 1 is done on branch `worktree-auto-routing` (36af8b5, pushed, not merged; the user tests it on Windows). Part 1 gives each port of a placed stamp a **routing target**: the network type that routing must connect to the port (`PlacedStamp.routingTargets`, port id → network type id). The placement rule owns the value. The user can also set it by hand in Properties. An **open port** is a port with a routing target and no segment. The drawing shows a dot on each open port, and the status bar counts them.

Part 1 stores only the type, for example "Supply Air". A building can have more than one supply air network, for example one for each air handling unit, for each wing, or for each shaft. **R2 decides which network serves each port.** The plan calls such a network a **system**: one network of one type, for example "Supply Air 1" of one air handling unit. `auto-routing.md` §5, answer 11 says: "a system can later refine a routing target, for example with `routingSystemIds` on the stamp or a map from rooms to systems." The place of a room (floor, wing, zone) sets its system, not its room type (`auto-routing.md` §3.1).

R2 from the road map (`auto-routing.md` §8):
- Exists: network types per drawing; networks that MepApp calculates from the segments (`computeNetworks`), never stored; `.claude/plans/networks-panel-spec.md`.
- Missing: a stored system (name, network type, start point, the rooms or zone that it serves); a way to give a system to a port (by the room of the stamp).
- Open questions: does the user draw zones, or pick rooms? Is a floor (a page) a zone? Can a system serve more than one page (a riser)? Is a system a copy of a network type ("Supply Air 2", as `duplicateNetworkType` does today) or a new entity with a type?
- Research: how Revit (systems), MagiCAD and the old MEPSketcher assign terminals to systems; the Networks panel spec.

R3 (a start point for each network) and R7 (electrical circuits: which panel serves which rooms) touch the same question. The plan of R2 must say where R2 stops and R3 starts.

## Rules of the user that apply

- **The segment defines the network type of a port** (memory `feedback-segment-defines-port-network-type`). The user, 2026-10-15: "a stamp's port should not be part of any network type by default. They are assigned to a network type only when connected to a segment. The segment defines the network type for the port." The plan must say if the same is true for the system of a port.
- **The cascade invariant** (memory `feedback-network-type-cascade-invariant`): a change of the Network Type always changes the whole connected run, never only the selected segments. A system on segments must follow the same rule.
- **Reuse before new** (memory `feedback-reuse-existing-mechanisms-before-designing-new`): look for a model that MepApp already has before you design new state. Candidates are below.
- **The adoption trap** (memory `network-type-adoption-gotcha`): a drawing must adopt a network type before segments use it. Part 1 added `adoptNetworkTypes` for this.
- **Real DOM checks** (memory `feedback-verify-ui-wiring-via-real-dom-not-scene-api`): a browser check drives the real inputs, not only the scene API.

## What exists now (checked 2026-10-16 at 36af8b5)

Networks:
- `packages/core/src/network.ts:1`–`:8`: MepApp calculates the network of an element from the graph on each call and never stores it. The old app stored a `NetworkId` and needed a service to find drift.
- `network.ts:22` `NetworkType {id, name, discipline, units, defaultCapacity, color, lineWidthPt, linePattern}`. `:48` `Segment {pageIndex, networkTypeId, …}`. `:82` `PortGroup`. `:93` `Network {id, networkTypeId, segmentIds, fittingIds}`: its id is stable only within one call. `:147` `computeNetworks`.
- `packages/render/src/scene.ts:2401` `duplicateNetworkType`: a copy "<name>_copy" with a random id that only this drawing has. Segments keep the original type.
- `scene.ts:1418` `setNetworkTypeForSegmentsNetworks`: the cascade. `:4396` `applyConnectivityCascade`. `:1479` `getNetworkSummaries`. `:2358` `adoptNetworkTypes`.
- `packages/ui/src/components/NetworkTreePanel.tsx`; `.claude/plans/networks-panel-spec.md` (a future tree: discipline → network → elements; inline rename of a network).

Part 1 (routing targets):
- `packages/core/src/stamp.ts:27` `autoPlaced {ruleId, roomId, moved, roomKey}`; `:33` `routingTargets`; `:37` `routingTargetOf`; `:54` `remapRoutingTargets`.
- `packages/core/src/rooms/placement-rule.ts:80` `PlacementRule`; `:111` `routingTarget`; `:117` `portRoutingTargets`; `:122` `networkTypeCopies`; `:126` `NEED_ROUTING_TARGET_DEFAULTS`.
- `scene.ts:590` `AutoPlaceGroup`; `:2755` `autoPlaceStamps`; `:2880` `setRoutingTarget`; `:2339` `activateRoutingTargetOf` (the segment tool takes the routing target of the start port); `:2255` `openPorts`; `:452` `DrawingSummary.openPorts`.
- `packages/ui/src/components/autoPlacePlan.ts:64` `groupsOf`; `RoutingSection.tsx` (Properties); `RuleRoutingSection.tsx` (step 1 of the rule guide).

Rooms, pages and drawings:
- `packages/core/src/rooms/room.ts:15` `Room {id, pageIndex, polygon, name, number, details, properties, roomTypeId, …}`. `details` holds other label lines, for example the function group. `properties` holds the custom properties of the Room tab.
- `packages/core/src/rooms/room-type.ts:164` Corridor and `:176` Shaft are room types.
- `packages/core/src/project.ts:20` `CURRENT_SCHEMA_VERSION = 18`; `:22` `ProjectDocument` (rooms, segments and calibrations per page). It has no system and no zone.
- `scene.ts:624` `documents`: each open PDF file is one document with its own `ProjectDocument`. MepApp has no project level above the documents. So today nothing can hold a system that serves floors in 2 PDF files.
- A search for "zone", "riser" and "storey" in core, render and ui finds no model.

Precedents that you can reuse:
- `packages/core/src/circuit.ts:72` `Panel`: a stored entity on top of an equipment stamp (`equipmentStampId`), with a name and defaults for its circuits.
- `circuit.ts:9` `Circuit.terminalIds`: a stored membership, the opposite of `computeNetworks`.
- `packages/core/src/flow.ts:22` `rootElementId` and `:55` `solveFlow`: the flow solve starts at a root element, or at an equipment stamp.
- The old app: `/root/MepSketcher/MepSketcherTools/MEP/Network.cs:37` `Network` has `MainEquipment`, `Direction` (Supply, Return) and `NetworkType`. A search for "SystemName" and "SystemId" in the old app found no system entity.

Known problems (`auto-routing.md` §7, not fixed):
- `computeNetworks` joins grouped ports into one node. So the supply and return ducts of an air handling unit with a port group become one network with the type of its first segment.
- The segment tool can make a run with more than one network type.
- Paste does not copy the port groups and `terminalCapacities`.

## Task

1. **Branch.**
   - If the user reports problems from the Windows test of part 1, fix them first on `worktree-auto-routing`. Mark each fix in `auto-routing.md`.
   - Then make the R2 branch. If `origin/master` contains 36af8b5, make the new worktree branch from `origin/master`. Else make it from `origin/worktree-auto-routing`, and first merge `origin/master` into it if master has newer commits. On 2026-10-16, `origin/master` was 4c31201 and did not contain part 1.
   - Run `pnpm install` and `pnpm build` at the root.
2. **Read.** `auto-routing.md` (all: the terms, §3.1, §5 answer 11, §7, §8, §11), `networks-panel-spec.md`, `electrical-circuits-model.md` (Panel and Circuit), and the memory files above.
3. **Research.**
   - Revit: system classification, system type and system name. How does a terminal join a duct system or a piping system? What happens when 2 systems connect?
   - MagiCAD: how it assigns terminals to systems, and the system of a riser.
   - The old MEPSketcher (`Network.cs`, `MainEquipment`).
   - Write the sources and what each one does. Give only what MepApp can use.
4. **Assess.** List each place that must read, write, keep or show a system: `computeNetworks`, the cascade, the segment tool (`activateRoutingTargetOf`), Auto-place (`groupsOf`, `autoPlaceStamps`), the rule guide, Properties (`RoutingSection`), the open-port dots and the status bar count, Replace stamp, the edit of a definition, copy and paste (also into another drawing), undo, save and load, the PDF export and import, `getNetworkSummaries` and `NetworkTreePanel`, the flow solve, and circuits and panels.
5. **Compare.**
   - The entity: (a) a copy of a network type ("Supply Air 2"); (b) a new stored entity with a network type, a name, and the rooms or zone that it serves; (c) a name on a calculated network, found by its start point. Say how each one fits the rule "the segment defines the network type of a port", and the cascade invariant.
   - The assignment: how a port gets its system. Options: by the room of the stamp (`autoPlaced.roomId`, or the room under a stamp placed by hand); by a zone that the user draws; by rooms that the user picks; by a room property; by the rule; by hand in Properties.
   - Test each option against real cases:
     - One floor with 2 air handling units, each for one wing.
     - Each floor (page) with its own air handling unit.
     - One shaft that serves 4 floors: 4 pages of one PDF, or 4 PDF files.
     - Toilet exhaust with its own roof fan, and office return air to the air handling unit.
     - The supply and the return of one air handling unit (one system with 2 network types, or 2 linked systems?).
     - A fan coil unit with heating water and chilled water from 2 plants.
     - Electrical panels for each wing (R7 asks the same question).
     - A drawing with one air handling unit: the user must not see more work than today.
   - Recommend one entity and one assignment.
6. **Propose the data model.** Write the TypeScript types: the system, the link from a port or a room to a system, where MepApp stores it (the drawing, the user library, or a new project level), and the migration (schema 19, if needed). Say how a system relates to `routingTargets` and to the network type of a segment.
7. **Answer the open questions** below. Give one recommendation for each, with the reason.
8. **Mockup.** Make an HTML mockup in `.claude/plans/auto-routing-r2-mockup/`:
   - The place where the user makes a system and gives it rooms or a zone.
   - How the drawing shows which system serves a room or an open port.
   - Properties of a placed stamp with the system of each port.
   - The network tree or status bar view of open ports by system, if the plan recommends one.
   - Check the mockup in Playwright (real typing, 400 px width, dark theme, no page errors). Publish it as an artifact.
9. **Plan.** Write `.claude/plans/auto-routing-r2.md`: the research, the assessment, the comparison, the model, the answers, the mockup link, the phases, and what R2 leaves to R3 and R7. Add a link to it in `auto-routing.md` §8 R2. Commit and push the branch. Copy the plan to the hub as `/taco/notes/Obsidian Vault/Project Docs/MepApp/Specs/auto-routing-r2.md`, and check the copy with `cmp`. The user reads the plan on the phone.
10. **Stop.** Ask the user to choose the entity and the assignment, and to accept the model and a layout of the mockup. Do not change product code before the user answers.
11. After the answer: do the phases one by one. Each phase ends with the core tests, the UI tests, `pnpm build`, and a browser check through real DOM inputs. Mark each phase done in the plan with its commit hash, and copy the plan to the hub again.

## Open questions

1. **The entity.** A copy of a network type, a new entity with a type, or a name on a calculated network?
2. **The assignment.** Does the user draw zones, pick rooms, or use a room property? Is a floor (a page) a zone by default?
3. **More than one page or drawing.** Can a system serve more than one page (a riser)? More than one PDF file? Where does MepApp store a system that serves 2 PDF files?
4. **Segments.** Does the segment also define the system of a port, as it defines the network type? Does a segment store a system (`Segment.systemId`), or does MepApp calculate it from the start point? What happens when a drawn segment joins 2 systems of one network type?
5. **Start point.** Does R2 need a start point, or is that R3? Can a system exist without one? Is the `Panel` model (`equipmentStampId`) the right precedent?
6. **Supply and return.** Is "Air handling unit 1" one system with Supply Air and Return Air, or 2 systems? How does this relate to port groups and to the `computeNetworks` problem in §7?
7. **The default.** With one air handling unit, does the user see any new step? Is there one implicit system for each network type until the user makes a second one?
8. **Auto-place.** Does the rule, the room, or the zone give the system? What happens to the placed stamps when the user changes the system of a room or a zone: the unmoved stamps, and the moved stamps?
9. **Stamps placed by hand.** Does a stamp get the system of the room under it? What happens when the user moves it into a room of another system?
10. **Display.** Does the open-port dot or the status bar count show the system? Does the network tree list the systems? Does the drawing color the rooms by system?
11. **Electrical.** Can the same model say which panel serves which rooms (R7)? If not, say why.
12. **Edits.** Copy and paste into another drawing, Replace stamp, the edit of a definition, undo: what happens to the system?

## Rules

- Classify first. For a question, answer and change nothing.
- Work on your branch. Never push to master. Push the branch only.
- Write user prose in STE (ASD-STE100 style).
- Evidence before claims: run the command and read its output before you say "done" or "passing".
- Scope lock: no changes outside the task. Mention other problems instead. Do not do the items of `room-type-calculations-small-fixes.md`: the user wants them later.
- No `pnpm add`. No `window.confirm` in the ui package. Never run prettier.
- Stop servers with TaskStop, never `pkill -f vite`.
- No chained or heredoc Bash commands: write scripts to the scratchpad and run them.
- Browser checks: keep one Chromium page with a PDF open at a time (the container has 3.9 GB). `apps/web` uses the `dist` of `@mepapp/ui`, so rebuild it after a UI change.
- Commit the plan files to git. Copy each changed plan to the hub.
