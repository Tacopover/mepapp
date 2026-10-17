# R3 plan: the start point, a clean network and a sure root

**Status: DONE 2026-10-17 (on branch `worktree-agent-framework`, not merged; the user tests on Windows first).** R3 stores nothing; the schema stays at 18.

| Task | Commit | Verification |
|---|---|---|
| T00 rule 2 in `rules.md` (director) | `b41d6a4` | user decision D-R3-01 A |
| T01 a port group keeps networks of different types apart | `8d70a32` | core 955 tests (8 new) |
| T02 exact flow root and `rootPortId` | `3c5aaec` | core 963 tests (8 new) |
| T03 `segmentIdsOfNetworks` | `f805b2f` | core 969 tests (6 new) |
| T04 old v18 file with a mixed group | `ac094ea` | core 974 tests: no schema step, one network becomes two |
| T05a `checkRouteStart` | `4416a59` | core 984 tests |
| T05b group, second equipment and order tests | `a13b39e` | core 993 tests |
| T06a scene cascade uses the helper; `setPortGroup` refresh | `fa3d94f` | proven by T06b |
| T06b `r3-lib.mjs`, cascade browser check | `3887d54` | browser check 18 of 18 (rerun by the director) |
| T07 `getConnectivity()` | `33eca7a` | browser check 7 of 7 |
| T08 consumers, group toggle, paste | `3e2e891` | browser check 19 of 19 (rerun by the director) |
| T09 check lines and texts (en, nl) | `766cec6` | UI 194 tests |
| T10 check block in the dialog | `e5a5c8a` | browser check 22 of 22 (en), 9 of 9 (nl) |
| T11 hints of linked ports | `63bfba3` | browser check 5 of 5 |
| T12 part check | `c8a90ad` | `r3-check.mjs` 44 of 44 and 7 of 7 (rerun by the director); `r2-check.mjs` 66 of 66 and 10 of 10; forced fresh typecheck 17 of 17 and build 9 of 9, 0 cached |
| T13 severity label on each check line; comment wording | `71156cd` | UI 195 tests; `t10` 23 of 23 and 9 of 9; `r3-check` 44 of 44 and 7 of 7 |

Open at the end of R3:
- **Q-R3-01 (open, user):** the segment tool does not stop a segment of another type on a shared port or fitting. R3 keeps option A (no change; R6 refuses to route into it). `rules.md` rule 2 names this "Known hole".
- **F-R3-01:** the clipboard loses a port group on paste (measured: same drawing 2 to 4 networks; other drawing 2 networks). Not fixed.
- Water: a port group over the flow and return ports of one water type still joins both pipes (one network type for both pipes). The pipe side is an R6 question (Q-R2-02). Q-R2-01 (a source or load role on a stamp): no field, R3 uses the category `equipment`.
- The Element Editor hint is not verified (the Linked Ports section did not show for the library unit).
- The Dutch wording needs a Dutch speaker. The Dutch dialog mixes English network type names with Dutch air words.
- Older than R3: the status bar says "0 selected" while a segment is selected; the Properties header shows an internal id; the status bar wraps at 400 px.
- Provisional choices: P-R3-00 to P-R3-08 (see section 0 and the ledger).


Status: written 2026-10-17 by the road map planner. Revised in round 1 of 2 after the audit and the domain check (items A1 to A11, M1 to M9).
Origin: `roadmap-overview.md` (sections 0 to 5, R3), `auto-routing-r2.md` (what R2 built), `auto-routing.md` (§3.1, §5, §7, §8, §11), `.claude/roadmap/rules.md`.
Answers of the user that bind this plan (final): D-R3-01 A (the new meaning of "connected"), D-R3-02 A (the start stamp is user input and goes to `solveFlow` as `rootElementId`; nothing is stored), D-R2-02/D-R2-03 (single PDF files only; a multi-page PDF is refused), D-R5-04 (stamps with two flows are deferred), D-R6-02 A (the `routedBy` marks come in R6, not R3).
Code claims carry `path:line`. Paths start at the repository root. Line numbers are from commit `e749b07` and can move.
Read `.claude/roadmap/rules.md` first.

Terms (the terms of `roadmap-overview.md` and `auto-routing-r2.md` apply). Only the word "network" is used. New terms:
- **Group node**: the node of the connection graph that a port group makes. Its key starts with `port-group:` (`packages/core/src/network.ts:108`).
- **Start check**: a function that looks at the start stamp, the start port and the network type, and returns a list of problems. It reads data and writes nothing.
- **Error**: a start problem that R6 must refuse. **Warning**: a start problem that only informs.
- **Phase of a check**: `before` (the run has not happened: the start port has none or one segment, or many when the stamp is a shaft, a riser or a manifold) or `after` (the run has happened: the start port has one segment, or many for a branch point).
- **Port**: a connection point on a stamp. A segment ends on it.
- **Severity**: `error` (R6 must refuse), `warning` (R6 asks the user to look), `info` (a normal case that the dialog only names).

## 0. Questions, provisional choices, and what blocks

Blocking questions: none. Every data-model item of R3 is answered (D-R3-01 A, D-R3-02 A). R3 stores nothing (section 3.1).

Open questions (not blocking). R3 does not take them. R3 works without an answer (the user said: ignore non-typical situations for now).

- **Q-R3-01 [no data model, no file format; a domain rule is touched].** A segment drawn onto a port or a fitting that already has a segment of another network type: should the segment tool block it or warn? Today the draw tool gives the new segment the active type with no check (`packages/render/src/tools/drawSegmentTool.ts:124`), and `computeNetworks` then joins both segments and gives the network the type of the first segment (`packages/core/src/network.ts:159`-`:164`). Options: **A** no change in R3; R6 refuses to route into such a network. **B** block it in the draw tool. **C** warn only. **Recommendation: A.** Reason: B and C change how the user draws, and the user did not ask for it. Each option breaks no stored data and needs no schema step. Until the user answers, rule 2 has one known hole (section 4.1).

- **Q-R2-01 [data model].** Should a stamp definition get a field `role` (source or load)? Options: A no field; B a field on the stamp definition. **Recommendation: A, keep none.** Reason: the start check must find out two things: "is this stamp equipment" and "is it a likely load". The first uses `category` (`packages/core/src/stamp-library.ts:14`). The second uses the routing targets on the ports (the soft note of R2, `routePlan.ts:23`). A stored role adds a field to the stamp definition and the file format, for a case that is a warning only. What R3 does without it: a fan coil unit chosen as start stamp gets the R2 note ("It can be a load") and, when its network holds a second equipment stamp, the new warning `second-equipment`. R3 never blocks on source or load. Ask again in R6 only if the user finds that the notes are not enough.
- **Q-R2-02 [data model].** Should a water port know its pipe side (flow or return)? Today `heating-water` and `chilled-water` are one network type each (`packages/core/src/network-type-library.ts:14`-`:15`). Options: A no pipe side; B a pipe-side field on the routing target or on the network type. **Recommendation: A, keep none in R3; decide in R6, before the first water run.** What R3 does without it: the start port is chosen by the user in the dialog (`route-port`). The start check looks at the segments on that port only. It does not know if the port is a flow port or a return port. The R2 rule P-R2-01 (one target port for each multi-port stamp) stays as the only protection.

Provisional choices (easy to reverse; the director takes them without a stop).

| Id | Choice | Reason |
|---|---|---|
| P-R3-01 | Severity. Errors: `unknown-start`, `not-equipment`, `port-foreign-type`, and `port-segments` when the phase is `after` and the count is 0. Warnings: `port-segments` when the count is above 1 (both phases), and `group-same-type`. Info: `group-other-type`, `second-equipment`. The dialog shows all three kinds. The error blocks nothing in R3, because the dialog has no Route button. R6 reads `severity`. | A shaft, a riser or a manifold outlet has many segments on one port at once, and that is legal (G14 case 1). A group of two types at an air handling unit is correct behavior. Most water networks hold more than one equipment stamp. So these cases inform or warn only. |
| P-R3-05 | The three severities `error`, `warning`, `info` replace the two of the first draft. The list order is errors, warnings, info. | A third level is cheap to change. |
| P-R3-06 | The tasks T05 and T06 are split (T05a, T05b, T06a, T06b), so each job is about 150 changed lines. | A task must be one small seam. |
| P-R3-07 | No read-only hint in R3 for a group that joins runs of one type whose terminals have different routing targets (a supply grille and a return grille on one type). | The hint is optional. R6 can add it. |
| P-R3-02 | No notice when a saved file loads with a port group that joined two types and now gives two networks. The user sees the change in the Networks list and the status bar (section 3.4). | A notice needs a new dialog or status text. The change is a display change, not a data change. Add the notice later if the user wants it. |
| P-R3-03 | The start check runs in the dialog with the phase `before`. R6 runs it with `after`. | The phase is a parameter. R3 builds both. |
| P-R3-04 | The Dutch texts of the new check lines follow R2: formal "u", "aansluiting" for port (as `routePlan.ts:120`-`:125`), "netwerk" for network (the UI shows "Netwerk routeren" and "Netwerktype", `routePlan.ts:115`, `:124`), "stempel" for stamp, "toevoerlucht", "retourlucht", "afzuiglucht", "luchtbehandelingskast", and "aanvoer" and "retour" for water. Other type names stay in English. A Dutch speaker checks them. | Same open item as in R2. R3 invents no new Dutch word. |

