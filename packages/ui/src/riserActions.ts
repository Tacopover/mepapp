import {
  attachMember,
  deleteRiser,
  detachMember,
  makeRiser,
  mmToPt,
  moveRiser,
  nextRiserLabel,
  ptToMm,
  riserGraphReach,
  type BuildingFile,
  type BuildingSheet,
  type NetworkType,
  type PageFrame,
  type Riser,
  type RiserError,
  type RiserMember,
  type RiserPendingOp,
  type SheetSummary,
  type Vec2,
} from '@mepapp/core';
import type { RiserAnchor, RiserMark } from '@mepapp/render';

export const HINT_NO_SCALE = 'Set the scale of this page first.';
export const HINT_TWO_TYPES = 'The segments here have different types. Change the type of the run first.';
export const HINT_NOT_IN_BUILDING = 'This sheet is not on a level of the open building.';
export const LINE_UP_NOTE = 'Sheets line up only if the PDFs share the same origin and orientation.';

const TEXT_MAKE_FAILED = 'Could not make the riser. Try again.';
const TEXT_NOT_IN_RISER = 'This fitting is not part of a riser.';
const TEXT_RISER_GONE = 'This riser does not exist any more.';
const TEXT_JOIN_FAILED = 'Could not join the riser.';

/** The sheet of the open building that the shown page is: sheet.projectUuid === projectUuid && sheet.pageIndex === pageIndex. Null when file or projectUuid is null or nothing matches. */
export function activeSheetOf(file: BuildingFile | null, projectUuid: string | null, pageIndex: number): BuildingSheet | null {
  if (file === null || projectUuid === null) return null;
  return file.sheets.find((sheet) => sheet.projectUuid === projectUuid && sheet.pageIndex === pageIndex) ?? null;
}

export interface RiserMenuModel {
  /** null: the entry is not shown. disabledHint null: enabled. A string: greyed, the string is the second grey line. */
  makeRiser: { disabledHint: string | null } | null;
  detach: boolean;
  deleteRiser: boolean;
}

export const NO_RISER_MENU: RiserMenuModel = { makeRiser: null, detach: false, deleteRiser: false };

/** fittingContext null = the target is not a fitting. markedRiserId = the riser mark of that fitting on the shown page, or null. scaleHint = a refusal text from makeRiserScaleHint, or null. Rules, in order: file null or fittingContext null -> NO_RISER_MENU. markedRiserId set -> { makeRiser: null, detach: true, deleteRiser: true }. segmentCount 0 -> NO_RISER_MENU. Else makeRiser is shown, with disabledHint: sheet null -> HINT_NOT_IN_BUILDING; else hasScale false -> HINT_NO_SCALE; else a non-empty scaleHint -> scaleHint; else networkTypeIds.length > 1 -> HINT_TWO_TYPES; else null. detach and deleteRiser false. */
export function riserMenuModel(args: {
  file: BuildingFile | null;
  sheet: BuildingSheet | null;
  hasScale: boolean;
  fittingContext: { segmentCount: number; networkTypeIds: string[] } | null;
  markedRiserId: string | null;
  scaleHint?: string | null;
}): RiserMenuModel {
  const { file, sheet, hasScale, fittingContext, markedRiserId, scaleHint } = args;
  if (file === null || fittingContext === null) return NO_RISER_MENU;
  if (markedRiserId !== null) return { makeRiser: null, detach: true, deleteRiser: true };
  if (fittingContext.segmentCount === 0) return NO_RISER_MENU;
  let disabledHint: string | null = null;
  if (sheet === null) disabledHint = HINT_NOT_IN_BUILDING;
  else if (!hasScale) disabledHint = HINT_NO_SCALE;
  else if (scaleHint) disabledHint = scaleHint;
  else if (fittingContext.networkTypeIds.length > 1) disabledHint = HINT_TWO_TYPES;
  return { makeRiser: { disabledHint }, detach: false, deleteRiser: false };
}

/** Frame of the shown page for the core functions: widthPt/heightPt = displayed size, pageUnitsPerRealUnit = the calibration or null. */
export type ShownPage = { widthPt: number; heightPt: number; pageUnitsPerRealUnit: number | null };

export type RiserActionResult = { ok: true; file: BuildingFile; message: string; warning?: string } | { ok: false; text: string };

