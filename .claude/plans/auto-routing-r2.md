# R2 plan: the route dialog input and the port finder

**Status: DONE 2026-10-17 (on branch `worktree-agent-framework`, not merged; the user tests on Windows first).** One task is open: a real multi-page PDF is needed to prove the refusal (NEEDS_CONTEXT, see below).

| Task | Commit | Verification |
|---|---|---|
| T01 open ports in core | `11e5117` | core 924 tests, build |
| T02 port finder | `1a7d4bb` | core 942 tests (18 new) |
| T03 multi-page refusal (en, nl) | `f3c4933` | core 947 tests |
| T04 scene uses `openPortsOf` | `8950f65` | browser check 7 of 7: status bar equals an independent count, Undo restores |
| T05 route markers | `513402f` | browser check 17 of 17: pixels change, `isDirty`, `exportProject` and Undo state unchanged |
| T06 dialog pure logic | `8c47e73` | UI 174 tests (49 new) |
| T07 dialog shell, menu entry, refusal | `1aede20` | browser check 19 of 19, backdrop click keeps the dialog open |
| T08 dialog inputs | `06cb108` | browser check 27 of 27 (en) and 5 of 5 (nl, 400 px); one term "Route network" |
| T09a scope, room list, summary | `4ed894c` | browser check 34 of 34 and 4 of 4; the count drops by a room's count when it is unchecked |
| T09b markers, event refresh, polish | `432dd3b` | browser check 22 of 22; markers magenta (distinct from the cyan selection box) |
| T11 part check | `97de784` | core 947, UI 177, typecheck, build; `r2-check.mjs` 55 of 55 and 5 of 5 |
| T12 fixes from the part check | `8e2e204` | core 947, UI 181, typecheck 17 of 17, `pnpm build` fresh (`turbo --force`, 0 cached, 9 of 9); `r2-check.mjs` 64 of 64 and 10 of 10 |

Open at the end of R2:
- **NEEDS_CONTEXT:** all 9 files in `fixtures/pdfs/` have 1 page. The refusal of a multi-page PDF is proven only with a stub of `getPageCount` (wiring and texts, en and nl). A real multi-page PDF fixture is needed. Nobody makes a fake one.
- Auto-place places 0 stamps on `plattegrond begane grond 10A.pdf` with the scale of `lib.mjs` `detect`. The part check ran on `01_arch_first_floor.pdf`. Cause not found.
- The Dutch wording (the formal "u", "ruimtes", "(N open)", the mix of Dutch stamp names and English network type names) needs a Dutch speaker.
- The dialog sits at the right and cannot be moved. The plan has no legend for the marker colors. The dialog lists counts only: a list of the target ports (stamp and port name) comes with R3 or later.
- Provisional choices (easy to reverse): P-R2-01 to P-R2-11 (see section 0 and the ledger).

Status: written 2026-10-16 by the road map planner. Revised in round 1 of 2 after the audit and the domain check. All answers of the user for R2 are final (D-R2-01 C, D-R2-02 A, D-R2-03 A). (Written before the build; see the status above.)
Origin: `roadmap-overview.md` (sections 0, 1, 3, 5), `auto-routing.md`, `auto-routing-r2-prompt.md`. The model changed after the R2 prompt: the app stores no grouping of ports. So R2 has no entity to design and no migration. The research on Revit, MagiCAD and the old app is not needed for this model and is not repeated here. Not verified: that no later part needs it.
Code claims carry `path:line`. Paths start at the repository root. A line number can move after a later commit.
Read `.claude/roadmap/rules.md` first.

Terms (the terms of `roadmap-overview.md` apply):
- **Network**, **network type**, **routing target**, **open port**, **route command**, **route input**, **start stamp**: as in the overview.
- **Route dialog**: the dialog that R2 builds. It collects the route input. It makes no segment. R6 adds the "Route" button.
- **Target ports**: the open ports of the chosen network type that the route command must connect.
- **Scope**: how the user gives the target ports: by rooms, or by the selected stamps (D-R2-01 C).
- **Route marker**: a ring that the overlay draws on a port, to show the start port or a target port while the dialog is open. It is not stored.
- **Multi-port stamp**: a stamp with two or more open ports that have the same routing target. Example: a fan coil unit with a flow port and a return port, both with the target Heating Water.

## 0. Provisional choices and open questions of round 1

Provisional choices (P-R2-nn). Each one is easy to reverse. The plan takes the recommendation. The director can change it before the build.

| Id | Choice | Reason |
|---|---|---|
| P-R2-01 | A multi-port stamp gives one target port by default: the port nearest to the start port. A tie goes to the first port by port order. If the start port is unknown, the first port by port order. An option "Use all ports of these stamps" takes all of them. | One run must never join the flow port and the return port of one unit. The app does not model the pipe side (see Q-R2-02). The option is a flag of the finder. |
| P-R2-02 | The start stamp select shows stamps without a routing target on their ports first (group "Likely sources"), then the others (group "Has ports that wait for routing"). A warning shows when the chosen start stamp has the routing target of the chosen type on its own ports. | No field in the stamp data tells a source (air handling unit, boiler) from a load (fan coil unit). Both are `category: 'equipment'` (`packages/core/src/stamp-library.generated.ts:21632` and `:22942`). So the plan uses only the routing targets on the ports. |
| P-R2-03 | The type select does not list gravity types. R2 has one: `sanitary-waste`. The list is a constant `GRAVITY_TYPE_IDS` in `routePlan.ts`. | Sanitary waste flows to the building outlet, not from a source. A run from a start stamp does not fit. A later part can change this. |
| P-R2-04 | The dialog passes `closeOnBackdropClick={false}` to `Dialog`. Escape and the Close button still close it. | A stray click beside the dialog must not close it and clear the markers (`Dialog.tsx:13`, `:39`). |
| P-R2-05 | The check box "Include ports outside rooms" is on by default. | Room detection can miss a room. A grille in a shaft or a ceiling void is in no room. |
| P-R2-06 | In the rooms scope, ports of equipment stamps are not target ports. They show in a separate line. There is no option to include them. | An equipment stamp in a room is not a terminal. The stamps scope covers the rare case: the user selects the stamp. |
| P-R2-07 | In Dutch texts, the three air types use the Dutch words `toevoerlucht`, `retourlucht` and `afzuiglucht`. All other type names stay English, as in the library. The select options always show the English library name. `afvoerlucht` has no library type, so no text uses it. | The Dutch demand names exist already (`packages/core/src/rooms/room-need.ts:27`-`:28`). A Dutch speaker must check the words. |
| P-R2-08 | The dialog shows counts only. It shows no flow figure and no unit (CFM, GPM). | R2 does not size. The library unit is US (`network-type-library.ts:11`), and the Dutch user works in dm³/s. R5 decides the unit. |

Open questions (data model). The plan does not take these. R2 works without an answer.

- **Q-R2-01 [data model].** Should a stamp definition get a field that says "source" or "load"? Options: A no field (R2 default; the sort of P-R2-02), B a field `role` on the stamp definition. Recommendation: A for R2. Ask again in R3, where the start check needs it. B changes the stamp definition and the file format.
- **Q-R2-02 [data model].** Should a water port know its pipe side (flow or return)? Today `heating-water` and `chilled-water` are one network type each, with no flow or return type (`packages/core/src/network-type-library.ts:14`-`:15`). Options: A no pipe side (R2 default, P-R2-01 limits the damage), B a pipe-side field on the routing target or on the network type. Recommendation: decide in R6, before the first water run. R2 stores nothing and only states the limit.

## 1. Goal