## 1. Goal

When the user picks a start stamp, a start port and a network type in the route dialog, the dialog checks the start and says what is wrong, in words. The checks are pure core functions. The meaning of "connected" changes (D-R3-01 A): a port group joins only segments of one network type. `computeNetworks` and its five consumers follow. The flow solve finds its root by an exact element id, and can take the start port too (D-R3-02 A, G14, G15). Old saved files load with no schema step. One network can become two, and the user sees it.

Where R3 stops: the dialog still has no "Route" button (R6). Nothing calls `solveFlow` with a root from the app yet: the live overlay keeps its fallback (`packages/render/src/scene.ts:3023`-`:3027`), and R5 passes the start stamp. R3 changes no stored data, adds no segment, sizes nothing, adds no `routedBy` mark, adds no library stamp.

## 2. What exists now

| Item | Where | Use in R3 |
|---|---|---|
| `computeNetworks` joins by `nodeKeyOf`; a group node joins ports of any network type; the first segment sets the type | `packages/core/src/network.ts:102`-`:110`, `:147`-`:186` | T01 changes it. |
| `PortGroup`, `NetworkGraphInput`, `Network` | `network.ts:82`-`:99` | T01 changes the comments. |
| Existing test of a group (same type, one network) | `packages/core/src/network.test.ts:62`-`:74` | Must still pass. The helper `segment()` has a fixed type (`:4`-`:18`). |
| Root of the flow solve: `k.includes(':' + rootElementId)` and `k.startsWith('fitting:' + rootElementId)` | `packages/core/src/flow.ts:94`-`:96` | T02 replaces both (G15). |
| Fallback root order | `flow.ts:97`-`:101` | Stays for the case with no root. |
| `elementIdOf(nodeKey)` reads the element id of a port node and a group node | `flow.ts:43`-`:45` | T02 reuses it. |
| `solveFlow` builds its graph from `network.segmentIds` only | `flow.ts:56`-`:69` | With T01 each network has one type at a group node. So the solve needs no change for two networks (T04 proves it). |
| Existing `rootElementId` test | `packages/core/src/flow.test.ts:89`-`:107` | Must still pass. |
| Consumer 1: the cascade `setNetworkTypeForSegmentsNetworks` | `packages/render/src/scene.ts:1426`-`:1457` (the call is at `:1435`) | T06a uses a core helper. |
| Consumer 2: the Networks list `getNetworkSummaries` | `scene.ts:1487`-`:1514` (`:1491`) | Follows T01 with no edit. |
| Consumer 3: the status bar network count in `getDrawingSummary` | `scene.ts:2237`-`:2260` (`:2239`); shown at `packages/ui/src/components/StatusBar.tsx:87`. Only `networkCount` uses `computeNetworks`. The open ports do not: `openPorts` (`scene.ts:2263`-`:2267`) uses `openPortsOf` and do not depend on networks. | `networkCount` follows T01 with no edit. |
| Consumer 4: the live flow solve `recomputeFlow` | `scene.ts:3019`-`:3032` (`:3023`, `:3026`-`:3027`). The overlay picks results by segment id (`:3051`). | Follows T01 with no edit. Keeps the fallback root. |
| Consumer 5: `computeVisibleFittingIds` | `scene.ts:5111`-`:5126` (`:5120`) | Follows T01 with no edit. |
| The PDF sync does not call `computeNetworks` | `domainSyncEntries` at `scene.ts:4071` | No change. |
| `nodeKeyOf` is also used for geometry | `packages/core/src/connectivity.ts:47`-`:53` | Not touched. A move of a stamp still updates the geometry of every segment on its group. |
| One group of each stamp can be set by hand (`setPortGroup`); a definition can add several groups at placement | `scene.ts:2880`-`:2887`, `:2804`, `:2500`-`:2503` | The check handles the group that holds the start port (`nodeKeyOf`). |
| `setPortGroup` and the group sync `syncPortGroups` change `doc.portGroups` in place. `setPortGroup` calls `markDirty` and emits `selectionChanged`. It calls neither `syncDrawingLayer` nor `recomputeFlow`. `syncDrawingLayer` emits `drawingChanged` with the summary and calls `recomputeFlow` (`:5060`-`:5061`). | `scene.ts:2880`-`:2887`, `:2490`-`:2504`, `:5060`-`:5061` | After T01 a group change changes the network count and the flow. T06a fixes `setPortGroup`. |
| `portGroups` are not in `drawingHistory` (the history holds stamps, annotations, segments, fittings). `setPortGroup` writes `doc.portGroups` with no `Transaction`. | `scene.ts:2880`-`:2887`, `:4935`-`:4948` | A group edit has no undo (section 3.4). R3 does not change this. |
| The clipboard has no `portGroups` field. `pasteClipboard` does not copy a group. | `scene.ts:4843`-`:4853`, `:4888`-`:4959` | Finding F-R3-01 (section 9). T08 checks it. |
| The Properties hint for linked ports ("act as one connectivity node") | `packages/ui/src/components/PropertiesPanel.tsx:692`-`:695` | T11 changes the text. |
| The Element Editor hint for linked ports | `packages/ui/src/components/PortEditorParts.tsx:68`-`:71` | T11 changes the text. |
| The doc comment of `PortGroup` says the ports "are two separate groups so flow never leaks between them". The existing test shows the opposite: a segment between two grouped ports joins them (`network.test.ts:62`-`:74`). | `network.ts:76`-`:81` | The old text was wrong before R3. T01 and T11 make the text true. |
| Stamp categories: `'terminal' \| 'equipment' \| 'fitting'` | `packages/core/src/stamp-library.ts:14` | `not-equipment` text (section 3.7). |
| The network type library has `supply-air`, `return-air`, `exhaust-air`, one `chilled-water` and one `heating-water` (flow and return share the type). It has no Outdoor Air type and no separate extract type. | `packages/core/src/network-type-library.ts:11`-`:15` | Section 3.2 (M1), section 5 (G12). |
| The Networks tree keys a network row by `network:<net-N>` and expands rows by that key. It marks a unit as expanded when any network lists it. It renames by `networkTypeId`. | `packages/ui/src/components/NetworkTreePanel.tsx:105`-`:107`, `:331`-`:336`, `:373`-`:381` | Section 3.4. |
| The stamp read model for the dialog: `StampInfo` (`portSegmentTypes` keeps the first segment type of a port only) | `scene.ts:385`-`:401`, `:1210`-`:1221` | Too small for the count of segments on a port. So the check needs the segment list (T07). |
| No public read of segments, fittings and groups | `scene.ts` (only `exportProject`, `:3779`, which copies everything) | T07 adds a light read method. |
| The route dialog and its state | `packages/ui/src/components/RouteDialog.tsx:36`-`:343` | T10 adds a block. |
| R2 soft notes: `route-start-warning` (`looksLikeLoad`) and `route-port-note` | `RouteDialog.tsx:177`-`:181`, `:215`-`:222`; `routePlan.ts:23`-`:25` | Stay as they are. |
| `startCandidates` lists equipment stamps only | `routePlan.ts:15`-`:20` | So a non-equipment stamp can never be chosen in the select. T10 adds a note for a selected stamp that is not in the list. |
| `loadProject` migrates and validates; the version is 18 | `packages/core/src/project.ts:20`, `:389`-`:398` | T04 proves that an old file loads with no step. |
| The text test: each text has 140 characters or less, both languages | `packages/ui/src/routePlan.test.ts:401`-`:404` | A check line is two texts: the problem and the hint. Each is at most 140. |
| Browser helper, the R2 setup (rooms, Auto-place, an equipment stamp made from a placed stamp, the project reloaded with `loadProjectFromJson`) | `.claude/roadmap/browser/lib.mjs`, `r2-check.mjs:154`-`:182` | The model for the R3 setup. |
| Not in the library: a ventilation shaft stamp (G12) | `packages/core/src/stamp-library.generated.ts:5971`, `:6069` (two dry-riser stamps only) | R3 adds none (section 5). |

## 3. The model

### 3.1 Stored data

R3 stores nothing.
- No new field on `ProjectDocument`, `PlacedStamp`, `Segment`, `Fitting`, `NetworkType`, `PortGroup`, `Room` or `Circuit`.
- No schema step. `CURRENT_SCHEMA_VERSION` stays 18 (`project.ts:20`).
- No `localStorage` key. The dialog keeps the check result in React state.
- The start stamp is user input (D-R3-02 A). `FlowSolveInput` gets one optional input field, `rootPortId`. It is a parameter of a function, not stored data.

Proof for each task: `git diff --stat` shows no change in `packages/core/src/project.ts`, `schema.ts` or `serialize*`. The part check compares `JSON.stringify(exportProject())` before the dialog opens and after it closes, as the part check of R2 does.