function levelNameOf(file: BuildingFile, sheet: BuildingSheet): string {
  return file.levels.find((level) => level.id === sheet.levelId)?.name ?? 'this level';
}

function ppmmOf(page: ShownPage | null): number | null {
  if (page === null || page.pageUnitsPerRealUnit === null || !(page.pageUnitsPerRealUnit > 0)) return null;
  return page.pageUnitsPerRealUnit;
}

/** Make riser. label = nextRiserLabel(file, networkType.name). Calls makeRiser(file, { id: args.id, name: label, networkType, sheetId: sheet.id, fittingId, fittingPt, frame: page }). message = `${label} made on ${levelName}. ${LINE_UP_NOTE}`. levelName = the name of the level of the sheet in file.levels (fallback 'this level'). Error texts: 'scale-unknown' -> HINT_NO_SCALE; 'unknown-sheet' -> HINT_NOT_IN_BUILDING; 'duplicate-id' -> 'Could not make the riser. Try again.' */
export function makeRiserAction(
  file: BuildingFile,
  args: { id: string; networkType: NetworkType; sheet: BuildingSheet; fittingId: string; fittingPt: Vec2; page: ShownPage },
): RiserActionResult {
  const label = nextRiserLabel(file, args.networkType.name);
  const result = makeRiser(file, {
    id: args.id,
    name: label,
    networkType: args.networkType,
    sheetId: args.sheet.id,
    fittingId: args.fittingId,
    fittingPt: args.fittingPt,
    frame: args.page,
  });
  if (typeof result === 'string') {
    if (result === 'scale-unknown') return { ok: false, text: HINT_NO_SCALE };
    if (result === 'unknown-sheet') return { ok: false, text: HINT_NOT_IN_BUILDING };
    return { ok: false, text: TEXT_MAKE_FAILED };
  }
  return { ok: true, file: result, message: `${label} made on ${levelNameOf(file, args.sheet)}. ${LINE_UP_NOTE}` };
}

/** The riser whose member is { sheetId, fittingId }, or null. */
export function riserOfFitting(file: BuildingFile, sheetId: string, fittingId: string): Riser | null {
  return file.risers.find((riser) => riser.members.some((member) => member.sheetId === sheetId && member.fittingId === fittingId)) ?? null;
}

/** Detach the member of sheet from the riser. When the riser had only that member, the riser is deleted (deleteRiser) and message = `${label} deleted. Its fittings stay on the sheets.`; else message = `${label} detached from ${levelName}.` Unknown riser or no member -> { ok:false, text:'This fitting is not part of a riser.' } */
export function detachAction(file: BuildingFile, riserId: string, sheet: BuildingSheet): RiserActionResult {
  const riser = file.risers.find((candidate) => candidate.id === riserId);
  if (riser === undefined || !riser.members.some((member) => member.sheetId === sheet.id)) return { ok: false, text: TEXT_NOT_IN_RISER };
  if (riser.members.length === 1) {
    return { ok: true, file: deleteRiser(file, riserId), message: `${riser.name} deleted. Its fittings stay on the sheets.` };
  }
  return { ok: true, file: detachMember(file, riserId, sheet.id), message: `${riser.name} detached from ${levelNameOf(file, sheet)}.` };
}

/** Undo removed the fitting of a riser member: detach that member like detachAction (last member deletes the riser). Null when the fitting is no member on the sheet. */
export function undoAttachAction(file: BuildingFile, sheet: BuildingSheet, fittingId: string): RiserActionResult | null {
  const riser = riserOfFitting(file, sheet.id, fittingId);
  return riser === null ? null : detachAction(file, riser.id, sheet);
}

/** Delete the riser. message = `${label} deleted. Its fittings stay on the sheets.` Unknown riser -> ok:false text 'This riser does not exist any more.' */
export function deleteRiserAction(file: BuildingFile, riserId: string): RiserActionResult {
  const riser = file.risers.find((candidate) => candidate.id === riserId);
  if (riser === undefined) return { ok: false, text: TEXT_RISER_GONE };
  return { ok: true, file: deleteRiser(file, riserId), message: `${riser.name} deleted. Its fittings stay on the sheets.` };
}

/** Text for a refused delete of a riser fitting: `This fitting belongs to ${label}. Detach the riser first, or use Delete riser.` */
export function removalRefusedText(label: string): string {
  return `This fitting belongs to ${label}. Detach the riser first, or use Delete riser.`;
}

