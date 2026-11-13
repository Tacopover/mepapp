import { findSheets, mmToPt, pendingScaleOf, takePendingOps, type BuildingFile, type BuildingSheet, type NetworkType, type SheetSummary, type Vec2 } from '@mepapp/core';
import { matchingMintedIds } from './adoptSheetId.js';

export type PendingLink = 'id' | 'weak' | 'ambiguous';
export interface PendingDocument { projectUuid: string | null; projectUuidInFile: boolean; path?: string; fileName: string; sizeBytes: number | null }
export interface PendingFrame { heightPt: number; pageUnitsPerRealUnit: number; source: 'scene' | 'summary' }
export interface PendingKey { riserId: string; seq: number }
export interface PendingEdit { key: PendingKey; riserId: string; label: string; kind: 'move' | 'retag'; fittingId: string; toPt?: Vec2; networkType?: NetworkType }
export interface PendingPlan {
  edits: PendingEdit[];
  obsolete: PendingKey[];
  waiting: { reason: 'no-scale' | 'ambiguous'; labels: string[] } | null;
  scale: { pageUnitsPerRealUnit: number; keys: PendingKey[] } | null;
  frameSource: 'scene' | 'summary' | null;
}
export interface PendingNotice { kind: 'info' | 'warning'; message: string }

/** True when a riser has a pending op on the sheet. */
export function hasPendingOps(file: BuildingFile, sheetId: string): boolean {
  return file.risers.some((riser) => riser.pending.some((op) => op.sheetId === sheetId));
}

/** True when a riser has a pending move or a pending scale on the sheet. */
export function hasPendingMove(file: BuildingFile, sheetId: string): boolean {
  return file.risers.some((riser) => riser.pending.some((op) => op.sheetId === sheetId && (op.kind === 'move' || op.kind === 'setScale')));
}

/** True when a riser has a pending scale on the sheet. */
export function hasPendingScale(file: BuildingFile, sheetId: string): boolean {
  return file.risers.some((riser) => riser.pending.some((op) => op.sheetId === sheetId && op.kind === 'setScale'));
}

/** How the open document links to the sheet: 'id' (the id is known), 'weak' (file name and size only) or 'ambiguous' (two minted sheets could match). */
export function pendingLinkOf(file: BuildingFile, doc: PendingDocument, sheet: BuildingSheet): PendingLink {
  if (doc.projectUuidInFile || sheet.idMinted !== true || doc.sizeBytes === null) return 'id';
  const pathOption = doc.path === undefined ? {} : { path: doc.path };
  const ids = matchingMintedIds(file, { ...pathOption, fileName: doc.fileName, sizeBytes: doc.sizeBytes });
  if (ids.length > 1) return 'ambiguous';
  const strength = findSheets(file, { projectUuid: null, ...pathOption, fileName: doc.fileName, sizeBytes: doc.sizeBytes }).find(
    (match) => match.sheet.id === sheet.id,
  )?.strength;
  return strength === 'weak' ? 'weak' : 'id';
}

/** The scale frame of the sheet from its saved summary. Null when the sheet has no projectUuid, no summary, no page entry, or the page is not calibrated. */
export function summaryFrameOf(summaries: ReadonlyMap<string, SheetSummary>, sheet: BuildingSheet): PendingFrame | null {
  if (sheet.projectUuid === null) return null;
  const page = summaries.get(sheet.projectUuid)?.pages[String(sheet.pageIndex)];
  if (page === undefined || !(page.heightPt > 0) || !page.calibrated) return null;
  const scale = page.pageUnitsPerRealUnit;
  if (scale === null || !(scale > 0)) return null;
  return { heightPt: page.heightPt, pageUnitsPerRealUnit: scale, source: 'summary' };
}