Why no schema step for D-R3-01 (verified):
- A network is not saved. `ProjectDocument` has no `networks` field (`project.ts:23`-`:55`). The loader reads arrays of `segments`, `fittings` and `portGroups` only (`project.ts:351`). `Network.id` is "stable only within one computeNetworks call" (`network.ts:93`-`:95`).
- The UI keeps network ids only as keys of tree rows in memory (`packages/ui/src/components/NetworkTreePanel.tsx:105`-`:106`).
- So an old file has the same data and `computeNetworks` reads it in a new way.

### 3.2 Core: the change of `computeNetworks` (`packages/core/src/network.ts`)

New meaning of "connected" (D-R3-01 A): two segments are connected when they share a fitting or a port, or when their ports are in one port group and both segments have the same network type. The group still joins runs of one type. The group alone never joins runs of different types.

Two limits of this change (A1, A2, M1). Say them in the code comment and in the tests:
- **Air only.** The split works by network type. Air has three types (supply, return, exhaust), so a group over the supply and return ports of an air handling unit keeps the two ducts apart. For water, the flow pipe and the return pipe have the same network type (`network-type-library.ts:14`-`:15`: one `chilled-water`, one `heating-water`). A group over the flow port and the return port of one boiler still joins both pipes. R3 is not a fix for water. The pipe side is an R6 decision (Q-R2-02). T01 has a test that pins this.
- **Only the group is closed.** A fitting or a port that two segments of different types share still joins them. Example: a supply run from `ahu.out` to a fitting F, and a return run from `ahu.in` to the same F. Each group node is split by type, but both runs join F, so the result is one network with the type of the first segment (`network.ts:159`-`:164`). T01 has a test that pins this. It belongs to Q-R3-01.

How: inside `computeNetworks` only, the key of a group node gets the type of the segment at that end.

```ts
/** The key of a connection point for the union in computeNetworks. A group node is split by the network type of the segment, so a port group never joins segments of different types. */
function unionKeyOf(point: ConnectionPoint, networkTypeId: string, portGroups: PortGroup[]): string {
  const key = nodeKeyOf(point, portGroups);
  return key.startsWith('port-group:') ? `${key}@${networkTypeId}` : key;
}
```

`nodeKeyOf` stays as it is (`flow.ts` and `connectivity.ts` use it). `computeNetworks` uses `unionKeyOf` in the union loop (`:150`-`:154`) and in the lookup of the root (`:160`). The lookup of a fitting (`:170`) stays: it uses `fitting:` keys.

A new pure helper for the cascade (so the cascade can be tested in core):

```ts
/** The ids of all segments in the networks that hold any of `segmentIds`. An id that is no segment of `input` is left out. */
export function segmentIdsOfNetworks(input: NetworkGraphInput, segmentIds: readonly string[]): Set<string>;
```

Facts that make the flow solve safe with no change (T04 proves them with tests):
- A network has one type at each group node. So the solve of a network sees one segment type at a group node.
- The solve reads `network.segmentIds` only (`flow.ts:57`). The segments of the other network on the same group are not in its graph.
- The own capacity of a stamp (`ownCapacityOf`, `flow.ts:47`-`:53`) is read by element id. A unit with a capacity adds it to both of its networks. This is the same as the behavior today for one network. Not a change of R3. A rated air handling unit flow is a source rating, not a load. R5 must not add the capacity of the root stamp or of a source stamp to the root total (section 9).

How this keeps the rules of `rules.md` §3: see section 4.

### 3.3 Core: the root of the flow solve (`packages/core/src/flow.ts`)

```ts
export interface FlowSolveInput {
  // ...existing fields...
  /** The start stamp: an exact element id. Port nodes, group nodes and fitting nodes of that element can be the root. */
  rootElementId?: string;
  /** With `rootElementId`: the start port. It picks one node when the element has more than one node in the network. */
  rootPortId?: string;
}
```

Rules (each has a core test):
1. `rootElementId` matches a node when `elementIdOf(nodeKey) === rootElementId` for a port node or a group node, or `nodeKey === 'fitting:' + rootElementId` for a fitting node. There is no substring match and no prefix match (G15). The id `stamp-1` never matches `stamp-12`.
2. With `rootPortId`, the root node is `nodeKeyOf({ kind: 'port', elementId: rootElementId, portId: rootPortId }, input.portGroups)`, when the network holds that node. A port in a group gives the group node.
3. With more than one match and no `rootPortId`, the first node in sorted order wins (the order of `nodeKeys`, `flow.ts:71`). This also holds when `rootPortId` is given but its node is not in the network and other nodes of the element are (A9). A test pins it.
4. With a root that is not in the network, the solve uses the fallback of `flow.ts:97`-`:101`, as today. R5 must test if the network holds the start stamp before it relies on the root. (R3 does not change the result type.)
5. The root wins over the fallback: a start port with two segments (degree 2, G14 case 1: a legal root case for a shaft, a riser or a manifold), and a second equipment stamp in the network (G14 case 2), do not move the root. So `port-segments` with a count above 1 is a warning, not an error (P-R3-01).

### 3.4 What the user sees after the change of `computeNetworks`

A saved file where a port group joins segments of two types is today one network. After R3 it is two networks, one for each type. The segments, the fittings and the group stay as they are. The user sees:
- **Status bar** (`StatusBar.tsx:87`): "2 networks" where it said "1 network".
- **Networks list** in the Layers panel (`getNetworkSummaries`, `scene.ts:1487`): two rows, each with its type name, its segment count and its fitting count. The unit stamp is under both rows.
- **Properties, Network Type of a segment**: a change retags the network of that segment only. Before, it retagged both ducts of the unit and made them one type.
- **Fitting markers**: they show for the selected network only (`scene.ts:5111`).
- **Flow numbers**: each network has its own sums, with its own root.
- The PDF export is the same (`domainSyncEntries` reads each segment alone, `scene.ts:4071`).
- No notice shows at load (P-R3-02).
- **Row keys of the Networks list.** The list keys rows by `network:net-N` (`NetworkTreePanel.tsx:105`-`:107`). The ids `net-N` come from the order of the first segment. When one network becomes two, the ids after it shift. A row that the user expanded can then show another network as expanded. This is a display effect only. R3 does not fix it.
- **One unit in two networks.** The unit stamp is listed under both rows. When the user selects the unit, both rows expand (`NetworkTreePanel.tsx:331`-`:336`). Rename acts by `networkTypeId` (`:373`-`:381`). So a rename of one row renames the type, and the other row changes only if it has the same type. Two rows of two types rename on their own.
- **Open ports.** The open port count does not depend on networks (`openPortsOf`, `scene.ts:2263`-`:2267`). It does not change.
- **Undo.** A change of a port group has no undo. `portGroups` are not in `drawingHistory`, and `setPortGroup` uses no `Transaction` (`scene.ts:2880`-`:2887`). Only the retag of segments has undo. This is how it works before R3. R3 does not change it.

A file whose group holds segments of one type is unchanged.

A change of type can join two networks at a group: if the user sets the Return Air duct to Supply Air, both ducts now have one type, and `computeNetworks` shows one network. This is allowed by the new rule 2.

What this does not change: two segments of different types that share the same port with no group, or the same fitting, still join (the first segment wins, `network.ts:159`-`:164`). The draw tool does not prevent it (`drawSegmentTool.ts:124`). R6 refuses to route into such a network, and Q-R3-01 asks the user about the draw tool. Not verified: how often a real file has this.

**A group edit changes the numbers.** After T01, a user who checks or unchecks ports in a group in Properties changes the network count and the flow. T06a makes `setPortGroup` refresh the status bar summary and the flow. Before, it did neither.

### 3.5 Core: the start check (`packages/core/src/route-start.ts`, new)

```ts
import type { Fitting, PortGroup, Segment } from './network.js';
import type { RouteStamp } from './route-ports.js';

export type StartProblemCode =
  | 'unknown-start'       // the start stamp or the start port does not exist
  | 'not-equipment'       // the start stamp has a category other than 'equipment'
  | 'port-segments'       // before: the start port has more than one segment. after: it has none, or more than one
  | 'port-foreign-type'   // a segment on the start port has a network type other than the chosen type
  | 'group-other-type'    // a group mate of the start port has a segment of another type (the group keeps it apart)
  | 'group-same-type'     // a group mate of the start port has a segment of the chosen type (the run joins that network)
  | 'second-equipment';   // the network that the run joins holds another equipment stamp

export type StartSeverity = 'error' | 'warning' | 'info';

export interface StartProblem {
  code: StartProblemCode;
  severity: StartSeverity;
  /** port-segments: the number of segments on the start port. */
  count?: number;
  /** port-foreign-type, group-other-type: the foreign network type ids, sorted, no repeat. */
  typeIds?: string[];
  /** group-other-type, group-same-type: the group mates (port ids of the start stamp) that have such a segment, in port order. */
  portIds?: string[];
  /** second-equipment: the other equipment stamps in the network, sorted by id. */
  stampIds?: string[];
}

export interface StartCheckInput {
  stamps: readonly RouteStamp[];
  segments: readonly Segment[];
  fittings: readonly Fitting[];
  portGroups: readonly PortGroup[];
  startStampId: string;
  startPortId: string;
  networkTypeId: string;
  /** Default 'before'. */
  phase?: 'before' | 'after';
}

/** The problems of a start, errors first, then warnings, then info, each group in the order of the union above. An empty list means no problem found. */
export function checkRouteStart(input: StartCheckInput): StartProblem[];
```