The user opens "Route network…" from the menu. The dialog asks for: the start stamp, the start port, the network type, and the scope of the target ports (rooms, or the selected stamps). The dialog says how many open ports of that type the scope holds, and marks them on the plan. A PDF with more than one page is refused with a message. The dialog makes no segment and changes no stored data.

Where R2 stops: the dialog does not check the start (is it equipment, how many segments has the start port, a foreign type). That is R3. The only exceptions are the two soft notes of T08 (a stamp that looks like a load, a start port with another routing target). They only inform. They block nothing. The dialog has no "Route" button. That is R6. The dialog does not size anything. That is R5.

## 2. What exists now

| Item | Where | Use in R2 |
|---|---|---|
| `routingTargetOf(stamp, portId)` | `packages/core/src/stamp.ts:37` | Reads the routing target of one port. |
| `getStampWorldPorts(stamp)` | `stamp.ts:113` | The ports with a world position. A stamp with no own port gets the port `__center__` (`stamp.ts:89`, `:109`). It takes a full `PlacedStamp` today. T01 widens the type (see T01). |
| `getStampPorts` | `stamp.ts:109` | The port list for the start port select. Same widening. |
| `StampInfo` (`routingTargets`, `portSegmentTypes`, `ports`, `transform`, `nativeWidth`, `nativeHeight`, `category`) | `packages/render/src/scene.ts:385`-`:402`, built at `:1182` | The dialog reads stamps through `listStamps()` (`:1473`). It already holds the network type of the segment on each connected port. So the finder needs no segment list. |
| `StampCategory = 'terminal' \| 'equipment' \| 'fitting'` | `packages/core/src/stamp-library.ts:14` | Tells equipment from terminals (M4, T06). It does not tell a source from a load. |
| `openPorts` (private) | `scene.ts:2255` | The same logic as the finder, for all types. It stays private. T04 makes it call the core function. |
| `portSegmentTypes` (private) | `scene.ts:1202` | Builds `StampInfo.portSegmentTypes`. Stays as it is. |
| `roomsAtPoint(rooms, p, pageIndex)` | `packages/core/src/rooms/room.ts:138` | The room of a port: the first result is the smallest room. |
| `Room` | `room.ts:15` | `id`, `name`, `number`, `roomTypeId`, `pageIndex`. |
| `listRooms()`, `getPageIndex()`, `getPageCount()`, `getNetworkTypes()`, `getSelection()` | `scene.ts:3071`, `:1011`, `:1016`, `:2308`, `:1215` | The read side of the dialog. |
| `getPageCount()` of the engine | `packages/pdf-engine/src/index.ts:128` | The page count for the refusal. `scene.getPageCount()` returns 1 when no PDF is open (`scene.ts:1017`). |
| `markDirty` (private) | `scene.ts:1133` | Sets `isDirty` of the document. The markers must not call it. `getDocuments()` (`scene.ts:1071`) returns `DocumentSummary` with `isDirty` (`packages/render/src/document.ts:73`-`:78`). |
| `worldToScreen` (private) | `scene.ts:4947` | Not public. Browser checks use `s.world.toGlobal(position)` plus `s.app.canvas.getBoundingClientRect()` (`.claude/roadmap/browser/p6-check.mjs:15`-`:22`). |
| Scene events `pageChanged`, `documentActivated` | `scene.ts:509`, `:513`; listeners that clear a layer: `:703` | The markers clear on both (T05). |
| Auto-place dialog and its menu entry | `packages/ui/src/components/AutoPlaceDialog.tsx`, `MenuButton.tsx:147`-`:156`, `App.tsx:436`, `:1452`, `:1602` | The model for the shell, the wiring and the checks. `AutoPlaceDialog` gets `language` and `stampName` as props (`AutoPlaceDialog.tsx:39`; `App.tsx:1608`). `language` is `labelLanguage`, kept in `localStorage` under `mepapp.settings.labelLanguage.v1` (`App.tsx:159`, `:462`-`:465`). |
| `Dialog` | `packages/ui/src/components/Dialog.tsx:25` | The modal shell. It has `role="dialog"` and `aria-label` (`:40`), `isolateKeys` (`:16`, `:28`), a backdrop click that closes it (`:39`) and the prop `closeOnBackdropClick` (`:13`). The backdrop dims the plan to 50 % (`theme.css:1530`-`:1538`). |
| `clearAutoPlacePreview` in an effect cleanup | `AutoPlaceDialog.tsx:453` | The pattern for "the scene shows something only while the dialog is open". |
| `redrawOverlay` draws the open-port dots | `scene.ts:5252`-`:5265` | The place where the route markers are drawn. |
| `CURRENT_SCHEMA_VERSION = 18` | `packages/core/src/project.ts:20` | R2 leaves it at 18. |
| Browser helper | `.claude/roadmap/browser/lib.mjs`, `with-server.mjs`, `p3-check.mjs`, `p6-check.mjs` | The shape of the check scripts. `lib.mjs` reads `MEPAPP_PDF` once, at import (`lib.mjs:14`). `openPdf(path, name)` takes a path (`lib.mjs:65`). |
| Fixture PDFs | `/root/MepApp/fixtures/pdfs/`: `00_arch_ground_floor.pdf`, `00_arch_ground_floor_edit.pdf`, `01_arch_first_floor.pdf`, `Example_1.pdf`, `Example_2.pdf`, `Example_3.pdf`, `Test_doc.pdf`, `arch_simple_A4.pdf`, `plattegrond begane grond 10A.pdf` (9 PDFs, and `README.md`) | The page count of each file is not verified (see T11). |

Gap found by the check of the code: the stamps carry no page (`packages/core/src/stamp.ts:8`-`:34`, overview G1). The finder looks up rooms on one page index that the caller gives. With the refusal (D-R2-03 A) the page is always 0.

## 3. The model

### 3.1 Stored data

R2 stores nothing.
- No field in `ProjectDocument`, `PlacedStamp`, `Segment`, `Fitting`, `NetworkType`, `Room` or `Circuit`.
- No schema step. The version stays 18.
- No `localStorage` key. The dialog keeps its input in React state while it is open. It forgets the input when it closes. (The last-input memory of the overview, section 5, stays a later option.)
- The route markers live in a field of `SketchScene`. The scene clears them when the dialog closes, when the page changes and when the document changes. They are not in the undo state and not in the PDF export. They do not mark the document as changed.

Proof for each task: `git diff --stat` shows no change in `packages/core/src/project.ts`, `schema.ts` or `serialize*`. The part check (T11) compares `JSON.stringify(exportProject())` before the dialog opens and after it closes. They must be equal. It also compares the `localStorage` keys, `getDrawingSummary().canUndo` and the `isDirty` value of `getDocuments()`.

### 3.2 The core types (`packages/core/src/route-ports.ts`, new)