/** Decides which pending ops of the sheet apply now, which are dropped, and which wait. */
export function planPendingOps(file: BuildingFile, args: { sheet: BuildingSheet; link: PendingLink; frame: PendingFrame | null }): PendingPlan {
  const { sheet, link, frame } = args;
  const frameSource = frame?.source ?? null;
  const { ops } = takePendingOps(file, sheet.id);
  if (ops.length === 0) return { edits: [], obsolete: [], waiting: null, scale: null, frameSource };
  if (link === 'ambiguous') {
    const labels = file.risers.filter((riser) => riser.pending.some((op) => op.sheetId === sheet.id)).map((riser) => riser.name);
    return { edits: [], obsolete: [], waiting: { reason: 'ambiguous', labels: uniqueOf(labels) }, scale: null, frameSource };
  }
  const hasScale = hasPendingScale(file, sheet.id);
  if (hasScale && frame === null) return { edits: [], obsolete: [], waiting: null, scale: null, frameSource };
  const scaleValue = pendingScaleOf(file, sheet.id);
  const scaleKeys: PendingKey[] = [];
  for (const riser of file.risers) {
    for (const op of riser.pending) {
      if (op.sheetId === sheet.id && op.kind === 'setScale') scaleKeys.push({ riserId: riser.id, seq: op.seq });
    }
  }
  const scale =
    hasScale && scaleValue !== null && Number.isFinite(scaleValue) && scaleValue > 0 ? { pageUnitsPerRealUnit: scaleValue, keys: scaleKeys } : null;
  const effective: PendingFrame | null = frame !== null && scale !== null ? { ...frame, pageUnitsPerRealUnit: scale.pageUnitsPerRealUnit } : frame;
  const edits: PendingEdit[] = [];
  const obsolete: PendingKey[] = [];
  const waitingLabels: string[] = [];
  for (const riser of file.risers) {
    const riserOps = riser.pending.filter((op) => op.sheetId === sheet.id).sort((a, b) => a.seq - b.seq);
    if (riserOps.length === 0) continue;
    const keyOf = (seq: number): PendingKey => ({ riserId: riser.id, seq });
    const member = riser.members.find((candidate) => candidate.sheetId === sheet.id);
    if (member === undefined) {
      for (const op of riserOps) obsolete.push(keyOf(op.seq));
      continue;
    }
    for (const op of riserOps) {
      if (op.kind === 'setScale' && (scale === null || !isPositiveScale(op.pageUnitsPerRealUnit))) obsolete.push(keyOf(op.seq));
    }
    const moves = riserOps.filter((op) => op.kind === 'move');
    const moveTargets = moves.filter((op) => op.toMm !== undefined);
    for (const op of moves) {
      if (op.toMm === undefined) obsolete.push(keyOf(op.seq));
    }
    const lastMove = moveTargets[moveTargets.length - 1];
    if (lastMove !== undefined) {
      if (effective === null) {
        waitingLabels.push(riser.name);
      } else {
        for (const op of moveTargets.slice(0, -1)) obsolete.push(keyOf(op.seq));
        if (lastMove.toMm !== undefined) {
          edits.push({
            key: keyOf(lastMove.seq),
            riserId: riser.id,
            label: riser.name,
            kind: 'move',
            fittingId: member.fittingId,
            toPt: mmToPt(lastMove.toMm, { heightPt: effective.heightPt, ppmm: effective.pageUnitsPerRealUnit }),
          });
        }
      }
    }
    const retags = riserOps.filter((op) => op.kind === 'retag');
    const retagTargets = retags.filter((op) => op.networkTypeId !== undefined);
    for (const op of retags) {
      if (op.networkTypeId === undefined) obsolete.push(keyOf(op.seq));
    }
    for (const op of retagTargets.slice(0, -1)) obsolete.push(keyOf(op.seq));
    const lastRetag = retagTargets[retagTargets.length - 1];
    if (lastRetag !== undefined && lastRetag.networkTypeId !== undefined) {
      if (riser.networkType.id === lastRetag.networkTypeId) {
        edits.push({
          key: keyOf(lastRetag.seq),
          riserId: riser.id,
          label: riser.name,
          kind: 'retag',
          fittingId: member.fittingId,
          networkType: riser.networkType,
        });
      } else {
        obsolete.push(keyOf(lastRetag.seq));
      }
    }
  }
  const waitingUnique = uniqueOf(waitingLabels);
  return {
    edits: edits.sort((a, b) => a.key.seq - b.key.seq),
    obsolete,
    waiting: waitingUnique.length > 0 ? { reason: 'no-scale', labels: waitingUnique } : null,
    scale,
    frameSource,
  };
}