Rules (each has a core test):
1. Stamp or port missing: one error `unknown-start`, and the function returns at once. The ports of a stamp come from `getStampPorts` (`__center__` for a stamp with no own port, `stamp.ts:109`). The dialog cannot produce this case: `startCandidates` lists only equipment stamps that exist (`routePlan.ts:15`-`:20`) and the port select lists the ports of the chosen stamp. The code is a guard for other callers (R6, scripts).
2. `category !== 'equipment'`: error `not-equipment`. The other checks still run. The dialog cannot produce this case from its list either (`routePlan.ts:17`). The dialog shows the `route-selection-note` for a selected stamp of another category (T10). The code is a guard for other callers. The category is `'terminal' | 'equipment' | 'fitting'` (`stamp-library.ts:14`). Only `equipment` starts a network. Not verified: the category of the library manifolds and of the fire-protection stamps (the two dry-riser stamps, `stamp-library.generated.ts:5971`, `:6069`). A manifold or a dry riser inlet with another category is blocked until the user changes its category in the Element Editor.
3. The segments on the start port are the segments with an endpoint `{ kind: 'port', elementId: startStampId, portId: startPortId }`. A segment that touches a group mate does not count here. `port-segments` with `count`: phase `before`, a count above 1 is a **warning** (a shaft, a riser or a manifold outlet can have many branches at once; G14 case 1). Phase `after`, a count of 0 is an **error** (no run happened), and a count above 1 is a **warning**. A count of 1 gives no problem.
4. A segment on the start port with a network type other than `networkTypeId` is an error `port-foreign-type`. This is rule 1 of `rules.md` §3: the segment defines the type of the port, so the dialog must not ask for another type.
5. Group mates are the other ports of the start stamp whose `nodeKeyOf` equals the `nodeKeyOf` of the start port. For each mate, the segments on it with another type give `group-other-type` (**info**: it is the correct behavior at an air handling unit; the group keeps them as another network). The segments on it with the chosen type give `group-same-type` (**warning**: the run joins that network).
6. The network that the run joins is found with `computeNetworks`. It is the network of each segment that touches the start node (the start port or a group mate) and has the chosen type. If there is none, `second-equipment` does not run. The other equipment stamps are the stamps in `stamps` with `category: 'equipment'` and an id other than `startStampId`, that appear as `port` endpoints of the segments of that network. A non-empty list gives `second-equipment` with severity **info**. Most water networks hold more equipment stamps (pumps, fan coil units, VAV boxes). The check does not claim that sums are right for loops: `solveFlow` leaves a segment that closes a loop unresolved (`flow.ts:28`, `:110`) and the check does not look for rings. A stamp that is not in `stamps` is ignored.
7. The function does not change its input (a deep-equal test).
8. The function reads no network type from a port and writes none (rule 1 of `rules.md` §3).

The R2 soft note "looks like a load" stays in the UI (`routePlan.ts:23`). It stays a note and is not a problem code, because it needs the routing targets of the chosen type and has no `after` phase. R3 does not move it. (The overview names "the stamp is not equipment/a likely load" as one start check. The likely load is the R2 note, and the not-equipment case is `not-equipment` plus the list filter. See T10.)

### 3.6 Scene: a light read (`packages/render/src/scene.ts`)

```ts
export interface ConnectivityView {
  segments: Segment[];
  fittings: Fitting[];
  portGroups: PortGroup[];
}
/** The segments, fittings and port groups of the active document. Copies of the arrays. The route dialog reads it for the start check. */
getConnectivity(): ConnectivityView;
```
Export the type from `packages/render/src/index.ts` next to `RouteMarker`.

### 3.7 UI: texts and lines (`packages/ui/src/components/routePlan.ts`)

```ts
export interface StartCheckLine {
  code: StartProblemCode;
  severity: StartSeverity;
  text: string;   // the problem, 140 characters or less
  hint: string;   // what the user does, 140 characters or less; may be an empty string
}
export function startCheckLines(
  problems: readonly StartProblem[],
  names: { type: (typeId: string) => string; stamp: (stampId: string) => string; port: (portId: string) => string },
  language: RouteLanguage,
): StartCheckLine[];
```
New keys in `RouteTextKey`, each with an English and a Dutch text: `checkUnknownStart`, `checkNotEquipment`, `checkPortSegments`, `checkPortSegmentsHint`, `checkPortForeignType`, `checkPortForeignTypeHint`, `checkGroupOtherType`, `checkGroupSameType`, `checkSecondEquipment`, `checkSecondEquipmentHint`, `selectionNotEquipment`, `selectionRiserNote`. English texts (STE). A "port" is a connection point on a stamp where a segment ends. The texts use the word "port" for it; R2 does the same.

| Key | Text |
|---|---|
| `checkUnknownStart` | "The start stamp or the start port does not exist." |
| `checkNotEquipment` | "{stamp} has a category other than equipment. Only equipment can start a network." |
| `checkPortSegments` | "The start port has {count} segments." |
| `checkPortSegmentsHint` | "Many segments are normal for a shaft, a riser or a manifold. For one run, use a port with 0 or 1." |
| `checkPortForeignType` | "The start port already has a segment of {types}." |
| `checkPortForeignTypeHint` | "The segment sets the network type. Choose that type, or use another port." |
| `checkGroupOtherType` | "{ports} is in one port group with this port. Its segment has type {types}. It stays a separate network." |
| `checkGroupSameType` | "{ports} is in one port group with this port. Its segment has the same type, so the run joins that network." |
| `checkSecondEquipment` | "The network at this port has more equipment: {stamps}." |
| `checkSecondEquipmentHint` | "This is normal for water networks. The flow sum starts at your start stamp. Check that you want one network." |
| `selectionNotEquipment` | "The selected stamp {stamp} is not equipment. Only the category equipment starts a network. Change the category in the Element Editor." |
| `selectionRiserNote` | "A riser across floors is not one start stamp yet." |

The hint of `checkPortSegments` and the `ports`/`types` parameters keep each text at 140 characters or less (T09 tests this). Show no CFM and no GPM in any R3 text (the library has CFM and GPM units, and no Outdoor Air type and no separate extract type: M8, G12).

Dutch (P-R3-04): the implementer writes them with the same rules as R2 and the words of P-R3-04. A Dutch speaker checks them. Example for `checkGroupOtherType`: "{ports} staat met deze aansluiting in één groep aansluitingen. Het segment heeft type {types}. Het blijft een apart netwerk." (not verified by a Dutch speaker.)

## 4. How R3 keeps the rules of `rules.md` §3

1. **The segment defines the network type of a port.** The start check reads segments and routing targets. It writes nothing. `port-foreign-type` enforces the rule: a segment on the start port decides the type. `computeNetworks` does not give a port a type. R3 adds no default type to any stamp.
2. **The cascade invariant.** This rule changes (D-R3-01 A). The new text is in section 4.1. The design keeps the invariant for the group case: a retag changes the whole network found with `computeNetworks`, via `segmentIdsOfNetworks` (T03, T06a). The group node is split by type, so a port group alone never produces a network with two types. A change that makes two networks one type joins them at the group, and this is correct. **The rule is not fully true yet.** A shared port or a shared fitting still joins segments of two types, and the first segment gives the network its type (`network.ts:159`-`:164`). The draw tool gives a new segment the active type with no check (`tools/drawSegmentTool.ts:124`). R3 does not close this hole. R6 refuses to route into such a network. Q-R3-01 asks the user whether the draw tool must block or warn. The paths: single select and multi select both call `setNetworkTypeForSegmentsNetworks` (`scene.ts:1412`-`:1413`, `:1426`). Bulk edit is the same Properties select (`PropertiesPanel.tsx:216`, `:352`). Import and scripts: `loadProject` does not write a type. Not verified: that no other path writes `networkTypeId` (a search for `networkTypeId:` in `packages/render/src` finds `tools/drawSegmentTool.ts:124` for a new segment, and the cascade at `scene.ts:1449`; the P6 route of `activateRoutingTargetOf` at `:2340` changes the active type only). R3 adds no per-segment field.
3. **Reuse before new.** The check reuses `computeNetworks`, `nodeKeyOf`, `getStampPorts` and `RouteStamp`. The cascade helper replaces four lines in the scene and moves the logic to core. The dialog block copies the R2 notes. No new state in the document. One new read method on the scene (T07) because the scene has none for segments. `setPortGroup` reuses `recomputeFlow` and the `drawingChanged` event (T06a).
4. **The adoption trap.** R3 writes no segment and no type. It adopts nothing. The cascade already calls `adoptNetworkTypes` (`scene.ts:1434`) and T06a keeps that call.
5. **Verify UI wiring through the real DOM.** T06b, T10, T11 and the part check change selects and check boxes and read the DOM. The scene API is for setup and for reading state only.
6. **Merge lesson.** Each task ends with `pnpm build` at the root. The change of `computeNetworks` can break a type in a consumer without a conflict marker.