/** The frame of the first member of the riser from the saved summaries. Null when: the sheet is unknown, the sheet has no projectUuid, no summary, no page entry, or widthPt/heightPt is not > 0, or the page is not calibrated / pageUnitsPerRealUnit not > 0. */
export function firstMemberFrame(file: BuildingFile, riser: Riser, summaries: ReadonlyMap<string, SheetSummary>): PageFrame | null {
  const member = riser.members[0];
  if (member === undefined) return null;
  const sheet = file.sheets.find((candidate) => candidate.id === member.sheetId);
  if (sheet === undefined || sheet.projectUuid === null) return null;
  const page = summaries.get(sheet.projectUuid)?.pages[String(sheet.pageIndex)];
  if (page === undefined || !(page.widthPt > 0) || !(page.heightPt > 0)) return null;
  const scale = page.pageUnitsPerRealUnit;
  if (!page.calibrated || scale === null || !(scale > 0)) return null;
  return { widthPt: page.widthPt, heightPt: page.heightPt, pageUnitsPerRealUnit: scale };
}

function attachErrorText(file: BuildingFile, riser: Riser | undefined, page: ShownPage, error: RiserError): string {
  if (riser === undefined) return TEXT_RISER_GONE;
  switch (error) {
    case 'level-taken':
      return `${riser.name} already has a part on this level.`;
    case 'scale-unknown': {
      if (ppmmOf(page) === null) return HINT_NO_SCALE;
      const firstSheetName = file.sheets.find((sheet) => sheet.id === riser.members[0]?.sheetId)?.displayName ?? 'the first sheet';
      return `The page size of ${firstSheetName} is not known yet. Save that sheet, then draw into the ring again.`;
    }
    case 'type-differs':
      return `${riser.name} takes only ${riser.networkType.name}.`;
    case 'unknown-riser':
      return TEXT_RISER_GONE;
    default:
      return TEXT_JOIN_FAILED;
  }
}

/** Join by drawing into the ring. Calls attachMember(file, riserId, { levelId: sheet.levelId, sheetId: sheet.id, pageIndex: sheet.pageIndex, fittingId }, { first: firstFrame, this: page }, { segmentNetworkTypeId }). message = `${label} attached on ${levelName}.`; warning = the first warning of attachMember (if any) and then message gets ' ' + warning appended. Error texts ('<label>' is the riser label): 'level-taken' -> `${label} already has a part on this level.`; 'scale-unknown' -> if page.pageUnitsPerRealUnit is null or not > 0: HINT_NO_SCALE, else (the first sheet is the problem) `The page size of ${firstSheetName} is not known yet. Save that sheet, then draw into the ring again.` where firstSheetName = displayName of the sheet of riser.members[0] (fallback 'the first sheet'); 'type-differs' -> `${label} takes only ${riser.networkType.name}.`; 'unknown-riser' -> 'This riser does not exist any more.'; others 'Could not join the riser.' */
export function attachAction(
  file: BuildingFile,
  args: { riserId: string; sheet: BuildingSheet; fittingId: string; segmentNetworkTypeId: string | null; page: ShownPage; firstFrame: PageFrame | null },
): RiserActionResult {
  const riser = file.risers.find((candidate) => candidate.id === args.riserId);
  const member: RiserMember = {
    levelId: args.sheet.levelId,
    sheetId: args.sheet.id,
    pageIndex: args.sheet.pageIndex,
    fittingId: args.fittingId,
  };
  const result = attachMember(
    file,
    args.riserId,
    member,
    { first: args.firstFrame, this: args.page },
    { segmentNetworkTypeId: args.segmentNetworkTypeId },
  );
  if (riser === undefined || typeof result === 'string') {
    return { ok: false, text: attachErrorText(file, riser, args.page, typeof result === 'string' ? result : 'unknown-riser') };
  }
  const warning = result.warnings[0];
  const base = `${riser.name} attached on ${levelNameOf(file, args.sheet)}.`;
  const message = warning === undefined ? base : `${base} ${warning}`;
  return { ok: true, file: result.file, message, ...(warning === undefined ? {} : { warning }) };
}