```ts
import type { Vec2 } from './geometry.js';
import type { PlacedStamp } from './stamp.js';
import type { Room } from './rooms/room.js';

/** A stamp as the finder reads it. `StampInfo` of the scene fits this shape. */
export type RouteStamp = Pick<PlacedStamp, 'id' | 'category' | 'transform' | 'nativeWidth' | 'nativeHeight' | 'ports' | 'routingTargets'> & {
  /** The network type of the segment on each connected port, by port id. A port with no entry has no segment. */
  portSegmentTypes?: Readonly<Record<string, string>>;
};

/** A port with a routing target and no segment. */
export interface OpenPort {
  stampId: string;
  portId: string;
  networkTypeId: string;
  world: Vec2;
}

/** All open ports of the stamps, any network type. Order: the order of `stamps`, then the order of the ports. */
export function openPortsOf(stamps: readonly RouteStamp[]): OpenPort[];

export type RouteScope =
  | { kind: 'rooms'; roomIds: ReadonlySet<string> }
  | { kind: 'stamps'; stampIds: ReadonlySet<string> };

export interface RoutePortsInput {
  stamps: readonly RouteStamp[];
  networkTypeId: string;
  scope: RouteScope;
  /** The start stamp. Its own ports are never target ports. */
  startStampId?: string;
  /** The start port. It only decides which port of a multi-port stamp is the nearest (P-R2-01). */
  startPortId?: string;
  /** All rooms of the page. Needed for scope `rooms`. When given for scope `stamps`, the finder sets `roomId` of each port. */
  rooms?: readonly Room[];
  /** The page of `rooms`. Default 0 (D-R2-03 A: one page only). */
  pageIndex?: number;
  /** Scope `rooms`: a port in no room is a target port. Default true (P-R2-05). */
  includeOutsideRooms?: boolean;
  /** 'one': one target port for each multi-port stamp (P-R2-01). 'all': every port. Default 'one'. */
  portsPerStamp?: 'one' | 'all';
}

export interface RoutePort extends OpenPort {
  /** The smallest room that holds the port (`roomsAtPoint`), or null when no room holds it or no `rooms` were given. */
  roomId: string | null;
}

export interface RoutePortsResult {
  /** The target ports, in the order of `openPortsOf`. */
  ports: RoutePort[];
  /**
   * Scope `rooms`: one entry for each room of `input.rooms` (also an unchecked room, also a room with 0 ports).
   * `count` is the number of ports that survive rules 1 to 7 and lie in that room. `checked` is true when the room is in `roomIds`.
   * Scope `stamps`: an empty list.
   */
  perRoom: { roomId: string; count: number; checked: boolean }[];
  /** Scope `rooms`: the ports that survive rules 1 to 7 and lie in no room. They are target ports only when `includeOutsideRooms` is true. */
  outsideRooms: number;
  /** Ports that survive rules 1 to 7 and that the scope leaves out (an unchecked room, a stamp not selected). Ports outside rooms are in `outsideRooms`, not here. */
  leftOut: number;
  /** Open ports of the type on the start stamp. They are not target ports (rule 4). */
  startStampPorts: number;
  /** Scope `rooms`: open ports of the type on equipment stamps in the scope. They are not target ports (rule 6). */
  equipmentPorts: number;
  /** The number of multi-port stamps, whatever `portsPerStamp` is. */
  multiPortStamps: number;
  /** Ports that rule 7 dropped. It is 0 when `portsPerStamp` is 'all'. */
  droppedExtraPorts: number;
}

export function findRoutePorts(input: RoutePortsInput): RoutePortsResult;
```

Rules of the finder (each one has a core test). The order is the order of the steps.
1. An open port is a port with a routing target and no entry in `portSegmentTypes`. This is the same rule as `openPorts` (`scene.ts:2255`-`:2266`).
2. The finder reads `routingTargets` only. It never reads or writes a network type of a port (rule 1 of `rules.md` §3).
3. A port whose routing target is not `networkTypeId` is not a candidate.
4. The candidate ports of `startStampId` are not target ports. The finder counts them in `startStampPorts`.
5. Scope `stamps`: a candidate is in the scope when its stamp id is in `stampIds`. Scope `rooms`: the room of a candidate is `roomsAtPoint(rooms, port.world, pageIndex)[0]` (the smallest room, `room.ts:137`). A candidate in no room counts in `outsideRooms`.
6. Scope `rooms` only: a candidate on a stamp with `category: 'equipment'` is not a target port. The finder counts it in `equipmentPorts` when its room is checked, or when it lies outside rooms and `includeOutsideRooms` is true. Scope `stamps` has no such rule: the user selected the stamp on purpose.
7. A stamp with two or more remaining candidates is a multi-port stamp. `multiPortStamps` counts it. With `portsPerStamp: 'one'` (the default), the finder keeps one port of that stamp and drops the others (`droppedExtraPorts`). It keeps the port nearest to the start port. When `startStampId` or `startPortId` is missing or unknown, or when two ports are equally near, it keeps the first by port order. This rule runs on all remaining candidates, before the scope decides, so the counts of a room do not change when the user checks or unchecks another room.
8. The scope now decides on the survivors of rule 7. A survivor in a checked room, a survivor outside rooms with `includeOutsideRooms: true`, or a survivor on a selected stamp is a target port. Every other survivor counts in `leftOut` (outside-room survivors count in `outsideRooms` only). `perRoom` counts the survivors of each room, checked or not.
9. A stamp with no own port uses the port `__center__` (`getStampWorldPorts`).
10. The finder does not change its input.

Limit for R6 (state it in the code comment of `findRoutePorts` and in the part check): the finder does not know the pipe side. For a water unit with a flow port and a return port, rule 7 only keeps a run from joining both ports. It cannot tell which port is the flow port. R6 and Q-R2-02 decide this before the first water run.

`routePageProblem(pageCount, language)` (in `route-input.ts`): `pageCount > 1` gives a message, for example (en) "This PDF has 3 pages. The route command works on one floor for each PDF file. Split the pages into separate files." and (nl) "Deze PDF heeft 3 pagina's. Het routecommando werkt op één verdieping per PDF-bestand. Splits de pagina's in aparte bestanden." Any other count gives null. The texts are STE.

```ts
export type RouteLanguage = 'en' | 'nl';
export function routePageProblem(pageCount: number, language: RouteLanguage): string | null;
```

### 3.3 The UI model (`packages/ui/src/components/routePlan.ts`, new)

Pure functions, tested like `autoPlacePlan.ts`:

```ts
import type { RouteStamp, RoutePortsResult, Room, RouteLanguage } from '@mepapp/core';

/** Network types that the type select does not list (P-R2-03). */
export const GRAVITY_TYPE_IDS: readonly string[] = ['sanitary-waste'];

export interface StartCandidate<S> {
  stamp: S;
  /** True when no port of the stamp has a routing target (P-R2-02). */
  likelySource: boolean;
}

/** The equipment stamps of the drawing, for the start stamp select. Sources first (stable order inside each group). */
export function startCandidates<S extends RouteStamp & { definitionId?: string }>(stamps: readonly S[]): StartCandidate<S>[];

/** True when the stamp has the routing target `networkTypeId` on one of its own ports (open or not). For the soft warning. */
export function looksLikeLoad(stamp: RouteStamp, networkTypeId: string): boolean;

/** The start stamp to preset when the dialog opens: the only equipment stamp in the selection, else null. */
export function presetStart(selection: readonly RouteStamp[]): string | null;

/** The open ports of each network type, largest first, without gravity types. For the network type select. */
export function typeChoices(stamps: readonly RouteStamp[]): { networkTypeId: string; count: number }[];

/** The ports of the start stamp for the port select: ports whose routing target is the chosen type first, then the others. Each entry says its routing target or null. */
export function startPortChoices(stamp: RouteStamp, networkTypeId: string): { portId: string; name: string; routingTarget: string | null; matches: boolean }[];

/** The label of a room in the list: its name, else its number, else "Room <n>" / "Ruimte <n>". */
export function roomLabel(room: Pick<Room, 'id' | 'name' | 'number'>, index: number, language: RouteLanguage): string;

/** The name of a network type inside a sentence. English: the library name. Dutch: toevoerlucht, retourlucht, afzuiglucht for the three air types, else the library name (P-R2-07). */
export function typeNameInText(typeId: string, libraryName: string, language: RouteLanguage): string;

/** The lines under the inputs. The first line is the main result, for example "15 open ports of Supply Air in 9 rooms". The next lines appear only when their count is above 0. */
export function routeSummaryLines(result: RoutePortsResult, scope: 'rooms' | 'stamps', typeName: string, roomCount: number, language: RouteLanguage): string[];

/** Every fixed text of the dialog, by key, in English and Dutch. */
export function routeText(language: RouteLanguage, key: RouteTextKey, params?: Record<string, string | number>): string;
```