### 4.1 The exact new wording of rule 2 (the director edits `rules.md` §3, T00)

Replace the text of rule 2 with:

> 2. **The cascade invariant.** A change of the network type always changes the whole connected run (found with `computeNetworks`), never only the selected segments. Two segments are *connected* when they share a fitting or a port, or when their ports are in one port group and both segments have the same network type. A port group alone never joins segments of different network types: `computeNetworks` keeps them as two networks. A change of type can join two networks at a port group, because they now have one type. That is allowed. Connected segments should have one network type, and the cascade keeps them so. This holds for each edit path: single select, multi select, bulk edit, import, scripts. Known hole: a segment drawn onto a port or a fitting that already has a segment of another type is not prevented yet. The network then takes the type of the first segment. R6 refuses to route into such a network. Before you add a new per-segment field, check if it is truly per segment or a network-level value like the network type. (Meaning of "connected" changed by the user, 2026-10-16, D-R3-01 A.)

This wording does not say "can never" because the hole stays open until the user answers Q-R3-01. If the user answers B (block), the director removes the "Known hole" sentences and restores "can never".

The text of the overview, section 2 ("Rule 2") already says that the R3 plan gives this wording. The director checks that the overview says the same about the hole.

## 5. Gap G12 (no ventilation shaft stamp in the library)

R3 adds no library stamp. A shaft is a start stamp like any other equipment stamp (overview, case f). What a user does:
1. Open the Element Editor and draw a stamp for the shaft (a box is enough).
2. Set the category to equipment.
3. Add one port on the side where the duct leaves. Do not set a network type on the port (rule 1).
4. Place the stamp in the shaft room. It then appears in the group "Likely sources" of the start select (it has no routing target on its ports).

If the user gives the stamp the category terminal or fitting, it is not in the start list. T10 shows a note when such a stamp is the selection. The same holds for a manifold or a dry riser inlet with another category (not verified: the category of library manifolds and fire-protection stamps). A riser across floors is not one start stamp (deferred, D-R2-02); the dialog note says so. The decision to add a library stamp stays open (overview G12).

Library gap (M8): `network-type-library.ts:11`-`:13` has Supply Air, Return Air and Exhaust Air. It has no Outdoor Air type and no separate extract type. A shaft that takes outdoor air or collects extract air needs a type that the library does not give. R3 adds none. No R3 text shows CFM or GPM.

## 6. The phases and the tasks

Commands (the tester runs them from the root of the worktree, one command for each call):
- Core tests: `pnpm --filter @mepapp/core test`
- UI tests: `pnpm --filter @mepapp/ui test`
- Build: `pnpm build`
- Browser check: `node .claude/roadmap/browser/with-server.mjs <work>/<name>-check.mjs`. No environment variable before the command. Screenshots go to `/tmp/mepapp-shots/` with `shot('<task id>-<name>')`.

Rules for every browser step of this part (the rules of section 5 of `auto-routing-r2.md` apply):
- Open each PDF with `openPdf('<absolute path>')`. The main PDF is `/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf`. One Chromium page at a time.
- While the route dialog is open, click only inside `.mep-modal--route`. Close it with Escape or the Close button. Do all canvas clicks before the dialog opens.
- The setup follows `r2-check.mjs:154`-`:182`: Auto-place the example supply air rule, change one placed stamp to an equipment stamp with two ports, add segments and a port group to the exported project, and reload it with `loadProjectFromJson`. The scene API is for this setup and for reading state. The wiring (selects, check boxes, buttons, the Properties Network Type select) goes through real inputs.
- No real multi-page PDF exists in the fixtures (R2 found 9 files with 1 page). R3 does not plan on one.

Phases: A the model in core (T00 to T05b), B the scene (T06a to T08), C the dialog and the texts (T09 to T11), D the part check (T12).

| Task | Title | Depends on | Files (main) |
|---|---|---|---|
| T00 | Director: edit rule 2 in `rules.md` | none | `.claude/roadmap/rules.md` |
| T01 | A port group keeps networks of different types apart | none | `network.ts`, `network.test.ts` |
| T02 | The flow root: exact element id and optional port | none | `flow.ts`, `flow.test.ts` |
| T03 | The cascade helper `segmentIdsOfNetworks` | T01 | `network.ts`, `network.test.ts` |
| T04 | Old files and the flow solve over two networks (test only) | T01, T02 | `group-networks.test.ts` (new) |
| T05a | The start check in core: code and the basic tests | T01 | `route-start.ts`, `route-start.test.ts`, `index.ts` |
| T05b | The start check: the tests of groups, equipment, order | T05a | `route-start-network.test.ts` (new) |
| T06a | The scene cascade uses the helper; `setPortGroup` refreshes the numbers | T03 | `scene.ts` |
| T06b | The shared browser setup `r3-lib.mjs` and the cascade browser check | T06a | `.claude/roadmap/browser/r3-lib.mjs` (new), work folder |
| T07 | `getConnectivity()` in the scene | T06a | `scene.ts`, `index.ts` of render |
| T08 | The consumers, the group toggle and the paste on a file with a mixed group (browser check only) | T06b | work folder |
| T09 | The check lines and texts | T05a | `routePlan.ts`, `routePlan.test.ts` |
| T10 | The check block in the route dialog | T05b, T07, T09 | `RouteDialog.tsx`, `theme.css` |
| T11 | The hints of linked ports | T06b | `PropertiesPanel.tsx`, `PortEditorParts.tsx` |
| T12 | The part check | all | `.claude/roadmap/browser/r3-check.mjs` |

No dependency: **T00, T01, T02**. T01 and T02 write different files. T03 waits for T01 (same files `network.ts`, `network.test.ts`). T05a waits for T01 because its tests use the new `computeNetworks`. T06a and T07 both edit `scene.ts`, so T07 waits for T06a. T11 waits for T06b because its check uses `buildMixedGroupProject` of `r3-lib.mjs`. T09 and T10 both touch `routePlan.ts` or the dialog in order: T09 first. T04 and T05a do not need T02.

### T00. Director: rule 2 of `rules.md`
- **Depends on:** none. The director does it, not an implementer.
- **Files:** `.claude/roadmap/rules.md` (rule 2 of section 3 only).
- **Change:** the text of section 4.1. No other line of `rules.md` changes.
- **Verify:** `git diff` shows only rule 2. Copy to the hub is not needed (`rules.md` is not a plan).
- **Order:** T00 before the merge of T01 (the rule must be true when the code changes). T00 does not block the start of T01.

### T01. A port group keeps networks of different types apart
- **Depends on:** none.
- **Files:** `packages/core/src/network.ts`, `packages/core/src/network.test.ts`.
- **Shapes:** `unionKeyOf` (section 3.2, a private function). `computeNetworks` uses it in the union loop and in the root lookup. Update the doc comments of `PortGroup` (`network.ts:76`-`:81`) and of `computeNetworks` (`:138`-`:146`) to the new meaning. Change the helper `segment()` of the test file to take an optional network type id as a fourth parameter (default `'supply-air'`).
- **Must not touch:** `nodeKeyOf`, `flow.ts`, `connectivity.ts`, the types `Network`, `Segment`, `PortGroup`.
- **Tests (core):**
  - Two segments on the group `[p-out, p-in]`, types `supply-air` and `return-air`: two networks, each with its segment and its type.
  - The same group, both `supply-air`: one network (the test at `network.test.ts:62` stays and passes).
  - Three segments: `supply-air` on `p-out`, `return-air` on `p-in`, `supply-air` on a third port `p-x` of the same group: the two `supply-air` segments are one network, the `return-air` segment is another.
  - A fitting between: `supply-air` from `ahu.p-out` to a fitting to a diffuser, and `return-air` from `ahu.p-in` to a grille. Two networks. The fitting is in the first.
  - One segment with both ends in the group (`p-out` to `p-in`) and one type: one network, no error.
  - The order of `segmentIds` inside a network follows the order of `input.segments`. The network ids are `net-0`, `net-1`, in the order of the first segment.
  - Two groups on two stamps: each splits by type on its own.
  - **Shared fitting (A1, A2).** A supply run from `ahu.out` to a fitting F, and a return run from `ahu.in` to the same F, with the group `[out, in]`: one network with the type of the first segment. The test pins the known hole of Q-R3-01 and is named so.
  - **Water (M1).** A group `[flow, return]` on a boiler, with a `heating-water` segment on each port: one network (both pipes join). The test pins that R3 does not split water, and is named so.