/** Marks for the shown sheet: one entry per riser member with member.sheetId === sheet.id, key = member.fittingId, value { riserId, name: riser.name, networkTypeId: riser.networkTypeId, anchorPt }. anchorPt = mmToPt(riser.anchorMm, { heightPt: page.heightPt, ppmm: page.pageUnitsPerRealUnit }) when page.pageUnitsPerRealUnit > 0; else fallbackPt(member.fittingId) ?? { x: 0, y: 0 }. */
export function buildRiserMarks(
  file: BuildingFile,
  sheet: BuildingSheet,
  page: ShownPage | null,
  fallbackPt: (fittingId: string) => Vec2 | null,
): Map<string, RiserMark> {
  const marks = new Map<string, RiserMark>();
  const ppmm = ppmmOf(page);
  for (const riser of file.risers) {
    for (const member of riser.members) {
      if (member.sheetId !== sheet.id) continue;
      const anchorPt =
        page !== null && ppmm !== null
          ? mmToPt(riser.anchorMm, { heightPt: page.heightPt, ppmm })
          : (fallbackPt(member.fittingId) ?? { x: 0, y: 0 });
      marks.set(member.fittingId, { riserId: riser.id, name: riser.name, networkTypeId: riser.networkTypeId, anchorPt });
    }
  }
  return marks;
}

/** Free anchors for the shown sheet: risers with at least one member and NO member whose levelId equals sheet.levelId. Needs page with pageUnitsPerRealUnit > 0 (else []). Order = file.risers order. label = riser.name, networkTypeName = riser.networkType.name, anchorPt = mmToPt(...) as above. */
export function buildRiserAnchors(file: BuildingFile, sheet: BuildingSheet, page: ShownPage | null): RiserAnchor[] {
  const ppmm = ppmmOf(page);
  if (page === null || ppmm === null) return [];
  const anchors: RiserAnchor[] = [];
  for (const riser of file.risers) {
    if (riser.members.length === 0) continue;
    if (riser.members.some((member) => member.levelId === sheet.levelId)) continue;
    anchors.push({
      riserId: riser.id,
      label: riser.name,
      networkTypeId: riser.networkTypeId,
      networkTypeName: riser.networkType.name,
      anchorPt: mmToPt(riser.anchorMm, { heightPt: page.heightPt, ppmm }),
    });
  }
  return anchors;
}

/** The Network label of the Fittings row of the member's fitting, as a one-element array; [] when it is missing. */
function fittingNetworksOf(file: BuildingFile, summaries: ReadonlyMap<string, SheetSummary>): (member: RiserMember) => string[] {
  return (member) => {
    const sheet = file.sheets.find((candidate) => candidate.id === member.sheetId);
    if (sheet === undefined || sheet.projectUuid === null) return [];
    const table = summaries.get(sheet.projectUuid)?.tables.find((candidate) => candidate.name === 'Fittings');
    if (table === undefined) return [];
    const pageColumn = table.headers.indexOf('Page');
    const idColumn = table.headers.indexOf('Id');
    const networkColumn = table.headers.indexOf('Network');
    const row = table.rows.find((cells) => cells[pageColumn] === sheet.pageIndex + 1 && cells[idColumn] === member.fittingId);
    const label = row?.[networkColumn];
    return typeof label === 'string' ? [label] : [];
  };
}

/** Type change over the building graph. `eventRiserIds` come from the scene event, `activeSheetId` is the sheet where the user changed the type. Steps:
 1. reach = riserGraphReach(file, { riserIds: eventRiserIds }, networksOf) with networksOf(member) = the Network label of the Fittings row (Page === sheet.pageIndex + 1 and Id === member.fittingId) in summaries.get(sheet.projectUuid).tables, as a one-element array; [] when the sheet, the summary, the table or the row is missing or the label is null.
 2. For each riser in reach.riserIds (file order): set networkTypeId = networkType.id and networkType = networkType. If riser.name equals `${oldType.name} riser <digits>` (old type = riser.networkType.name), rename it with nextRiserLabel(fileSoFar, networkType.name) (fileSoFar = the file with the earlier risers of this loop already changed; compute the label from it). Skip nothing else.
 3. Pending ops: for each reached riser and each member: add { seq, sheetId: member.sheetId, kind: 'retag', networkTypeId } unless (member.sheetId === activeSheetId AND the riser id is in eventRiserIds) (the scene already retagged that run). seq = (largest seq in riser.pending, or 0) + 1, growing by 1 for each op of that riser.
 4. message: `Type changed on ${n} ${n === 1 ? 'level' : 'levels'} for ${label}.` where label = the (new) name of eventRiserIds[0] and n = number of distinct levelId over the members of that riser. When eventRiserIds is empty or unknown: return { file, message: null }.
 A reached riser whose networkTypeId already equals networkType.id is left as it is (no ops, no rename). */