Summary lines (English; the Dutch lines have the same meaning and use the Dutch words):
1. "15 open ports of Supply Air in 9 rooms." Stamps scope: "3 open ports of Supply Air on 3 selected stamps." The stamps scope has no room count (A10).
2. "2 ports are outside every room. They are included." or "... They are not included." (only when `outsideRooms` > 0, rooms scope).
3. "4 ports are left out by the scope." (`leftOut` > 0).
4. "3 ports of equipment are not targets." (`equipmentPorts` > 0).
5. "1 port of the start stamp is not a target." (`startStampPorts` > 0).
6. "2 stamps have 2 ports of the same type. The finder uses 1 port of each." (`multiPortStamps` > 0 and `portsPerStamp` is 'one'); with 'all': "2 stamps have 2 ports of the same type. The finder uses all ports." The function reads the mode from a last parameter `portsPerStamp`.

The summary shows counts only. It shows no flow figure and no unit (P-R2-08, M9).

Dutch examples: "15 open aansluitingen voor toevoerlucht in 9 ruimtes." "1 open aansluiting voor toevoerlucht in 1 ruimte." Plural forms: a core UI test checks 0, 1 and 2 or more in both languages.

## 4. The rules of `rules.md` §3 and how R2 keeps them

- **Rule 1 (the segment defines the network type of a port).** R2 reads routing targets. It writes no network type and no routing target. The network type select only chooses which routing targets to count. The start port note ("this port waits for Exhaust Air") names a routing target, never a network type of the port.
- **Rule 2 (the cascade invariant).** R2 makes no segment and adds no per-segment field. The rule is not touched.
- **Rule 3 (reuse before new).** The dialog copies the shell, the menu entry, the room lookup, the language prop and the preview pattern of Auto-place. The finder is the logic of `openPorts` in a pure function, and T04 makes the scene use that function, so two copies do not exist. The markers reuse `redrawOverlay` and the style of the open-port dots. The source/load sort reuses `category` and the routing targets; it adds no field (Q-R2-01). No new stored entity. No new state in the document.
- **Rule 4 (the adoption trap).** R2 writes no segment, so it adopts nothing. The network type select lists the types that appear as a routing target on an open port. A type that the drawing has not adopted is shown with its library name (`getNetworkTypeFromLibrary`, as `scene.ts:2247`). R6 must call `adoptNetworkTypes` (`scene.ts:2358`) before it writes a segment. R2 has no task for this.
- **Rule 5 (verify UI wiring through the real DOM).** T07 to T11 type into the real selects and check boxes, and click the real buttons. The scene API only opens the setup and reads the state.
- **Rule 6 (merge lesson).** Each task ends with `pnpm build` at the root.

## 5. The phases

Phase A, the core (T01, T02, T03). Phase B, the scene (T04, T05). Phase C, the dialog (T06, T07, T08, T09a, T09b). Phase D, the part check (T11). The number T10 is not used. This keeps the number of the part check the same as the references in other files (the part check follows T09b).

Tasks with no dependency, which can start at once: **T01, T03**. They write different files. T02 waits for T01 (same file `route-ports.ts`). T04 waits for T01. T05 waits for T04 (same file `scene.ts`). The UI tasks wait as the list says. Jobs on the same file run one after another.

Order of the dependencies:

| Task | Title | Depends on | Files (main) |
|---|---|---|---|
| T01 | The open ports in core | none | `route-ports.ts`, `route-ports.test.ts`, `index.ts`, `stamp.ts` (two parameter types) |
| T02 | The port finder in core | T01 | `route-ports.ts`, `route-ports.test.ts` |
| T03 | The refusal of a multi-page PDF in core | none | `route-input.ts`, `route-input.test.ts`, `index.ts` |
| T04 | The scene uses the core function | T01 | `scene.ts` |
| T05 | The route markers in the scene | T04 | `scene.ts` |
| T06 | The pure logic of the dialog | T02, T03 | `routePlan.ts`, `routePlan.test.ts` |
| T07 | The dialog shell, the menu entry and the refusal | T03 | `RouteDialog.tsx`, `MenuButton.tsx`, `App.tsx`, `theme.css` |
| T08 | The dialog inputs | T06, T07 | `RouteDialog.tsx` |
| T09a | The scope, the room list and the summary | T08 | `RouteDialog.tsx`, `theme.css` |
| T09b | The markers and the refresh on events | T05, T09a | `RouteDialog.tsx` |
| T11 | The part check with the real PDF | T04, T09b | `r2-check.mjs` |

Commands (the tester runs them from the root of the worktree `/root/MepApp/.claude/worktrees/agent-framework`, one command for each call):
- Core tests: `pnpm --filter @mepapp/core test`
- UI tests: `pnpm --filter @mepapp/ui test`
- Build: `pnpm build`
- Browser check: `node .claude/roadmap/browser/with-server.mjs <work>/<name>-check.mjs`. Do not put an environment variable before the command. Screenshots go to `/tmp/mepapp-shots/` and are named `<task id>-<name>`.

Rules for every browser step of this part:
- Open each PDF with `openPdf('<absolute path>')`. The check script never sets `MEPAPP_PDF` (`lib.mjs:14` reads it at import; `lib.mjs:65` takes the path).
- While the route dialog is open, click only inside `.mep-modal` (use locators scoped to `.mep-modal--route`). A click on the backdrop or on the canvas closes the dialog in some builds (`Dialog.tsx:39`) and clears the markers. Close the dialog with Escape or with the Close button. The check never clicks at fixed screen coordinates while the dialog is open.
- Do all canvas clicks (select a stamp, Shift+click) before the dialog opens.
- Use `.mep-modal` to find a dialog. Do not rely on a role name in a check; the role exists (`Dialog.tsx:40`) but `rules.md` §4 says the opposite (see the notes for the director).

### T01. The open ports in core
- **Depends on:** none.
- **Files:** `packages/core/src/route-ports.ts` (new), `packages/core/src/route-ports.test.ts` (new), `packages/core/src/index.ts` (one export line), `packages/core/src/stamp.ts` (type change of two parameters, see below).
- **Shapes:** `RouteStamp`, `OpenPort`, `openPortsOf` (section 3.2). Use `getStampWorldPorts` and `routingTargetOf`.
  - `RouteStamp` is a `Pick<PlacedStamp, ...>`, but `getStampPorts` and `getStampWorldPorts` take a full `PlacedStamp` (`stamp.ts:109`, `:113`). T01 may widen the type of the parameter of these two functions to `Pick<PlacedStamp, 'ports' | 'transform' | 'nativeWidth' | 'nativeHeight'>`. This is a change of the type only. The behavior stays the same. All existing callers keep compiling, because a `PlacedStamp` fits the narrower type.