- **Doc comments:** the new comment of `PortGroup` says what the code does now (a segment between two grouped ports joins them when both have one type). The old text ("flow never leaks between them") was wrong before R3: `network.test.ts:62`-`:74` shows the group joined the ports. T01 makes the text true.
- **Verify:** core tests; `pnpm build` (it proves that every consumer still compiles).
- **Size:** about 30 lines of code and 90 of tests.

### T02. The flow root: exact element id and optional port
- **Depends on:** none.
- **Files:** `packages/core/src/flow.ts`, `packages/core/src/flow.test.ts`.
- **Shapes:** section 3.3. Replace `flow.ts:94`-`:96`. Add `rootPortId?: string` to `FlowSolveInput` with its doc comment. Use `elementIdOf` (`flow.ts:43`) for port nodes and group nodes, and an exact compare for fitting nodes.
- **Must not touch:** the fallback order (`flow.ts:97`-`:101`), `nodeKeyOf`, `network.ts`, the result type `FlowResult`.
- **Tests (core):**
  - G15: one network with the stamps `stamp-1` and `stamp-12` (terminal and equipment ends of two segments). `rootElementId: 'stamp-1'` roots at `stamp-1`, `rootElementId: 'stamp-12'` roots at `stamp-12`. Check with `segmentDirection` and `totalCapacity`. A second test with the fittings `fit-1` and `fit-12`.
  - G14 case 1: an air handling unit whose start port has two segments (degree 2) and loose duct ends. With `rootElementId` the unit is the root and `totalCapacity` holds the whole sum. A test without the root that shows the fallback root is different keeps the old behavior known (it must pass before and after the change; if it fails, report and do not change the fallback).
  - G14 case 2: a second equipment stamp (a fan coil unit, category `equipment` in `elementCategories`) in the same network. With the root set, the unit is the root, not the fan coil unit.
  - `rootPortId`: a stamp with two ports in the network (`fcu.in`, `fcu.out`, no group): the port picks the node. A port inside a group picks the group node.
  - A9: `rootElementId` given, `rootPortId` names a port whose node is not in the network, and other nodes of the element are in the network: the first matching node in sorted order wins (rule 3).
  - A `rootElementId` that is not in the network: the result equals the result with no root.
  - The existing test at `flow.test.ts:89`-`:107` still passes.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 30 lines of code and 100 of tests.

### T03. The cascade helper
- **Depends on:** T01.
- **Files:** `packages/core/src/network.ts`, `packages/core/src/network.test.ts`.
- **Shapes:** `segmentIdsOfNetworks(input, segmentIds): Set<string>` (section 3.2). It uses `computeNetworks`.
- **Must not touch:** `computeNetworks`, the scene.
- **Tests (core):** a seed in network A returns the segments of A only, also when A shares a group with network B of another type. Seeds in A and in B return both. Two seeds in one network return that network once. An unknown id is left out. A seed in a network with one type and a group of one type returns all segments joined through the group. The cascade over a group, as the scene does it: take the result of the helper, retag those segments to `return-air`, and call `computeNetworks` again: the old network B now has the same type and joins the first at the group (one network).
- **Verify:** core tests; `pnpm build`.
- **Size:** about 15 lines and 50 of tests.

### T04. Old files and the flow solve over two networks (test only)
- **Depends on:** T01, T02.
- **Files:** `packages/core/src/group-networks.test.ts` (new). No product code.
- **Tests (core):**
  - Build a document with `serializeProject` (the shape of `project.test.ts:27`-`:50`) that has the stamps `ahu` (ports `out`, `in`), a supply grille and a return grille, the group `[out, in]` on `ahu`, and two segments of different types (`ahu.out` to the supply grille, `ahu.in` to the return grille). Set `schemaVersion` to 18. Load it with `loadProject`.
  - `loaded.schemaVersion === 18` and `CURRENT_SCHEMA_VERSION === 18`: no step runs.
  - `nodeKeyOf` of the two ahu endpoints is equal. This pins the cause of the old result (one network).
  - `computeNetworks` of the loaded data gives two networks. Each has one segment, its own type.
  - `solveFlow` on each network with `rootElementId: 'ahu'` is `resolved`. The totals are the capacity of each grille. A segment of the other network is not in the result.
  - A save and load round trip (`serializeProject` then `loadProject`) keeps the group and the segments unchanged.
- **Verify:** core tests; `git diff --stat` shows no product file.
- **Size:** about 90 lines of tests.

### T05a. The start check in core: code and the basic tests
- **Depends on:** T01 (not T02).
- **Files:** `packages/core/src/route-start.ts` (new), `packages/core/src/route-start.test.ts` (new), `packages/core/src/index.ts` (one export line next to `route-ports.js`, `:7`).
- **Shapes:** section 3.5, rules 1 to 8, with the three severities.
- **Must not touch:** `route-ports.ts`, `network.ts`, any stored type.
- **Tests (core):** build the data in code (an air handling unit with ports `out` and `in`, grilles). Only the basic cases:
  - A clean start (no segment, a unit): no problem in `before`. In `after`: `port-segments` with `count: 0`, severity error.
  - One segment on the port: no problem in `before`, none in `after`.
  - Two segments: `port-segments` with `count: 2`, severity **warning**, in `before` and in `after` (M2).
  - A segment of `return-air` on the start port, chosen type `supply-air`: `port-foreign-type` with `typeIds: ['return-air']`, severity error.
  - A stamp with category `terminal`: `not-equipment` (error). A stamp with category `fitting`: the same.
  - Missing stamp, missing port: `unknown-start` and nothing else.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 110 lines of code and 40 of tests.

### T05b. The start check: the tests of groups, equipment and order
- **Depends on:** T05a.
- **Files:** `packages/core/src/route-start-network.test.ts` (new). No product code. If a test finds a defect, the task lead fixes `route-start.ts` in this task (at most a few lines) and reports it.
- **Tests (core):**
  - A group `[out, in]`: a `return-air` segment on `in`, chosen type `supply-air`, start port `out`: `group-other-type` with `portIds: ['in']`, severity **info**, and no error and no warning.
  - The same with a `supply-air` segment on `in`: `group-same-type`, severity warning.
  - The start port with one `supply-air` segment, and a fan coil unit (category `equipment`) at the other end of the network: `second-equipment` with its id, severity **info**. A terminal at the other end: no problem. A stamp missing from `stamps`: ignored.
  - A water network with a pump and two fan coil units: `second-equipment` lists the three ids sorted, severity info.
  - The order of the list: errors, then warnings, then info.
  - Two segments of two types on the start port: `port-segments` (warning) and `port-foreign-type` (error) together, the error first.
  - The input is not changed (deep equal).
- **Verify:** core tests; `pnpm build`.
- **Size:** about 120 lines of tests.

### T06a. The scene cascade uses the helper; `setPortGroup` refreshes the numbers
- **Depends on:** T03.
- **Files:** `packages/render/src/scene.ts` only.
- **Change 1 (cascade):** in `setNetworkTypeForSegmentsNetworks` (`:1426`-`:1457`) replace `:1435`-`:1444` with `const targetIds = segmentIdsOfNetworks({ segments: Object.values(state.segments), fittings: Object.values(state.fittings), portGroups: this.doc.portGroups }, validIds);` The calls of `adoptNetworkTypes`, `Transaction`, `syncDrawingLayer`, `markDirty` and `emit` stay.
- **Change 2 (A4):** in `setPortGroup` (`:2880`-`:2887`) add `this.emitter.emit('drawingChanged', this.getDrawingSummary());` and `this.recomputeFlow();` before the `selectionChanged` emit (the pair that `syncDrawingLayer` uses at `:5060`-`:5061`). Do not call `syncDrawingLayer` (it redraws all and a group does not change geometry). The task lead also checks the callers of `syncPortGroups` (`:2490`): where a caller already runs `syncDrawingLayer` or `recomputeFlow` (for example `:2533`), nothing more is needed. Where one does not, the task lead adds the same two lines and reports it. Not verified: all callers of `syncPortGroups`.
- **Must not touch:** `adoptNetworkTypes`, the Properties panel, other scene methods, `portGroups` history (a group edit gets no undo; section 3.4).
- **Verify:** core tests; UI tests; `pnpm build`. The browser proof is in T06b.
- **Size:** about 15 lines.

