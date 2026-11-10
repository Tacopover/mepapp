import type { NetworkType } from './network.js';
import type { Vec2 } from './geometry.js';
import type { BuildingFile } from './building.js';
import type { Riser, RiserMember, RiserPendingOp } from './riser.js';
import { type PageMmFrame, pageSizeMm, ptToMm } from './riser-coords.js';

export type RiserError = 'scale-unknown' | 'level-taken' | 'type-differs' | 'unknown-sheet' | 'unknown-riser' | 'duplicate-id';

/** The DISPLAYED page (after its own rotation). pageUnitsPerRealUnit null = the page has no scale. */
export interface PageFrame {
  widthPt: number;
  heightPt: number;
  pageUnitsPerRealUnit: number | null;
}

function roundMm(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

function scaleOf(frame: PageFrame): number | null {
  const scale = frame.pageUnitsPerRealUnit;
  return scale !== null && scale > 0 ? scale : null;
}

/** New riser with one member (the sheet's level, pageIndex of the sheet). flow 'unknown', topEnd 'member', bottomEnd 'member', endAllowanceMm 0, pending [], networkTypeId = networkType.id. anchorMm = ptToMm(fittingPt, {heightPt: frame.heightPt, ppmm}). Errors: 'scale-unknown' when frame.pageUnitsPerRealUnit is null (also when it is not > 0), 'unknown-sheet' when sheetId is not in file.sheets, 'duplicate-id' when a riser has that id. */
export function makeRiser(
  file: BuildingFile,
  args: { id: string; name: string; networkType: NetworkType; sheetId: string; fittingId: string; fittingPt: Vec2; frame: PageFrame },
): BuildingFile | RiserError {
  const ppmm = scaleOf(args.frame);
  if (ppmm === null) return 'scale-unknown';
  const sheet = file.sheets.find((candidate) => candidate.id === args.sheetId);
  if (sheet === undefined) return 'unknown-sheet';
  if (file.risers.some((riser) => riser.id === args.id)) return 'duplicate-id';
  const riser: Riser = {
    id: args.id,
    name: args.name,
    networkTypeId: args.networkType.id,
    networkType: args.networkType,
    anchorMm: ptToMm(args.fittingPt, { heightPt: args.frame.heightPt, ppmm }),
    flow: 'unknown',
    topEnd: 'member',
    bottomEnd: 'member',
    endAllowanceMm: 0,
    members: [{ levelId: sheet.levelId, sheetId: sheet.id, pageIndex: sheet.pageIndex, fittingId: args.fittingId }],
    pending: [],
  };
  return { ...file, risers: [...file.risers, riser] };
}

/** Adds member. Order of checks: 'unknown-riser'; 'level-taken' (a member already has member.levelId); 'type-differs' (opts.segmentNetworkTypeId is a string and differs from riser.networkTypeId; null/undefined = no check); 'scale-unknown' (frames.first or frames.this is null or has pageUnitsPerRealUnit null/not > 0). Warning (single string) when the page sizes in mm (pageSizeMm of each frame) differ by more than 1 % in width or height, relative to frames.first: `Page sizes differ by ${w} x ${h} mm: the sheets may not line up.` (w, h = absolute differences rounded to 0.1 mm). No warning at 1 % or less. Equal mm sizes at different scales give no warning. */
export function attachMember(
  file: BuildingFile,
  riserId: string,
  member: RiserMember,
  frames: { first: PageFrame | null; this: PageFrame | null },
  opts?: { segmentNetworkTypeId?: string | null },
): { file: BuildingFile; warnings: string[] } | RiserError {
  const riser = file.risers.find((candidate) => candidate.id === riserId);
  if (riser === undefined) return 'unknown-riser';
  if (riser.members.some((existing) => existing.levelId === member.levelId)) return 'level-taken';
  const segmentNetworkTypeId = opts?.segmentNetworkTypeId;
  if (typeof segmentNetworkTypeId === 'string' && segmentNetworkTypeId !== riser.networkTypeId) return 'type-differs';
  const first = frames.first;
  const current = frames.this;
  const firstScale = first === null ? null : scaleOf(first);
  const currentScale = current === null ? null : scaleOf(current);
  if (first === null || current === null || firstScale === null || currentScale === null) return 'scale-unknown';

  const firstSize = pageSizeMm(first.widthPt, first.heightPt, firstScale);
  const currentSize = pageSizeMm(current.widthPt, current.heightPt, currentScale);
  const widthDiff = Math.abs(currentSize.widthMm - firstSize.widthMm);
  const heightDiff = Math.abs(currentSize.heightMm - firstSize.heightMm);
  const warnings =
    widthDiff > 0.01 * firstSize.widthMm || heightDiff > 0.01 * firstSize.heightMm
      ? [`Page sizes differ by ${Math.round(widthDiff * 10) / 10} x ${Math.round(heightDiff * 10) / 10} mm: the sheets may not line up.`]
      : [];

  return {
    file: {
      ...file,
      risers: file.risers.map((candidate) =>
        candidate.id === riserId ? { ...candidate, members: [...candidate.members, { ...member }] } : candidate,
      ),
    },
    warnings,
  };
}

/** Only the listed fields change; undefined values in props are ignored; a blank (after trim) name is ignored (name trimmed). Unknown riser: file unchanged. endAllowanceMm that is not finite or negative is ignored. */
export function setRiserProps(
  file: BuildingFile,
  riserId: string,
  props: Partial<Pick<Riser, 'name' | 'shaftName' | 'flow' | 'sourceLevelId' | 'topEnd' | 'bottomEnd' | 'endAllowanceMm'>>,
): BuildingFile {
  const riser = file.risers.find((candidate) => candidate.id === riserId);
  if (riser === undefined) return file;
  const patch: Partial<Riser> = {};
  if (props.name !== undefined && props.name.trim() !== '') patch.name = props.name.trim();
  if (props.shaftName !== undefined) patch.shaftName = props.shaftName;
  if (props.flow !== undefined) patch.flow = props.flow;
  if (props.sourceLevelId !== undefined) patch.sourceLevelId = props.sourceLevelId;
  if (props.topEnd !== undefined) patch.topEnd = props.topEnd;
  if (props.bottomEnd !== undefined) patch.bottomEnd = props.bottomEnd;
  if (props.endAllowanceMm !== undefined && Number.isFinite(props.endAllowanceMm) && props.endAllowanceMm >= 0) {
    patch.endAllowanceMm = props.endAllowanceMm;
  }
  if (Object.keys(patch).length === 0) return file;
  return { ...file, risers: file.risers.map((candidate) => (candidate.id === riserId ? { ...candidate, ...patch } : candidate)) };
}

/** Removes the member of that sheetId, and the pending ops of that sheet. Unknown riser or sheet: file unchanged. */
export function detachMember(file: BuildingFile, riserId: string, sheetId: string): BuildingFile {
  const riser = file.risers.find((candidate) => candidate.id === riserId);
  if (riser === undefined || !riser.members.some((member) => member.sheetId === sheetId)) return file;
  const removed = riser.members.find((member) => member.sheetId === sheetId);
  const members = riser.members.filter((member) => member.sheetId !== sheetId);
  const next: Riser = {
    ...riser,
    members,
    pending: riser.pending.filter((op) => op.sheetId !== sheetId),
  };
  if (riser.sourceLevelId !== undefined && removed?.levelId === riser.sourceLevelId) delete next.sourceLevelId;
  return { ...file, risers: file.risers.map((candidate) => (candidate.id === riserId ? next : candidate)) };
}

/** Removes the hand-set flow: flow becomes 'unknown' and sourceLevelId is deleted. Unknown riser, or a riser that has no override (flow 'unknown' and no sourceLevelId): file unchanged (same object). */
export function clearRiserFlowOverride(file: BuildingFile, riserId: string): BuildingFile {
  const riser = file.risers.find((candidate) => candidate.id === riserId);
  if (riser === undefined) return file;
  if (riser.flow === 'unknown' && riser.sourceLevelId === undefined) return file;
  const next: Riser = { ...riser, flow: 'unknown' };
  delete next.sourceLevelId;
  return { ...file, risers: file.risers.map((candidate) => (candidate.id === riserId ? next : candidate)) };
}

/** Sets connectionHeightMm of the member with that sheetId. mm undefined removes the field. mm that is not finite or is negative: file unchanged. Unknown riser or sheet, or the value is already equal: file unchanged (same object). */
export function setMemberConnectionHeight(file: BuildingFile, riserId: string, sheetId: string, mm: number | undefined): BuildingFile {
  const riser = file.risers.find((candidate) => candidate.id === riserId);
  if (riser === undefined) return file;
  if (mm !== undefined && (!Number.isFinite(mm) || mm < 0)) return file;
  const member = riser.members.find((candidate) => candidate.sheetId === sheetId);
  if (member === undefined) return file;
  if (mm === undefined) {
    if (!('connectionHeightMm' in member)) return file;
  } else if (member.connectionHeightMm === mm) {
    return file;
  }
  const members = riser.members.map((candidate) => {
    if (candidate.sheetId !== sheetId) return candidate;
    const updated: RiserMember = { ...candidate };
    if (mm === undefined) delete updated.connectionHeightMm;
    else updated.connectionHeightMm = mm;
    return updated;
  });
  const next: Riser = { ...riser, members };
  return { ...file, risers: file.risers.map((candidate) => (candidate.id === riserId ? next : candidate)) };
}

/** Removes the riser. Unknown id: file unchanged. */
export function deleteRiser(file: BuildingFile, riserId: string): BuildingFile {
  if (!file.risers.some((riser) => riser.id === riserId)) return file;
  return { ...file, risers: file.risers.filter((riser) => riser.id !== riserId) };
}

/** toMm rounded to 0.01 mm (Math.round(v*100)/100, no -0). Sets riser.anchorMm to the rounded value. applyNow: one entry for each member that is in openSheetIds and is not fromSheetId (member order). Each member NOT in openSheetIds and not fromSheetId gets a pending op { seq, sheetId, kind: 'move', toMm: rounded } appended to riser.pending; seq = (largest seq in riser.pending, or 0) + 1, growing by 1 for each op. Unknown riser: file unchanged, applyNow []. */
export function moveRiser(
  file: BuildingFile,
  riserId: string,
  toMm: { xMm: number; yMm: number },
  fromSheetId: string,
  openSheetIds: ReadonlySet<string>,
): { file: BuildingFile; applyNow: { sheetId: string; toMm: { xMm: number; yMm: number } }[] } {
  const riser = file.risers.find((candidate) => candidate.id === riserId);
  if (riser === undefined) return { file, applyNow: [] };
  const rounded = { xMm: roundMm(toMm.xMm), yMm: roundMm(toMm.yMm) };
  const applyNow: { sheetId: string; toMm: { xMm: number; yMm: number } }[] = [];
  const ops: RiserPendingOp[] = [];
  let seq = riser.pending.reduce((largest, op) => Math.max(largest, op.seq), 0);
  for (const member of riser.members) {
    if (member.sheetId === fromSheetId) continue;
    if (openSheetIds.has(member.sheetId)) {
      applyNow.push({ sheetId: member.sheetId, toMm: { ...rounded } });
    } else {
      seq += 1;
      ops.push({ seq, sheetId: member.sheetId, kind: 'move', toMm: { ...rounded } });
    }
  }
  const anchorUnchanged = riser.anchorMm.xMm === rounded.xMm && riser.anchorMm.yMm === rounded.yMm;
  if (anchorUnchanged && ops.length === 0) return { file, applyNow };
  const next: Riser = { ...riser, anchorMm: { ...rounded }, pending: [...riser.pending, ...ops] };
  return {
    file: { ...file, risers: file.risers.map((candidate) => (candidate.id === riserId ? next : candidate)) },
    applyNow,
  };
}

/** Returns the pending ops of that sheet (seq order, across all risers, each op as it is) and the file without them. No ops: file is the same object. */
export function takePendingOps(file: BuildingFile, sheetId: string): { file: BuildingFile; ops: RiserPendingOp[] } {
  const ops: RiserPendingOp[] = [];
  for (const riser of file.risers) {
    for (const op of riser.pending) {
      if (op.sheetId === sheetId) ops.push(op);
    }
  }
  if (ops.length === 0) return { file, ops };
  ops.sort((a, b) => a.seq - b.seq);
  return {
    file: {
      ...file,
      risers: file.risers.map((riser) =>
        riser.pending.some((op) => op.sheetId === sheetId)
          ? { ...riser, pending: riser.pending.filter((op) => op.sheetId !== sheetId) }
          : riser,
      ),
    },
    ops,
  };
}

/** `${networkTypeName} riser ${n}`. n = the smallest whole number >= 1 that no riser in file.risers uses as the suffix of a name that is exactly `${networkTypeName} riser <digits>`. The type name is compared as it is (case sensitive, no trimming of the existing names; trim networkTypeName once). Names that do not match the pattern are ignored. Deleting a riser frees its number again. */
export function nextRiserLabel(file: BuildingFile, networkTypeName: string): string {
  const prefix = `${networkTypeName.trim()} riser `;
  const used = new Set<number>();
  for (const riser of file.risers) {
    if (!riser.name.startsWith(prefix)) continue;
    const digits = riser.name.slice(prefix.length);
    if (/^[1-9][0-9]*$/.test(digits)) used.add(Number(digits));
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return `${prefix}${n}`;
}