- **Must not touch:** `scene.ts`, any stored type, the body of any function in `stamp.ts`. In `stamp.ts` only the parameter types of `getStampPorts` and `getStampWorldPorts` may change.
- **Tests (core):** a stamp with two ports and two routing targets gives two open ports with the right world positions (a rotated stamp too); a port with an entry in `portSegmentTypes` is not open; a stamp with no own port and a target on `__center__` gives one open port at the center; a stamp with no `routingTargets` gives none; a target on a port id that the stamp does not have gives none.
- **Verify:** core tests pass; `pnpm build` passes (it proves that the widened types fit every caller). `git diff packages/core/src/stamp.ts` shows only the two signature lines. No UI test and no browser check (no UI change).
- **Size:** about 60 lines of code and 90 of tests.

### T02. The port finder in core
- **Depends on:** T01.
- **Files:** `packages/core/src/route-ports.ts` (add `findRoutePorts`, `RouteScope`, `RoutePortsInput`, `RoutePort`, `RoutePortsResult`), `packages/core/src/route-ports.test.ts`.
- **Shapes:** section 3.2, rules 1 to 10.
- **Must not touch:** `rooms/room.ts` (call `roomsAtPoint` as it is), `scene.ts`, `route-input.ts`.
- **Tests (core):** build the data in code: an office floor with 4 rooms (two wings), 2 air handling units' worth of grilles with the routing target `supply-air`, and 2 exhaust grilles with `exhaust-air`.
  - Rooms scope with all rooms checked: the count equals the number of supply ports.
  - Rooms scope with the east-wing rooms unchecked: `ports` drops, `leftOut` holds the difference. `perRoom` lists all 4 rooms. The unchecked rooms have `checked: false` and their true counts (A2).
  - A port in two nested rooms counts for the smallest room only.
  - A port in no room: with `includeOutsideRooms: true` (default) it is a target port and `outsideRooms` counts it; with `false` it is not a target port, `outsideRooms` still counts it and `leftOut` does not (M5).
  - Stamps scope: only the selected stamps count. With `rooms` given, `roomId` is set; without it, `roomId` is null (A3).
  - The start stamp's own ports never count, also when they carry the routing target. `startStampPorts` holds their number.
  - Another network type does not count (rule 3).
  - A port with a segment does not count.
  - Two grilles in one room served by two units (case c of the overview): scope `stamps` takes one of them.
  - Equipment (M4): an equipment stamp with a `supply-air` port inside a checked room is not a target port in the rooms scope and `equipmentPorts` is 1. In the stamps scope, when selected, it is a target port.
  - Multi-port stamp (M1): a radiator with a flow port and a return port, both `heating-water`, and a start port at the boiler. Default: one target port (the nearest to the start port), `multiPortStamps` 1, `droppedExtraPorts` 1. A tie picks the first port by port order. With a missing `startPortId` it picks the first port by port order. With `portsPerStamp: 'all'` both ports are target ports and `droppedExtraPorts` is 0. Unchecking the room of another stamp does not change the count of the radiator's room.
  - A fan coil unit (a load) next to a boiler (the start stamp) on the same page: the run from the boiler gets one port of the fan coil unit, never both.
  - A pure test: `findRoutePorts` does not change its input (deep equal before and after).
- **Verify:** core tests pass; `pnpm build` passes.
- **Size:** about 100 lines of code and 150 of tests. If the tests pass 150 lines, the task lead splits the test file in two jobs.

### T03. The refusal of a multi-page PDF in core
- **Depends on:** none.
- **Files:** `packages/core/src/route-input.ts` (new; always this file, never `route-ports.ts`), `packages/core/src/route-input.test.ts` (new), `packages/core/src/index.ts` (one export line; if T01 runs at the same time, the task lead merges the two single-line changes by hand).
- **Shapes:** `RouteLanguage`, `routePageProblem(pageCount: number, language: RouteLanguage): string | null` (section 3.2).
- **Tests (core):** 1 gives null; 2 and 40 give a message that holds the page count, in English and in Dutch (Dutch: it holds "pagina's" and "verdieping"); 0 gives null (no PDF open is a different problem, the menu item is disabled then); a non-integer value or NaN gives null and does not throw.
- **Verify:** core tests; `pnpm build`.
- **Size:** about 25 lines and 35 of tests.

### T04. The scene uses the core function
- **Depends on:** T01.
- **Files:** `packages/render/src/scene.ts` (`openPorts` at `:2255`; its two callers are `getDrawingSummary` at `:2237` and `redrawOverlay` at `:5259`).
- **Change:** `openPorts(state)` builds the `RouteStamp` list from `state.stamps` and `portSegmentTypes()` and returns `openPortsOf(...)` mapped to `{ world, networkTypeId }`. The result must be the same as today for every drawing.
- **Must not touch:** `portSegmentTypes` (`:1202`), `toStampInfo`, the dots' drawing, the status bar, any other method.
- **Verify:** core tests; UI tests; `pnpm build`. Browser check `t04-check.mjs` (copy the setup of `p6-check.mjs`: `openPdf('/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf')`, detect rooms, run the example supply air rule, place):
  1. The number in `[data-testid=open-ports] label b` equals a count that the check computes in the page from `window.__mepSketchScene.listStamps()` (ports with a `routingTargets` entry and no `portSegmentTypes` entry).
  2. Draw one segment from an open port. Use the pattern of `p6-check.mjs:15`-`:22` and `:85`-`:96`: `screenOf(id)` (`s.world.toGlobal(position)` plus `s.app.canvas.getBoundingClientRect()`; the scene method `worldToScreen` is private, `scene.ts:4947`), the rail Segment button, a click on the stamp, a click 110 px above it. The number drops by 1.
  3. The rail Undo button gives it back.
  Screenshot: `T04-open-ports`.
- **Size:** about 20 lines.

### T05. The route markers in the scene
- **Depends on:** T04 (both tasks edit `scene.ts`; they run one after the other).
- **Files:** `packages/render/src/scene.ts` (a new private field, two public methods, a few lines in `redrawOverlay` at `:5252`, two event listeners next to `:703`), `packages/render/src/index.ts` only if the marker type must be exported.
- **Shapes:**
  ```ts
  export interface RouteMarker { world: Vec2; kind: 'start' | 'target' }
  setRouteMarkers(markers: readonly RouteMarker[]): void   // replaces the list and redraws the overlay
  clearRouteMarkers(): void                                 // empties the list and redraws the overlay
  ```
  A `target` marker is a ring (radius `OPEN_PORT_RADIUS_SCREEN_PX * 1.9` in screen px, 2 px stroke, no fill) in the accent color `0x00e5ff` of the selection box (`scene.ts:5272`). A `start` marker is a filled square of the same size with a white ring. The sizes divide by `this.world.scale.x`, as the open-port dots do.
  - Neither method calls `markDirty` (`scene.ts:1133`). A marker is not an edit. A false unsaved mark would fire the close guard.
  - The scene also empties the marker list on the events `documentActivated` and `pageChanged` (`scene.ts:509`, `:513`; the listener pattern is at `:703`). Reason: a marker belongs to one document and one page.
  - The markers belong to the active document. Not verified: where the field must live for a second open document. The task lead puts the field on `SketchDocument` (`packages/render/src/document.ts`) if the other overlay fields live there, else on the scene. The lead names the choice in the commit body.