### T06b. The shared browser setup and the cascade browser check
- **Depends on:** T06a.
- **Files:** `.claude/roadmap/browser/r3-lib.mjs` (new, the shared setup of the R3 checks), `t06-check.mjs` in the work folder.
- **`r3-lib.mjs` exports:** `buildMixedGroupProject(page)` (sets up the test project, section 6 rules) returning `{ aId, supplySegmentIds, returnSegmentIds, ... }`. The setup makes: one equipment stamp `ahu` with ports `out` and `in` and the group `[out, in]`; two `supply-air` segments joined at a fitting from `ahu.out` to a grille; two `return-air` segments from `ahu.in` to a second grille. It reloads the project with `loadProjectFromJson`.
- **Must not touch:** product code.
- **Verify:** `pnpm build`. Browser check `t06-check.mjs` through real inputs:
  0. Group toggle (A4). Make a second setup where the group joins two ducts of one type (both `supply-air`, one on `out`, one on `in`). The status bar says "1 network". In Properties, uncheck one port of the group with the real check box: the status bar says "2 networks" at once, with no other action. Check the port again: "1 network". Also read `getFlowResult()` after each click: it matches the network count. A group toggle has no undo: the check does not click Undo for it.
  1. Setup with `buildMixedGroupProject`. Read the type of each segment (all as built).
  2. Select a `supply-air` segment with a real click on the canvas (a point on its geometry, from `s.world.toGlobal`, as `r2-check.mjs` does). In Properties, change `Network Type` to `Heating Water` with `selectOption` on the real select. Read the segments: all `supply-air` segments are now `heating-water`, all `return-air` segments are still `return-air`.
  3. The type is adopted (the document has `heating-water` in `getNetworkTypes()`) and the segment colour is not the default colour (read the colour of the type).
  4. Change the `return-air` network to `heating-water` the same way. The status bar then says "1 network" (the two networks join at the group).
  5. The rail Undo button gives step 4 back (two networks again), and again step 2.
  6. Multi-select (Shift+click) one segment of each network and change the type: both networks change.
  Screenshots: `T06-two-networks` (before), `T06-after-cascade`.
- **Size:** about 15 lines of product code and 120 of the helper script.

### T07. `getConnectivity()` in the scene
- **Depends on:** T06a (same file).
- **Files:** `packages/render/src/scene.ts`, `packages/render/src/index.ts` (export `ConnectivityView`).
- **Shapes:** section 3.6. Place it next to `getNetworkSummaries` (`scene.ts:1487`). Return `Object.values(state.segments)`, `Object.values(state.fittings)` and a copy of `this.doc.portGroups` (each `portIds` copied).
- **Must not touch:** any mutating method, `exportProject`.
- **Verify:** `pnpm build`; browser check `t07-check.mjs` (it imports `r3-lib.mjs` of T06b, so the director runs T06b before the T07 browser check; the T07 code itself needs only T06a): after `buildMixedGroupProject`, `getConnectivity()` returns the same segment ids, fitting ids and group as `exportProject()`; a change of the returned array does not change the document (push to it, then read again).
- **Size:** about 12 lines.

### T08. The consumers, the paste and the group toggle on a file with a mixed group (browser check only)
- **Depends on:** T06b.
- **Files:** a check script in the work folder. No product code.
- **Check `t08-check.mjs`:** after `buildMixedGroupProject` (the file has the group joining two types):
  1. Consumer 3 (status bar): the text of the status bar says "2 networks", and `getDrawingSummary().networkCount` is 2.
  2. Consumer 2 (Networks list): `getNetworkSummaries()` has two entries with the type names Supply Air and Return Air and the right segment counts. The Layers panel Networks tab shows two rows (open the tab with real clicks). No page error (a duplicate React key shows as a console error and `finish()` fails).
  3. Consumer 4 (flow): `getFlowResult()` has two results, both `resolved`. Set a capacity on each grille through the Properties Capacity input (real input, Enter). The sums of each network equal the capacity of its grille.
  4. Consumer 5 (visible fittings): select a `supply-air` segment and read `window.__mepSketchScene.computeVisibleFittingIds(state)` through the scene (the method is private in TypeScript only; this is a read for the check) or compare pixels of the fitting marker. The fitting of the `return-air` network is not visible. If the check cannot read it, it reports "not verified because <reason>".
  5. Open ports (A8). The open ports do not depend on networks. Read `getDrawingSummary()` open port counts (`openPorts`, `scene.ts:2263`) for the same project built in two ways: with the group and without it. The counts are equal. (The first draft compared a reload to itself. That proves nothing.) The count of networks differs between the two builds, and the check says so.
  6. The old result is not measured here. T04 pins the old cause by `nodeKeyOf` (equal keys).
  7. Rows of the Networks list (section 3.4): remove the group in Properties and then add it again; the list never shows a duplicate React key (no console error). Select the unit on the canvas: the unit is highlighted in both rows. (Record what the list shows if the expanded state moved; this is not a failure.)
  8. Paste (A10, finding F-R3-01). Select the unit and its four segments, press Ctrl+C then Ctrl+V on `body` (same drawing). Read `exportProject().portGroups` and list the groups of the pasted unit. The check does not fail on the result. It prints `FINDING pasted unit has/has no port group` and the network count after the paste. Then open a second drawing (`Example_1.pdf` as a second document through Menu → Open…, one page at a time as the rules say), press Ctrl+V there and print the same. Expected from the code (`scene.ts:4843`-`:4853`, `:4888`-`:4959`: no `portGroups` field): the pasted unit has no group.
  Screenshots: `T08-statusbar-two-networks`, `T08-networks-list`.
- **Verify:** the check exits 0.

### T09. The check lines and texts
- **Depends on:** T05a.
- **Files:** `packages/ui/src/components/routePlan.ts`, `packages/ui/src/routePlan.test.ts`.
- **Shapes:** section 3.7. Add the keys to `RouteTextKey` and to `TEXTS` (`routePlan.ts:79`-`:142`).
- **Must not touch:** the R2 functions and texts.
- **Tests (UI):** every new key has an English and a Dutch text (the test at `routePlan.test.ts:379`); each text, with sample parameters, has 140 characters or less (the test at `:401`; add the new params `count`, `types`, `ports`, `stamps`, `stamp`; the keys also include `selectionRiserNote`; no text holds "CFM" or "GPM"); `startCheckLines` fills the parameters (`{count}`, `{types}`, `{ports}`, `{stamps}`, `{stamp}`), joins several ids with ", ", uses the Dutch air words through `names.type`, keeps the order of the problems, and gives an empty `hint` where a code has none; plural: 1 and 2 segments in both languages.
- **Verify:** UI tests; `pnpm build`.
- **Size:** about 70 lines and 90 of tests.

### T10. The check block in the route dialog
- **Depends on:** T05b, T07, T09.
- **Files:** `packages/ui/src/components/RouteDialog.tsx`, `packages/ui/src/theme.css` (a class for the error line and one for the info line).
- **What it adds** (in `route-body`, under the start port select and its R2 notes):
  - State `connectivity` from `scene.getConnectivity()`. It reads when the dialog opens and in the existing `refresh` (`RouteDialog.tsx:52`-`:57`).
  - `problems = startStamp && selectedPort && selectedType ? checkRouteStart({ stamps, ...connectivity, startStampId, startPortId, networkTypeId }) : []`, wrapped in `useMemo` on its inputs.
  - A block `data-testid="route-checks"` with one `<p data-testid="route-check-<code>" data-severity="error|warning|info">` for each line of `startCheckLines`, and the hint in a second `<p class="mep-route-hint">`. No block when the list is empty. Errors use a class with the error colour of the theme, warnings use the class of `mep-route-note`, info uses a quiet class.
  - A note `data-testid="route-selection-note"` when the dialog opened with exactly one selected stamp that is not equipment (so `presetStart` was null and `selectionIds` holds a stamp whose `category` is not `equipment`): the text `selectionNotEquipment` with the stamp name, and under it the text `selectionRiserNote`.
  - The R2 notes `route-start-warning` and `route-port-note` stay as they are.
- **Must not touch:** the scope part, the markers, the finder, the R2 state names (`startId`, `portId`, `typeId`).
- **Verify:** UI tests; `pnpm build`. Browser check `t10-check.mjs` through real inputs (setup with `buildMixedGroupProject` and canvas selection before the dialog opens; clicks inside `.mep-modal--route` only):
  1. Select the unit on the canvas, open the dialog (menu "Route network…"). Choose type `supply-air` with `selectOption` on `route-type`, port `out` on `route-port`. `route-check-group-other-type` shows with `data-severity="info"` and names the port `in` and Return Air. No error line and no warning line.
  2. Switch the type to `return-air` and the port to `in`: the same info line for port `out` and Supply Air.
  3. Choose a port with two segments (the setup adds a stub with two segments on a third port): `route-check-port-segments` shows with `data-severity="warning"` and the text holds "2 segments". No error line.
  4. A port with a segment of another type, with the chosen type different: `route-check-port-foreign-type` shows with `data-severity="error"`.
  5. Add a second equipment stamp (a fan coil unit) to the network in the setup: `route-check-second-equipment` shows with `data-severity="info"` and names it.
  6. A unit with no segment at all and no group: `route-checks` is absent.
  7. Close the dialog, select a grille (a terminal) on the canvas, open the dialog: `route-selection-note` shows, with the riser note. With the unit selected it is absent.
  8. Dutch run at 400 px width (language by `localStorage` as in R2): the lines show, `scrollWidth <= clientWidth` of `.mep-modal--route`.
  9. Backdrop and Escape rules as in R2: the check never clicks the backdrop.
  Screenshots: `T10-checks-warning`, `T10-checks-error`, `T10-selection-note`, `T10-checks-nl-narrow`.
- **Size:** about 70 lines. If it passes 150, the task lead moves the selection note to its own job (T10b).