export function applyRiserTypeChange(
  file: BuildingFile,
  args: { eventRiserIds: string[]; networkType: NetworkType; activeSheetId: string; summaries: ReadonlyMap<string, SheetSummary> },
): { file: BuildingFile; message: string | null } {
  const known = args.eventRiserIds.filter((riserId) => file.risers.some((riser) => riser.id === riserId));
  if (known.length === 0) return { file, message: null };
  const reach = riserGraphReach(file, { riserIds: known }, fittingNetworksOf(file, args.summaries));
  let next = file;
  for (const riserId of reach.riserIds) {
    const current = next.risers.find((candidate) => candidate.id === riserId);
    if (current === undefined || current.networkTypeId === args.networkType.id) continue;
    const oldPrefix = `${current.networkType.name.trim()} riser `;
    const isOldPattern = current.name.startsWith(oldPrefix) && /^[1-9][0-9]*$/.test(current.name.slice(oldPrefix.length));
    const others = { ...next, risers: next.risers.filter((candidate) => candidate.id !== riserId) };
    const name = isOldPattern ? nextRiserLabel(others, args.networkType.name) : current.name;
    let seq = current.pending.reduce((largest, op) => Math.max(largest, op.seq), 0);
    const ops: RiserPendingOp[] = [];
    for (const member of current.members) {
      if (member.sheetId === args.activeSheetId && args.eventRiserIds.includes(riserId)) continue;
      seq += 1;
      ops.push({ seq, sheetId: member.sheetId, kind: 'retag', networkTypeId: args.networkType.id });
    }
    const changed: Riser = {
      ...current,
      name,
      networkTypeId: args.networkType.id,
      networkType: args.networkType,
      pending: [...current.pending, ...ops],
    };
    next = { ...next, risers: next.risers.map((candidate) => (candidate.id === riserId ? changed : candidate)) };
  }
  const eventRiser = next.risers.find((riser) => riser.id === args.eventRiserIds[0]);
  if (eventRiser === undefined) return { file: next, message: null };
  const levelCount = new Set(eventRiser.members.map((member) => member.levelId)).size;
  return {
    file: next,
    message: `Type changed on ${levelCount} ${levelCount === 1 ? 'level' : 'levels'} for ${eventRiser.name}.`,
  };
}

export interface LiveTarget { docId: string; heightPt: number; pageUnitsPerRealUnit: number }
export interface LiveMove { sheetId: string; sheetName: string; docId: string; fittingId: string; toPt: Vec2 }