- **Must not touch:** the dots of the open ports, the selection box, the undo state, `serializeDocument`, `markDirty`.
- **Verify:** core tests; `pnpm build`. Browser check `t05-check.mjs`: open the PDF, place stamps through the setup (Auto-place, as in `p6-check.mjs`), then:
  1. Read `getDocuments()` and keep the `isDirty` value of the active document (call it `d0`).
  2. Call `setRouteMarkers` through the scene API on 2 open ports. Take two screenshots of the clipped canvas region around a port (before and after) and check that the pixel buffers differ.
  3. `clearRouteMarkers()` gives the first buffer back.
  4. `exportProject()` is equal before and after. The rail Undo button state is unchanged.
  5. `getDocuments()[active].isDirty` equals `d0` after `setRouteMarkers` and after `clearRouteMarkers` (A7).
  6. Set markers, then call `setPageIndex` or switch the document tab if the PDF allows it (with one page, emit the clear through `documentActivated`: open the document list and click the same tab). The markers go. If the check cannot make the event, it reports that step as "not verified because <reason>".
  Screenshot: `T05-markers`.
- **Size:** about 55 lines.

### T06. The pure logic of the dialog
- **Depends on:** T02, T03.
- **Files:** `packages/ui/src/components/routePlan.ts` (new), `packages/ui/src/routePlan.test.ts` (new; the UI tests of this package sit in `packages/ui/src/*.test.ts`, as `autoPlacePlan.test.ts` does).
- **Shapes:** section 3.3.
- **Must not touch:** `autoPlacePlan.ts`, any component.
- **Tests (UI):**
  - `startCandidates` keeps equipment stamps only and drops terminals and fittings. A stamp with no routing target on any port has `likelySource: true` and comes first. A stamp with a routing target comes after. The order inside a group is the order of `stamps`. Example: a boiler (no targets) before a fan coil unit (a `heating-water` target) even when the fan coil unit is placed first.
  - `looksLikeLoad` is true when a port has the routing target of the chosen type (open or with a segment), false for another type or no target.
  - `presetStart` returns the id when the selection holds exactly one equipment stamp, else null (two equipment stamps, zero, a terminal only).
  - `typeChoices` counts per type and sorts largest first, with a tie sorted by id. It leaves out `sanitary-waste` (P-R2-03).
  - `startPortChoices` puts the ports with the chosen routing target first and says the routing target of the others; a stamp with no own port gives one entry `Center`.
  - `roomLabel` order name, number, "Room <n>" / "Ruimte <n>".
  - `typeNameInText`: English keeps the library name; Dutch gives `toevoerlucht`, `retourlucht`, `afzuiglucht` for `supply-air`, `return-air`, `exhaust-air` and the library name for `heating-water`.
  - `routeSummaryLines` in English and Dutch: 1 port ("1 open port of Supply Air in 1 room"; "1 open aansluiting voor toevoerlucht in 1 ruimte"), 15 ports in 9 rooms, 0 ports, ports outside rooms (included and not included), ports left out, equipment ports, start stamp ports, multi-port stamps in mode 'one' and 'all'; plural forms; **the stamps scope** ("3 open ports of Supply Air on 3 selected stamps") has no room count (A10). No line holds a flow figure or a unit (P-R2-08): a test checks that no line matches `/CFM|GPM|dm³/`.
  - `routeText`: every key has an English and a Dutch text. The Dutch empty-state text holds `luchtbehandelingskast`. The "no open port" text holds `open aansluiting`. A test checks that no key is missing in one language.
  - Length: no single text has more than 140 characters, so the lines fit the narrow dialog (a test checks it).
- **Verify:** UI tests; `pnpm build`.
- **Size:** about 140 lines and 150 of tests. The task lead splits the summary and the text table into their own job (T06b) when the diff passes 150 lines of code. The lead records the split here.

### T07. The dialog shell, the menu entry and the refusal
- **Depends on:** T03.
- **Files:** `packages/ui/src/components/RouteDialog.tsx` (new), `packages/ui/src/components/MenuButton.tsx` (one prop and one item, next to `:147`-`:156`), `packages/ui/src/App.tsx` (state `routeOpen` next to `:436`, the prop at `:1452`, the dialog next to `:1602`), `packages/ui/src/theme.css` (a class `.mep-modal--route`, narrow width), `packages/ui/src/index.ts` only if the other dialogs are exported there.
- **Shapes:**
  ```ts
  export interface RouteDialogProps {
    sceneRef: RefObject<SketchScene | null>;
    roomTypes: RoomType[];
    language: 'en' | 'nl';
    onClose: () => void;
  }
  ```
  The menu item reads "Route network…". It is disabled without a PDF (`pdfLoaded`, `App.tsx:1446`), as "Export rooms to Excel…" is (`MenuButton.tsx:139`). The dialog passes `closeOnBackdropClick={false}` to `Dialog` (P-R2-04). The dialog calls `scene.getPageCount()` when it opens and again on the scene events `pageChanged` and `documentActivated` (the pattern of `AutoPlaceDialog.tsx:190`-`:196`). When `routePageProblem(count, language)` returns a message, the dialog shows only that message, with `data-testid="route-refusal"`, and a Close button. Otherwise it shows a placeholder body `data-testid="route-body"` that T08 fills.
- **Must not touch:** the Auto-place dialog, `Dialog.tsx`, the order of the other menu items.
- **Verify:** UI tests; `pnpm build`. Browser check `t07-check.mjs`: start, `openPdf('/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf')`; the item "Route network…" is enabled (match with `^\s*Route network…\s*$`); a click opens `.mep-modal--route` with `route-body`; Escape closes it. A second open and a Close-button click close it too. The item is disabled before a PDF is open (a second page load, no `openPdf`). The refusal with the real DOM: the check replaces `window.__mepSketchScene.getPageCount` with a function that returns 3 (a stub of one method; it proves the wiring of the message only, not a real multi-page PDF), opens the dialog, and reads `route-refusal` text, which holds "3 pages". The check marks this step as `wiring only`. A step with a stub in Dutch: set `localStorage['mepapp.settings.labelLanguage.v1']` to `nl`, reload, open the PDF again, and read the Dutch refusal text. The step with a real multi-page PDF is in T11. Backdrop: the check clicks the backdrop once on purpose (a point of `.mep-modal-backdrop` outside `.mep-modal`) and checks that the dialog stays open (P-R2-04). Screenshots: `T07-menu`, `T07-refusal`.
- **Size:** about 90 lines.

### T08. The dialog inputs: start stamp, start port, network type
- **Depends on:** T06, T07.
- **Files:** `packages/ui/src/components/RouteDialog.tsx`.
- **What it adds** (in `route-body`). All texts come from `routeText(language, ...)`. Library names (stamp names, network type names) stay English, as in the library.
  - A select `data-testid="route-start"` of `startCandidates(scene.listStamps())`. It has two option groups: "Likely sources" and "Has ports that wait for routing" (P-R2-02). The option text: the stamp name (the dialog gets `stampName` like `AutoPlaceDialog.tsx`; if the definition is unknown, the id) and a number to tell equal names apart. The select is preset by `presetStart(scene.getSelection())`. With no equipment stamp, the body says "Place an equipment stamp first, for example an air handling unit, a fan, a boiler or a chiller." (nl: "Plaats eerst een apparaat, bijvoorbeeld een luchtbehandelingskast, een ventilator, een ketel of een koelmachine.") and shows no other input.
  - A warning line `data-testid="route-start-warning"` under the select. It shows when `looksLikeLoad(startStamp, networkTypeId)` is true: "This stamp has ports that wait for Supply Air. It can be a load (for example a fan coil unit), not a source. You can still use it." It blocks nothing (R3 does the start check).
  - A select `data-testid="route-port"` from `startPortChoices` (names; `Center` for a stamp with no own port). The ports whose routing target is the chosen type come first, and the first of them is the default. When no port matches, the first port is the default. A note `data-testid="route-port-note"` shows when the chosen port has a routing target of another type: "This port waits for Exhaust Air, not Supply Air."
  - A select `data-testid="route-type"` from `typeChoices(...)`, with the count in the option text and the name from `scene.getNetworkTypes()` or the library (English). The select does not list `sanitary-waste` (P-R2-03). Default: the type with the most open ports. With no open port in the drawing, the select is empty and a line says "No open port waits for routing. Run Auto-place or set a routing target in Properties."
  - `RouteDialog` gets one more prop: `stampName: (definitionId: string) => string | null` (the same prop as `AutoPlaceDialog`). `App.tsx` passes the same function as at `:1609`-`:1612`.