### T11. The hints of linked ports
- **Depends on:** T06b (its browser check uses `buildMixedGroupProject`). The text change itself needs no other task, but the hint is true only after T01.
- **Files:** `packages/ui/src/components/PropertiesPanel.tsx` (`:692`-`:695`), `packages/ui/src/components/PortEditorParts.tsx` (`:68`-`:71`).
- **Why:** the old hint, and the doc comment of `PortGroup` (`network.ts:76`-`:81`), say that a segment between the two ports never bridges the two networks. That was wrong before R3: the code joined them (`network.test.ts:62`-`:74`). T11 makes the text true. For water the text must not promise a split: the flow and return pipes have one type (section 3.2). The wording below says "segments of different network types".
- **Change:** the two hint texts only. New wording (STE): "Checked ports on this element act as one connection point for segments of one network type, for example a unit's supply and return. Segments of different network types on these ports stay separate networks." The Element Editor text says "once placed" in place of "on this element".
- **Must not touch:** the logic, the check boxes, `setPortGroup`.
- **Verify:** `pnpm build`. Browser check `t11-check.mjs`: select the unit of `buildMixedGroupProject` on the canvas and read the hint in Properties (real DOM text). The Element Editor hint: open it from the Properties panel or the Stamps tab with real clicks and read the text; if the check cannot find the way in a few tries, it reports "not verified because <reason>" for this step. Screenshot: `T11-hint`.
- **Size:** about 6 lines.

### T12. The part check
- **Depends on:** all tasks above.
- **Files:** `.claude/roadmap/browser/r3-check.mjs` (new). No product code. It imports `lib.mjs` and `r3-lib.mjs` with absolute paths and never reads `MEPAPP_PDF`.
- **What it does** (on `01_arch_first_floor.pdf`):
  1. Setup with `buildMixedGroupProject`. Baseline: `JSON.stringify(exportProject())`, `localStorage` keys, `canUndo`, `isDirty`.
  2. The old-file case: the status bar says "2 networks" for the mixed group file. A reload of the same exported JSON gives the same. The schema version of `exportProject()` is 18. A second file with a group of one type gives "1 network".
  3. The cascade over the group through the real Properties select (T06b steps 0 to 4, short form, including the group toggle that updates the status bar).
  4. The dialog: the checks of T10 steps 1 to 5, in English. The summary line of R2 still equals the independent count (R2 is not broken).
  5. The flow root: set capacities through the Properties input; read `getFlowResult()`; call `computeFlow` through the Solve flow button; two results, each resolved. (The root of the live solve is the fallback; the check does not claim a start stamp root. R5 wires it.)
  6. Close with Escape and the Close button. Compare with the baseline: `exportProject()` equal, the keys of `localStorage` equal, `canUndo` equal, `isDirty` equal (the dialog stores nothing).
  7. Dutch run at 400 px (after step 6, it changes `localStorage`).
  8. A second PDF run as a smoke test: open `Example_1.pdf`, open the dialog, the body shows, no page error. (Not a multi-page case. The multi-page refusal stays as R2 left it: proven with a stub only.)
  9. `no page errors` (`finish()`).
- **Screenshots:** `T12-two-networks`, `T12-dialog-checks`, `T12-dialog-checks-nl-narrow`, `T12-statusbar`.
- **Verify:** core tests; UI tests; `pnpm build` at the root with a fresh build (`turbo --force`); `node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r3-check.mjs` exits 0.
- **After the check:** the director marks R3 done in this file, with the commit hash of each task and the verification, in the style of `auto-routing-r2.md`.

## 7. Verification summary

| Task | Core tests | UI tests | `pnpm build` | Browser check | Screenshots |
|---|---|---|---|---|---|
| T00 | no | no | no | no | none |
| T01 | yes | no | yes | no | none |
| T02 | yes | no | yes | no | none |
| T03 | yes | no | yes | no | none |
| T04 | yes | no | no (test only) | no | none |
| T05a | yes | no | yes | no | none |
| T05b | yes | no | yes | no | none |
| T06a | yes | yes | yes | no (proof in T06b) | none |
| T06b | no | no | yes | `t06-check.mjs` | `T06-two-networks`, `T06-after-cascade` |
| T07 | no | no | yes | `t07-check.mjs` | none |
| T08 | no | no | yes | `t08-check.mjs` | `T08-statusbar-two-networks`, `T08-networks-list` |
| T09 | no | yes | yes | no | none |
| T10 | no | yes | yes | `t10-check.mjs` | `T10-*` |
| T11 | no | no | yes | `t11-check.mjs` | `T11-hint` |
| T12 | yes | yes | yes (fresh) | `r3-check.mjs` | `T12-*` |

The check scripts live in the work folder of the task, except `r3-lib.mjs` and `r3-check.mjs`, which stay in `.claude/roadmap/browser/`.

## 8. Where R3 stops and the next parts start

R3 gives: a `computeNetworks` that keeps a port group from joining different types (air only; a shared port or fitting, and the water flow and return pipes, still join), the helper `segmentIdsOfNetworks`, a flow solve with an exact root (`rootElementId`, `rootPortId`), the pure `checkRouteStart` (phases `before` and `after`), the scene read `getConnectivity()`, and the check block in the route dialog.

- **R4** (where a duct may go) needs none of this. It can start at any time.
- **R5** (sizing) takes the start stamp and the start port from the user, finds the network at the start port, and calls `solveFlow` with `rootElementId` and `rootPortId`. It must test that the network holds the start stamp (rule 4 of section 3.3). It also changes the live overlay only if the user asks.
- **R6** (the shape of the network) adds the "Route" button. It runs `checkRouteStart` with `before`, refuses on any `error`, and runs it with `after` on the result. The `routedBy` marks come in R6 (D-R6-02 A). R6 decides Q-R2-02 (the pipe side) before the first water run, and the foreign-type rule for a shared port or fitting.
- **Not in R3:** a stamp with two flows (D-R5-04), a riser (D-R2-02), a library stamp for a shaft (G12), a notice at load (P-R3-02).

## 9. Risks and what is not verified

- **Water is not split (M1).** A port group does not keep the flow pipe and the return pipe of a boiler apart, because they have one network type. R3 is no fix for water. The pipe side is an R6 decision (Q-R2-02).
- **Old files are not repaired (M3).** The old cascade could retag a return run to the supply type when both ends were in one group. So an old file can hold a return run typed supply-air. R3 does not repair it. The run stays one network with the supply type. An optional read-only hint (a group joins runs of one type whose terminals have different routing targets, for example a supply grille and a return grille) is not in R3 (P-R3-07).
- **Capacity of the root (M5).** `ownCapacityOf` adds the capacity of a stamp to both of its networks (`flow.ts:47`-`:53`). A rated air handling unit flow is a source rating. R5 must not add the capacity of the root stamp or of a source stamp as a load to the root total, or the total counts twice.
- **Finding F-R3-01 (A10): the clipboard loses a port group.** The clipboard has no `portGroups` field and `pasteClipboard` does not copy a group (`scene.ts:4843`-`:4853`, `:4888`-`:4959`). A pasted unit has no group, in the same drawing and in another drawing. After T01 the effect is small for two types (no group, so no join). For one type, the pasted ducts of the two ports are two networks where the original is one. The fix needs a new clipboard field and a map from old to new stamp id: more than one line. R3 does not fix it. T08 records the real result. The user decides if a fix goes to a later job.
- **No undo for a group edit (A10).** See section 3.4.
- A file with a port group that joined two types changes: one network becomes two (section 3.4). The user sees the change in the status bar and the Networks list. The flow numbers change too. P-R3-02 gives no notice. Not verified: how many real files have such a group. The generated library has no `definitionPortGroups`. A group exists only when the user makes it (`overview`, R3 example).
- The own capacity of a stamp that holds a capacity is added to each of its networks (section 3.2). Not verified: that any real drawing gives a capacity to equipment. R5 decides.
- A shared port or fitting between segments of different types still gives one network with the type of the first segment (`network.ts:159`-`:164`), also with a group present (T01 pins it). This is outside D-R3-01. The draw tool does not prevent it (`drawSegmentTool.ts:124`). R6 adds the refusal. Q-R3-01 asks the user about the draw tool.
- The line numbers of `scene.ts` in the overview differ from the current code (for example the cascade call is at `:1435`, not `:1427`). The plan uses the current numbers. They can move again.
- The check `second-equipment` fires for nearly every water network (pumps, fan coil units, VAV boxes; G14 case 2). It has severity info. The root is the start stamp. The check does not claim the sums are right for loops: a loop stays unresolved (`flow.ts:28`).
- `looks like a load` stays an R2 note (Q-R2-01 A). A fan coil unit with no routing targets yet looks like a source.
- `computeNetworks` runs in each render of the dialog through `checkRouteStart`. The call is in a `useMemo`. Not measured on a drawing with thousands of segments.
- A real multi-page PDF fixture does not exist. The refusal of R2 keeps its stub-only proof. R3 does not plan on one.
- The Dutch texts need a Dutch speaker (P-R3-04).
- Not verified: that the Element Editor can be opened in a few clicks by the browser check (T11 has a fallback).
