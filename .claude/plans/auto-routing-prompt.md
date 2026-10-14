# Prompt: routing to the placed stamps — first, network types on stamps

Written 2026-10-14, after review round 1 of `room-type-calculations.md`. Start a new session with:

> Read `.claude/plans/auto-routing-prompt.md` on branch `worktree-room-type-calculations` and do it.

---

## The idea (the user, 2026-10-14)

> "So we finished this part of the automation and we can now move to the other part of automating MEP design and that is the creation of networks and with that segments. So the stamps that were placed automatically connect into a network. For this we will need some prerequisites and one of them is that stamps need to be associated with a network type. That way these grouped stamps can be used to automate routing to them. My first hunch on how to solve this is by adding a network type to the room types. So a user can specify a network type per room type, but this should be optional as not all stamps will be connected in a network."

The answer of the user to the reply of the last session (below):

> "yes your additional prerequisites are all spot on. Let's gather all this information to create a prompt that we can use in a new session to create a plan for implementing this. Starting with adding the network type to the demand of the room type or to the rule so it can be added to the stamps upon placement."

So the plan covers the whole routing thread as a road map. It gives the details of the first part only: MepApp writes a network type onto each stamp when it places the stamp. **The user did not choose between "the demand of the room type" and "the rule".** The plan compares the two and recommends one.

## The reply of the last session

- Routing must know which network each stamp joins. Really each port: one stamp can have 2 ports on 2 networks. The network type must be optional, because not all stamps join a drawn network.
- One network type per room type does not work. A room type has many needs, and each need goes to a different network. An office has supply air, return air, light, sockets and heating.
- The last session recommended the **placement rule**: a "Network type" choice with a default from the need. The rule writes the network type onto each placed stamp, the same way as "Write capacity". The reasons:
  - The network type follows the stamp and its system, not the room. A supply air grille in an office and one in a meeting room join the same network.
  - The rule knows the stamp. So it can give a network type to each port of a stamp with 2 ports, for example a fan coil unit (supply air + return air, or heating water + chilled water).
  - The user makes the choice once per rule, not once in each room type (the examples have about 20 room types).
  - A rule already has a room-type filter (`roomTypeIds`). So a toilet exhaust rule can give "Exhaust Air" and an office return air rule can give "Return Air". Both rules serve the need "Return air".
- The other side, for a fair comparison: the demand of a room type can say "the air of this room goes to Exhaust Air". This is a property of the room: in practice, toilet air goes out of the building, not back to the air handling unit. Then one "Return air" rule can serve offices and toilets, and the room type chooses the network. A mix is possible too: the rule sets the network type, and the demand of a room type can change it.
- The prerequisites for routing. The user said that they are "all spot on":
  1. The network type of each port (the first part, this plan).
  2. **Which network, not only which type.** A building can have more than one supply air network, for example one per air handling unit or per shaft. The place of the room (floor, wing, zone) sets which network serves it, not its room type.
  3. **A start point for each network:** an equipment stamp (air handling unit, riser, shaft), or the point where the main duct or pipe comes onto the floor.
  4. **Where a duct or pipe may go:** usually mains in the corridors and branches into the rooms. Room detection already finds the rooms and the walls.
  5. **Sizing:** auto-place writes the capacity of each stamp, and the flow solve adds the capacities along the segments. Correction to the reply: MepApp does not choose a duct or pipe size from a flow today (`flow.ts`: "There is no pressure drop, velocity, or duct/pipe sizing computed anywhere here").
  6. **The shape of the network:** a tree, with a main and a branch to each room.
  7. **Electrical works differently.** Sockets and luminaires go into circuits (`Circuit.terminalIds`), not into drawn segments. Grouping stamps into circuits is a separate automation.
  8. **A known trap:** a drawing must adopt a network type before segments use it. Otherwise MepApp silently shows the default look ([[network-type-adoption-gotcha]]).

## What exists now (checked 2026-10-14 at 3f66722)