- **Must not touch:** the scope part (T09a), the scene.
- **Verify:** UI tests; `pnpm build`. Browser check `t08-check.mjs` through real inputs, clicks only inside `.mep-modal` while the dialog is open:
  1. Auto-place (as in `p6-check.mjs`) so that open ports of Supply Air exist. Place one equipment stamp from the stamp picker (an air handling unit) and click it on the canvas so that it is selected. Place one more equipment stamp whose port has a routing target (set it in Properties as `p6-check.mjs:72` does) to be the "load".
  2. Open the dialog. `route-start` shows the air handling unit as selected, in the group "Likely sources". The load comes in the second group.
  3. `selectOption` on `route-start` to the load: `route-start-warning` shows. Back to the air handling unit: it goes.
  4. `selectOption` on `route-port` changes the port; a port with another routing target shows `route-port-note`.
  5. `selectOption` on `route-type` changes the type; the select has no Sanitary Waste option.
  6. A drawing with no equipment stamp shows the message.
  7. Narrow dialog: `open({ width: 400, height: 900 })`: the check reads `scrollWidth <= clientWidth` of `.mep-modal--route` in English and in Dutch (language set through `localStorage` as in T07). No horizontal overflow.
  Screenshots: `T08-inputs` at 1600 px, `T08-inputs-narrow` at 400 px, `T08-inputs-nl` at 400 px.
- **Size:** about 140 lines. If it passes 150, the task lead splits the warnings (`route-start-warning`, `route-port-note`) into a job T08b.

### T09a. The scope, the room list and the summary
- **Depends on:** T08.
- **Files:** `packages/ui/src/components/RouteDialog.tsx`, `packages/ui/src/theme.css` (the room list rows).
- **What it adds:**
  - A radio group `data-testid="route-scope"`: "Rooms" (default) and "Selected stamps". The second one is enabled only when the selection held at least one stamp other than the start stamp when the dialog opened. The backdrop blocks the canvas, so the selection cannot change while the dialog is open. The dialog reads `scene.getSelection()` once at open.
  - Rooms scope: one call `findRoutePorts({ ..., rooms: listRooms() of the page, scope: { kind: 'rooms', roomIds } })`. The call gets all rooms of the page with the checked ids, and `perRoom` returns the count and `checked` for every room (A2). The unchecked rooms keep their counts in the list. A list of the rooms of the page (`scene.listRooms()` filtered by `scene.getPageIndex()`), each with a check box (`data-testid="route-room"`), `roomLabel`, the room type name (`roomTypeLabel`, as the Auto-place dialog does) and `perRoom[i].count`. All rooms are checked at first. Buttons "All" and "None". A drawing with no rooms: the line "No rooms yet. Run Detect rooms in Auto-place, or use the selected stamps."
  - A check box `data-testid="route-outside"`, "Include ports outside rooms", on by default (P-R2-05). It sets `includeOutsideRooms`. A line next to it shows `outsideRooms`.
  - A check box `data-testid="route-all-ports"`, "Use all ports of stamps with 2 ports of the same type", off by default. It sets `portsPerStamp: 'all'`. It shows only when `multiPortStamps` is above 0.
  - The result lines `data-testid="route-summary"` from `routeSummaryLines(findRoutePorts(...), ...)`. In the stamps scope the call is made with `scope: { kind: 'stamps', stampIds }`.
  - The data reads once when the dialog opens, and again on each change of an input. T09b adds the scene events.
- **Must not touch:** the scene, the finder, the markers.
- **Verify:** UI tests; `pnpm build`. Browser check `t09a-check.mjs` through real inputs (clicks only inside `.mep-modal` while the dialog is open; Shift+click on the canvas happens before the dialog opens):
  1. Detect rooms, Auto-place the example supply air rule (as in `p6-check.mjs`), place an air handling unit, select it, open the dialog.
  2. The summary shows the count that the check computes from `listStamps()` and `listRooms()` in the page.
  3. Unchecking one room with a real click lowers the count by that room's count; the room keeps its count in the list. `None` with `route-outside` on gives the number of ports outside rooms; `None` with `route-outside` unchecked gives 0. `All` gives the first number again.
  4. Switch to "Selected stamps" (the check selected 3 grilles with Shift+click before it opened the dialog) and the count is 3, with the stamps wording.
  5. A multi-port stamp: place an equipment stamp with two ports, set the same routing target on both in Properties (`p6-check.mjs:72`), open the dialog. The summary shows the multi-port line and the count has one port from it. `route-all-ports` on adds one port.
  Screenshots: `T09a-rooms`, `T09a-selection`.
- **Size:** about 140 lines.

### T09b. The markers and the refresh on events
- **Depends on:** T05, T09a.
- **Files:** `packages/ui/src/components/RouteDialog.tsx`.
- **What it adds:**
  - An effect that calls `scene.setRouteMarkers` with the start port (`start`) and the target ports (`target`) of the last finder result. The cleanup calls `scene.clearRouteMarkers()`. The effect runs on every change of the input.
  - The data refreshes on the scene events `drawingChanged`, `roomsChanged`, `pageChanged`, `documentActivated` (the pattern of `AutoPlaceDialog.tsx:190`-`:196`).
- **Must not touch:** the scene (T05 is done), the finder, the inputs of T08 and T09a.
- **Verify:** UI tests; `pnpm build`. Browser check `t09b-check.mjs`:
  1. Open the dialog (setup as in T09a). The pixel buffer of the canvas region around a target port differs from the buffer after Escape; the markers go on Escape and on the Close button.
  2. `getDocuments()` `isDirty` is the same before the dialog opens and after it closes (A7).
  3. Unchecking a room removes the markers of that room (a buffer comparison around a port of that room).
  4. Markers stay while the dialog is open and the user clicks inside the dialog only. The check does not click the backdrop.
  Screenshot: `T09b-markers` (dialog open, plan visible behind it).
- **Decision for the task lead (provisional, P-R2-09):** the backdrop dims the markers by 50 %. If the UI reviewer cannot see them in `T09b-markers`, the task adds an optional prop `backdropClassName` to `Dialog.tsx` (about 5 lines) and a CSS rule that dims the backdrop less for `.mep-modal--route`. Reason: this is a layout detail that is easy to reverse.
- **Size:** about 60 lines.