/** Plan a move of the riser to toPt (pt of fromPage, the shown page of fromSheet). Order: riser unknown -> { ok:false, text: TEXT_RISER_GONE }; fromSheet not a member -> { ok:false, text: TEXT_NOT_IN_RISER }; ppmmOf(fromPage) null -> { ok:false, text: `Set the scale of ${fromSheet.displayName} to move ${riser.name}.` }. Else toMm = ptToMm(toPt, {heightPt: fromPage.heightPt, ppmm}). openSheetIds = ids of the OTHER members' sheets (look the sheet up in file.sheets by member.sheetId) for which liveTargetOf(sheet) is not null. r = moveRiser(file, riserId, toMm, fromSheet.id, openSheetIds). live = one LiveMove per r.applyNow entry: toPt = mmToPt(entry.toMm, {heightPt: target.heightPt, ppmm: target.pageUnitsPerRealUnit}), fittingId = the member's fittingId, docId from the target, sheetName = sheet.displayName. pendingCount = number of other members that are not live. message = live.length > 0 ? `${riser.name} moved to match the building.` : null. */
export function planRiserMove(
  file: BuildingFile,
  args: { riserId: string; fromSheet: BuildingSheet; toPt: Vec2; fromPage: ShownPage; liveTargetOf: (sheet: BuildingSheet) => LiveTarget | null },
): { ok: true; file: BuildingFile; live: LiveMove[]; pendingCount: number; message: string | null } | { ok: false; text: string } {
  const riser = file.risers.find((candidate) => candidate.id === args.riserId);
  if (riser === undefined) return { ok: false, text: TEXT_RISER_GONE };
  if (!riser.members.some((member) => member.sheetId === args.fromSheet.id)) return { ok: false, text: TEXT_NOT_IN_RISER };
  const ppmm = ppmmOf(args.fromPage);
  if (ppmm === null) return { ok: false, text: `Set the scale of ${args.fromSheet.displayName} to move ${riser.name}.` };
  const toMm = ptToMm(args.toPt, { heightPt: args.fromPage.heightPt, ppmm });
  const targets = new Map<string, { sheet: BuildingSheet; target: LiveTarget }>();
  for (const member of riser.members) {
    if (member.sheetId === args.fromSheet.id) continue;
    const sheet = file.sheets.find((candidate) => candidate.id === member.sheetId);
    if (sheet === undefined) continue;
    const target = args.liveTargetOf(sheet);
    if (target !== null) targets.set(sheet.id, { sheet, target });
  }
  const result = moveRiser(file, args.riserId, toMm, args.fromSheet.id, new Set(targets.keys()));
  const live: LiveMove[] = [];
  for (const entry of result.applyNow) {
    const found = targets.get(entry.sheetId);
    const member = riser.members.find((candidate) => candidate.sheetId === entry.sheetId);
    if (found === undefined || member === undefined) continue;
    live.push({
      sheetId: entry.sheetId,
      sheetName: found.sheet.displayName,
      docId: found.target.docId,
      fittingId: member.fittingId,
      toPt: mmToPt(entry.toMm, { heightPt: found.target.heightPt, ppmm: found.target.pageUnitsPerRealUnit }),
    });
  }
  const pendingCount = riser.members.filter(
    (member) => member.sheetId !== args.fromSheet.id && !live.some((move) => move.sheetId === member.sheetId),
  ).length;
  return {
    ok: true,
    file: result.file,
    live,
    pendingCount,
    message: live.length > 0 ? `${riser.name} moved to match the building.` : null,
  };
}

export interface RiserConflictInfo {
  riserId: string; fittingId: string; label: string; levelName: string;
  distanceMm: number; fittingPt: Vec2; anchorPt: Vec2;
}
export const CONFLICT_MOVE_HELP = 'Move the riser here: the riser and all other levels follow this fitting.';
export const CONFLICT_SNAP_HELP = 'Snap back: this fitting returns to the building position.';

/** Tolerance in pt for scene.riserConflicts: 0.5 * ppmm (the 0.5 mm rule of inConflict). Null when the page has no scale. */
export function conflictTolerancePt(page: ShownPage | null): number | null {
  const ppmm = ppmmOf(page);
  return ppmm === null ? null : 0.5 * ppmm;
}

/** null when the riser of the fitting is unknown (riserOfFitting on sheet.id) or the page has no scale. distanceMm = Math.max(1, Math.round(hypot(dx,dy) / ppmm)) (whole mm). levelName = levelNameOf(file, sheet). label = riser.name. */
export function riserConflictInfo(
  file: BuildingFile,
  sheet: BuildingSheet,
  conflict: { fittingId: string; fittingPt: Vec2; anchorPt: Vec2 },
  page: ShownPage | null,
): RiserConflictInfo | null {
  const riser = riserOfFitting(file, sheet.id, conflict.fittingId);
  const ppmm = ppmmOf(page);
  if (riser === null || ppmm === null) return null;
  const dx = conflict.fittingPt.x - conflict.anchorPt.x;
  const dy = conflict.fittingPt.y - conflict.anchorPt.y;
  return {
    riserId: riser.id,
    fittingId: conflict.fittingId,
    label: riser.name,
    levelName: levelNameOf(file, sheet),
    distanceMm: Math.max(1, Math.round(Math.hypot(dx, dy) / ppmm)),
    fittingPt: conflict.fittingPt,
    anchorPt: conflict.anchorPt,
  };
}

export function conflictTitle(label: string): string {
  return `${label} is not at the building position`;
}

export function conflictBody(info: RiserConflictInfo): string {
  return `On ${info.levelName}, the fitting is ${info.distanceMm} mm from where the building file puts ${info.label}.`;
}

export function conflictLaterText(label: string): string {
  return `${label} is not at the building position.`;
}