Stamps and ports:
- `packages/core/src/stamp.ts:8` `PlacedStamp`: `ports: PortSpec[]` (a copy for each placed stamp), `definitionId`, `properties`, `color`, `autoPlaced {ruleId, roomId, moved, roomKey}`. It has no network type.
- `packages/core/src/geometry.ts:256` `PortSpec {id, name, fractionX, fractionY}`. It has no network type.
- `stamp.ts:44` and `:64` `getStampPorts`: a stamp without its own ports gets one synthetic port `__center__`. This port is not in `stamp.ports`. 63 of the 167 library stamps have `ports: []`.
- `packages/core/src/stamp-library.ts:16` `StampDefinition`: `discipline`, `category`, `ports`, `definitionPortGroups`. It has no network type. The discipline does not tell the network: the library stamp `ventilation-grille-rh-supply` has the discipline `heatingAndCooling`.
- `packages/render/src/scene.ts` copies the ports of the definition into a placed stamp at `:2508` (the stamp tool) and `:2633` (`autoPlaceStamps`). It changes them at `:2400` (`applyDefinitionToPlacedStamps`: an edit of the definition puts a new copy of its ports on each placed stamp, so a field on the `PortSpec` copy is lost there) and `:2424`–`:2430` (Replace stamp maps the ports by place with `matchPortsByLocation`, `stamp.ts:81`). A network type of a port must survive each of these, and copy and paste.

Networks:
- `packages/core/src/network.ts:22` `NetworkType`, `:44` `ConnectionPoint` (a fitting, or `{kind: 'port', elementId, portId}`), `:48` `Segment.networkTypeId`, `:82` `PortGroup`, `:147` `computeNetworks`. The header comment says that MepApp calculates the network of an element from the graph on each call and never stores it on the element. A network type on a port is a different thing: it is the network that the port must join. The plan must say how it relates to the type of a segment that connects to the port.
- Memory [[feedback-network-type-cascade-invariant]]: a change of the Network Type always changes the whole connected run, never only the selected segments.
- `packages/core/src/network-type-library.ts:10` `NETWORK_TYPE_LIBRARY` has 14 types: supply-air, return-air, exhaust-air, chilled-water, heating-water, domestic-cold-water, domestic-hot-water, sanitary-waste, conduit, cable-tray, branch-circuit, feeder, wet-standpipe, dry-standpipe.
- Network types have no user library. Each drawing adopts a copy (`ProjectDocument.networkTypes`; `scene.ts:2244` `setActiveNetworkType`, `:2262` `updateNetworkType`). `duplicateNetworkType` (`scene.ts:2277`) makes a type with a random id that only this drawing has.

Placement:
- `packages/core/src/rooms/placement-rule.ts:79` `PlacementRule`: `needId`, `stampDefinitionId`, `roomTypeIds`, `nameContains`, `writeCapacity` and more. The rules are in the user library in the browser (`mepapp.placementRules.v1`), not in the drawing.
- `packages/core/src/rooms/room-type.ts:21` `RoomDemand {terms, minimum, workingPlaneM}`; `RoomDemands` holds one demand per need id. The room types are in the user library (`mepapp.roomTypes.v1`). The drawing keeps a copy of each room type that it uses (`ProjectDocument.roomTypes`; the copy is made at `scene.ts:2931`).
- `packages/core/src/rooms/room-need.ts:25` `BUILT_IN_NEEDS`: light, supplyAir, returnAir, heating, cooling, sockets. Own needs: `mepapp.roomNeeds.v1` and `ProjectDocument.roomNeeds`.
- `packages/ui/src/components/autoPlacePlan.ts:47` `groupsOf` puts the capacity on each planned stamp when `rule.writeCapacity` is on. `scene.ts:563` `AutoPlaceGroup` carries it, and `scene.ts:2613` `autoPlaceStamps` writes it to `doc.terminalCapacities`. A network type can take the same path.
- `packages/ui/src/components/PlacementRuleGuide.tsx:86` `STEP_TITLES`: Stamp, Rooms, Count, Spacing, Layout, Check and place. "Write capacity" is in step 3 (`:991`).
- `packages/core/src/project.ts:20` `CURRENT_SCHEMA_VERSION = 17`.

Flow and electrical:
- `packages/core/src/flow.ts` `solveFlow` adds the capacities of the terminals (numbers without a unit) toward a root: `rootElementId`, or an equipment stamp found through `elementCategories`.
- `packages/core/src/circuit.ts:9` `Circuit` (`terminalIds`, `panelId`). `computeCircuitCapacity` uses `terminalCapacities`.

Where ducts and pipes can go:
- Room detection finds door swing arcs only to remove them (`packages/core/src/rooms/types.ts:71`–`:74`). It keeps no door positions. `room-auto-placement.md` Phase 7 "Doors and windows (separate investigation)" is not started.
- A search for "autoroute", "AutoRouting" and "RoutingService" in the old app (`/root/MepSketcher`) found nothing.
- `.claude/plans/networks-panel-spec.md` is the spec of a future Networks panel (a tree: discipline → network → elements).

## Task