### T11. The part check with the real PDF
- **Depends on:** T04, T09b.
- **Files:** `.claude/roadmap/browser/r2-check.mjs` (new). No product code.
- **What it does.** The script imports `lib.mjs` with an absolute path and passes the PDF path to `openPdf(path)`. It never reads `MEPAPP_PDF`. The main PDF is `/root/MepApp/fixtures/pdfs/plattegrond begane grond 10A.pdf` (the drawing that part 1 and the room detection used). The default `01_arch_first_floor.pdf` serves as a second run if time allows.
  1. Open the PDF, detect rooms, run Auto-place with the example supply air rule and the example toilet exhaust rule (as `p3-check.mjs` does), place an air handling unit and select it.
  2. Save the baseline: `JSON.stringify(exportProject())`, the keys of `localStorage`, `getDrawingSummary().canUndo`, and `isDirty` of the active document in `getDocuments()`.
  3. Open the dialog through the menu. Check the preset start stamp, the type select (Supply Air first), the rooms list, the summary against an independent count from `listStamps()`.
  4. Uncheck rooms with real clicks, switch the scope with a real click, change the type with `selectOption`. After each step the summary equals the independent count. All clicks stay inside `.mep-modal`.
  5. Close with Escape and with the Close button (two runs).
  6. Compare with the baseline: the project JSON, the `localStorage` keys, `canUndo` and `isDirty` are equal (R2 stores nothing and marks nothing).
  7. Dutch run, after step 6 (it changes `localStorage`): set `mepapp.settings.labelLanguage.v1` to `nl`, reload, open the dialog, and check the Dutch texts and `scrollWidth <= clientWidth` at 400 px.
  8. Page count: open each of the 9 PDFs of `/root/MepApp/fixtures/pdfs/` in turn, each with `openPdf(path)` in a new page (one Chromium page at a time), and read `getPageCount()`. The files are `00_arch_ground_floor.pdf`, `00_arch_ground_floor_edit.pdf`, `01_arch_first_floor.pdf`, `Example_1.pdf`, `Example_2.pdf`, `Example_3.pdf`, `Test_doc.pdf`, `arch_simple_A4.pdf` and `plattegrond begane grond 10A.pdf`. If one file has more than 1 page, open it and check that the dialog shows the refusal text. If none has, report **NEEDS_CONTEXT** for this step: "no real multi-page PDF in the fixtures". Nobody makes a fake PDF. The wiring step of T07 stays as the only proof of the message in the DOM.
  9. `no page errors` (`finish()` of `lib.mjs`).
- **Screenshots** (the task lead uploads them to the dashboard): `T11-dialog-rooms`, `T11-dialog-rooms-unchecked`, `T11-dialog-selection`, `T11-markers-on-plan`, `T11-narrow-400`, `T11-narrow-400-nl`, and `T11-refusal` if a real multi-page PDF exists.
- **Verify:** core tests; UI tests; `pnpm build`; `node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r2-check.mjs` exits with code 0 (or 1 only for the missing multi-page step, which the tester reports as NEEDS_CONTEXT in the summary).
- **After the check** the director marks R2 done in this file: the commit hash of each task and the verification summary, in the style of `auto-routing.md` §9.

## 6. Verification summary

| Task | Core tests | UI tests | `pnpm build` | Browser check | Screenshots |
|---|---|---|---|---|---|
| T01 | yes | no | yes | no | none |
| T02 | yes | no | yes | no | none |
| T03 | yes | no | yes | no | none |
| T04 | yes | yes | yes | `t04-check.mjs` | `T04-open-ports` |
| T05 | yes | no | yes | `t05-check.mjs` | `T05-markers` |
| T06 | no | yes | yes | no | none |
| T07 | no | yes | yes | `t07-check.mjs` | `T07-menu`, `T07-refusal` |
| T08 | no | yes | yes | `t08-check.mjs` | `T08-inputs`, `T08-inputs-narrow`, `T08-inputs-nl` |
| T09a | no | yes | yes | `t09a-check.mjs` | `T09a-rooms`, `T09a-selection` |
| T09b | no | yes | yes | `t09b-check.mjs` | `T09b-markers` |
| T11 | yes | yes | yes | `r2-check.mjs` | `T11-*` |

The check scripts live in the work folder of the task, except `r2-check.mjs`, which stays in `.claude/roadmap/browser/` for later parts. Each check imports `lib.mjs` with an absolute path.

## 7. Where R2 stops and R3 starts

R2 gives: the route input (start stamp, start port, network type, scope), the pure finder (`openPortsOf`, `findRoutePorts`), the refusal of a multi-page PDF, and the markers on the plan. It also gives two soft notes about the start (a stamp that looks like a load, a start port with another routing target). They block nothing.

R3 adds to the dialog: the checks of the start (the stamp is equipment; the start port has none or one segment; the start port has no segment of another type; the port group joins no other type; the network that the start port touches has no second equipment stamp). R3 also changes `computeNetworks` (D-R3-01 A) and passes the start stamp as `rootElementId` (D-R3-02 A). The state of the dialog (the start stamp id and the port id) is the input that R3 and R6 read, so R3 must not rename the fields of `RouteDialog` state without a note. R3 can replace the soft notes with its hard checks. R3 also asks Q-R2-01 again if it needs a source/load field.

R6 adds the "Route" button, the preview, the removal of marked items and the foreign-type check (the overview, section 3). R6 decides Q-R2-02 (pipe side) before the first water run. R2 builds none of them.

## 8. Risks and what is not verified

- The fixture PDFs: the page count of each file is not verified. A text search of the files (`grep -c "/Type /Page"`) is not reliable, because the page objects can sit in compressed object streams. T11 step 8 reads the count in the app.
- The markers under a 50 % dim may be hard to see. T09b has the provisional fix.
- Rooms from name matching can have a wrong room type, and detection can miss a room (`roadmap-overview.md`, risk "Room detection quality"). A port in a missed room counts in `outsideRooms`. With P-R2-05 it is a target port by default, and the summary shows its number, so the user sees it.
- Source or load: no stamp data tells them apart (P-R2-02, Q-R2-01). A fan coil unit with no routing target set yet looks like a source. The warning only shows when the unit has the routing target of the chosen type. Not verified: how many real drawings have equipment stamps with no routing targets on their ports.
- Multi-port stamps: the nearest-port rule (P-R2-01) can still choose the return port. R2 cannot know the pipe side (Q-R2-02). It only keeps one run from joining both ports.
- The Dutch words (P-R2-07) and the Dutch text lengths are not verified by a Dutch speaker. The UI test checks the length; the browser step checks the overflow at 400 px.
- `listStamps()` builds the port map on every call (`scene.ts:1473`-`:1476`). For a drawing with thousands of stamps the dialog would call it on each change event. Not measured. If the check shows a delay, T09b caches the stamp list until `drawingChanged`.
- Two documents (two open PDF files): the dialog works on the active document only (`this.doc`). The markers clear on `documentActivated` (T05). Not verified: where T05 keeps the marker field for a second open document (see T05). T11 does not test it.
- The status bar chip of open ports (`StatusBar.tsx:95`-`:105`) does not open the dialog in R2. This is a later convenience and needs no decision.

## 9. Notes for the director

- `rules.md` §4 says `Dialog.tsx` renders `div.mep-modal` with no `role="dialog"`. The code has `role="dialog"` and `aria-label` (`packages/ui/src/components/Dialog.tsx:40`), and `p6-check.mjs:39` uses `getByRole('dialog', ...)` on a picker. The rule is out of date. Please edit `rules.md`. The R2 checks use `.mep-modal` and do not depend on either form.
- `rules.md` §4 does not say that `Dialog` closes on a backdrop click (`Dialog.tsx:39`) and has the prop `closeOnBackdropClick` (`:13`). A short line there would help every browser check. The R2 plan has the rule in section 5.
- `rules.md` §5 says `MEPAPP_PDF` is a setting of the environment. `lib.mjs:14` reads it once at import, and `rules.md` §5 forbids an environment variable before the command. So a check must pass the path to `openPdf(path)` (`lib.mjs:65`). Please add this line to `rules.md` §5.
- `rules.md` §2 says the PDFs are in `/root/MepApp/fixtures/pdfs/`. The folder holds 9 PDFs and `README.md`.
- The plan file is untracked. The director commits it (round 1 of 2).