/** The file without the pending ops of the keys. The same object when no key matches. */
export function dropPendingOps(file: BuildingFile, keys: readonly PendingKey[]): BuildingFile {
  if (keys.length === 0) return file;
  let changed = false;
  const risers = file.risers.map((riser) => {
    const pending = riser.pending.filter((op) => !keys.some((key) => key.riserId === riser.id && key.seq === op.seq));
    if (pending.length === riser.pending.length) return riser;
    changed = true;
    return { ...riser, pending };
  });
  return changed ? { ...file, risers } : file;
}

/** The info notice of the applied edits and the warning of the waiting ops. Info first. */
export function pendingNotices(args: {
  file: BuildingFile;
  sheet: BuildingSheet;
  link: PendingLink;
  plan: PendingPlan;
  applied: readonly PendingEdit[];
  scaleApplied?: number | null;
}): PendingNotice[] {
  const { file, sheet, link, plan, applied, scaleApplied } = args;
  const levelName = file.levels.find((level) => level.id === sheet.levelId)?.name ?? 'this level';
  const parts: string[] = [];
  const moved = applied.filter((edit) => edit.kind === 'move');
  if (typeof scaleApplied === 'number') {
    parts.push(`The scale of ${levelName} is 1:${scaleApplied} now, to match the building. Nothing moved on the page.`);
  } else if (moved.length > 0) {
    const summaryNote = plan.frameSource === 'summary' ? ' (scale from the saved sheet)' : '';
    parts.push(`${who(moved.map((edit) => edit.label))} moved on ${levelName} to match the building${summaryNote}.`);
  }
  const retagged = applied.filter((edit) => edit.kind === 'retag');
  const retagLabels = uniqueOf(retagged.map((edit) => edit.label));
  const [firstRetag] = retagged;
  const typeName = firstRetag?.networkType?.name;
  if (retagLabels.length === 1 && typeName !== undefined) {
    parts.push(`${who(retagLabels)} changed to ${typeName} on ${levelName}.`);
  } else if (retagLabels.length > 0) {
    parts.push(`${who(retagLabels)} changed type on ${levelName} to match the building.`);
  }
  const notices: PendingNotice[] = [];
  if (parts.length > 0) {
    const weakNote = link === 'weak' ? ` ${sheet.displayName} is linked to the building by file name and size only.` : '';
    notices.push({ kind: 'info', message: `${parts.join(' ')}${weakNote}` });
  }
  if (plan.waiting !== null) {
    const { reason, labels } = plan.waiting;
    if (reason === 'no-scale') {
      notices.push({ kind: 'warning', message: `Set the scale of ${sheet.displayName} to move ${who(labels)}.` });
    } else {
      notices.push({
        kind: 'warning',
        message: `${sheet.displayName}: ${who(labels)} ${labels.length === 1 ? 'waits' : 'wait'}. Open this sheet from the building to apply it.`,
      });
    }
  }
  return notices;
}

function isPositiveScale(value: number | undefined): boolean {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function uniqueOf(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function who(labels: readonly string[]): string {
  const unique = uniqueOf(labels);
  const [first, second] = unique;
  if (unique.length === 1) return first ?? '';
  if (unique.length === 2) return `${first} and ${second}`;
  return `${unique.length} risers`;
}