1. **Branch.** The work builds on the needs and rules of `worktree-room-type-calculations`. That branch is NOT merged: on 2026-10-14 it had 19 commits more than `origin/master` 4c31201. If `origin/master` contains `3f66722`, make the new worktree branch from `origin/master`. Else make it from `origin/worktree-room-type-calculations`, and first merge `origin/master` into it if master has newer commits. Run `pnpm install` and `pnpm build` at the root.
2. **Assess.** List each place that reads or copies `PlacedStamp.ports`, `PortSpec`, `getStampPorts`, `Segment.networkTypeId` or `networkTypes`: the stamp tool, auto-place, Replace stamp, the edit of a definition, copy and paste, undo, save and load, the PDF export and import, the Properties panel, the port-group picker, the flow solve, the network tree panel. For each place, say if it must read, keep or show the network type of a port.
3. **Compare the owner** of the network type: (a) the rule, (b) the demand of a room type, (c) both, and then which one wins. Test the arguments above against real cases: a fan coil unit with 2 ports, toilet exhaust against office return air, radiators for Heating, sockets. Recommend one.
4. **Propose the data model.** Write the TypeScript types:
   - The stamp side. Options: a map from port id to network type id on `PlacedStamp`, a field on the `PortSpec` copy of the stamp, or one value for the stamp. The synthetic port `__center__` must work.
   - The owner side (rule, demand, or both).
   - Maybe a default for each port on `StampDefinition`.
   - The migration: the drawing (schema 18, if needed), the rules in the user library, `PLACEMENT_RULE_EXAMPLES`, and the room types if they get a field.
5. **Answer the open questions** below. Give one recommendation for each, with the reason.
6. **Mockup.** Make an HTML mockup in `.claude/plans/auto-routing-mockup/`:
   - The network type choice in the place that the plan recommends (a step of the rule guide, or the Room types card).
   - A stamp with 2 ports, each with its own network type.
   - The Properties panel of a placed stamp with the network type of each port.
   - How the drawing shows a port that has a network type and no segment yet.
   - Check the mockup in Playwright (real typing, 400 px width, dark theme, no page errors). Publish it as an artifact.
7. **Road map.** Write a section with draft phases for prerequisites 2 to 8. For each: what exists, what is missing, the open questions, and the research that it needs. Give no detailed design: each later phase gets its own plan.
8. **Plan.** Write `.claude/plans/auto-routing.md`: the assessment, the comparison, the model, the answers, the mockup link, the phases of the first part, and the road map. Commit it and push the branch.
9. **Stop.** Ask the user to choose the owner of the network type, and to accept the model and a layout of the mockup. Do not change product code before the user answers.
10. After the answer: finish the phases of the first part and do them one by one. Each phase ends with the core tests, a rebuild of `@mepapp/ui`, and a browser check through real DOM inputs. Mark each phase done in the plan with its commit hash.

## Open questions

1. **The owner.** The rule, the demand of a room type, or both? If both, which one wins?
2. **Defaults.** Does each need give a default network type? For example: Supply air → Supply Air, Return air → Return Air, Heating → Heating Water, Cooling → Chilled Water, Light, Sockets and own needs → none. Can an own need get a default?
3. **More ports.** How does the user give a network type to each port of a stamp with 2 or more ports? What happens with port groups (`definitionPortGroups`: the supply port and the return port of an air handling unit are separate groups)?
4. **The stamp definition.** Does a definition get a default network type for each port (the Element Editor for custom stamps, the generator for library stamps)? If yes, does the rule change it?
5. **Stamps placed by hand.** Can the user set or change the network type of a port in Properties? Does a change set `autoPlaced.moved` (`markAutoPlacedMoved`)?
6. **Segments.** A segment of type A connects to a port of type B: what happens? A warning, the segment takes type B, or nothing? Does the segment tool take the network type of the port where the user starts to draw? Keep the cascade invariant.
7. **Drawings and libraries.** A rule or a room type in the user library names a network type id. What happens in a drawing that did not adopt the type (adopt it at placement, see the trap)? What happens with a type from `duplicateNetworkType` (random id) that the other drawing does not have?
8. **A second run of Auto-place.** The user changes the network type of a rule. What happens to the stamps that the rule placed before: the unmoved stamps (a re-run replaces them) and the moved stamps?
9. **Display.** Does the drawing show the network type of a port, for example a dot in the color of the network type? Does the network tree panel list the stamps that wait for routing, grouped by network type?
10. **Electrical.** Do Light and Sockets get "none", or a network type such as Branch Circuit? Circuits are a separate automation: say how this choice affects it later.
11. **Which network** (prerequisite 2). Is it part of the first part, or of the next one? For example, a later "system" (Supply Air 1, Supply Air 2) with a start point and its rooms.

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
- Commit the plan files to git.
