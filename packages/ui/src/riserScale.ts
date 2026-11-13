import { risersOnSheet, riserSheetGroup, scaleDenominatorFromCalibration, type BuildingFile, type BuildingSheet, type Riser } from '@mepapp/core';

/** One row of the dialog. */
export interface ScaleRow { sheetId: string; levelName: string; isCurrent: boolean; nowDenominator: number | null; newDenominator: number; changes: boolean; open: boolean }
export interface ScaleChangePlan {
  currentSheetId: string;
  levelName: string;
  nextPageUnitsPerRealUnit: number;
  newDenominator: number;
  previousDenominator: number | null;
  riserIds: string[];
  riserNames: string[];
  rows: ScaleRow[];
  setSheetIds: string[];
  liveSheetIds: string[];
}

/** Null when the shown sheet shares no riser with another sheet, or when every other sheet of the group already has the new scale. scaleOf = the effective scale (pt per real mm) of a sheet or null when unknown; isOpen = the sheet can take the new scale at once. A scale counts as equal when |a-b| <= 1e-6 * max(a,b). A null scale counts as different. */
export function planScaleChange(
  file: BuildingFile,
  args: { sheet: BuildingSheet; nextPageUnitsPerRealUnit: number; scaleOf: (sheet: BuildingSheet) => number | null; isOpen: (sheet: BuildingSheet) => boolean },
): ScaleChangePlan | null {
  const { sheet, nextPageUnitsPerRealUnit, scaleOf, isOpen } = args;
  const group = riserSheetGroup(file, sheet.id);
  const otherIds = group.filter((id) => id !== sheet.id);
  if (otherIds.length === 0) return null;
  const sheetOfId = (id: string): BuildingSheet | undefined => file.sheets.find((candidate) => candidate.id === id);
  const others = otherIds.map(sheetOfId).filter((candidate): candidate is BuildingSheet => candidate !== undefined);
  if (others.every((other) => scalesEqual(scaleOf(other), nextPageUnitsPerRealUnit))) return null;
  const levelOrder = (candidate: BuildingSheet): number => file.levels.findIndex((level) => level.id === candidate.levelId);
  const ordered = [sheet, ...others].sort((a, b) => levelOrder(a) - levelOrder(b));
  const newDenominator = denominatorOf(nextPageUnitsPerRealUnit);
  const rows = ordered.map((candidate): ScaleRow => {
    const scale = scaleOf(candidate);
    const isCurrent = candidate.id === sheet.id;
    return {
      sheetId: candidate.id,
      levelName: levelNameOf(file, candidate),
      isCurrent,
      nowDenominator: scale === null ? null : denominatorOf(scale),
      newDenominator,
      changes: !scalesEqual(scale, nextPageUnitsPerRealUnit),
      open: isCurrent ? true : isOpen(candidate),
    };
  });
  const riserIds = risersOnSheet(file, sheet.id).map((riser) => riser.id);
  const shownScale = scaleOf(sheet);
  return {
    currentSheetId: sheet.id,
    levelName: levelNameOf(file, sheet),
    nextPageUnitsPerRealUnit,
    newDenominator,
    previousDenominator: shownScale === null ? null : denominatorOf(shownScale),
    riserIds,
    riserNames: riserIds.map((id) => file.risers.find((riser) => riser.id === id)?.name ?? id),
    rows,
    setSheetIds: others.filter((other) => !isOpen(other)).map((other) => other.id),
    liveSheetIds: others.filter((other) => isOpen(other)).map((other) => other.id),
  };
}

/** The title of the scale dialog. */
export function scaleDialogTitle(plan: ScaleChangePlan): string {
  return `Change the scale of ${plan.levelName} to 1:${plan.newDenominator}?`;
}

/** The body of the scale dialog. It names the risers that touch the shown level. */
export function scaleDialogBody(plan: ScaleChangePlan): string {
  const names = joinNames(plan.riserNames);
  const verb = plan.riserNames.length === 1 ? 'touches' : 'touch';
  return `${names} ${verb} ${plan.levelName}. PDFs that share a riser must have the same scale.`;
}

/** The change text of one row of the scale dialog. */
export function scaleRowChange(row: ScaleRow): string {
  if (row.nowDenominator === null) return `now not set, new 1:${row.newDenominator}`;
  if (!row.changes) return `now 1:${row.nowDenominator}, no change`;
  return `now 1:${row.nowDenominator}, new 1:${row.newDenominator}`;
}

/** The label of the button that sets the new scale on every sheet of the group. */
export function scaleSetAllLabel(plan: ScaleChangePlan): string {
  return `Set 1:${plan.newDenominator} on all ${plan.rows.length} PDFs`;
}

/** The hint under the set-all button. It names the open-later rule when a PDF is not open. */
export function scaleSetAllHint(plan: ScaleChangePlan): string {
  const base = `Set 1:${plan.newDenominator} on all ${plan.rows.length} PDFs: nothing moves on the pages. The risers stay on their fittings.`;
  if (plan.rows.some((row) => !row.open)) return `${base} A PDF that is not open gets the new scale when you open it.`;
  return base;
}

/** The label of the button that disconnects the risers of the shown level. */
export function scaleDisconnectLabel(plan: ScaleChangePlan): string {
  return plan.riserNames.length === 1 ? 'Disconnect the riser' : 'Disconnect the risers';
}

/** The hint under the disconnect button. It names the deleted risers and the new scale of the shown level. */
export function scaleDisconnectHint(plan: ScaleChangePlan): string {
  const names = joinNames(plan.riserNames);
  if (plan.riserNames.length === 1) {
    return `Disconnect the riser: ${names} is deleted and its fittings become normal fittings. ${plan.levelName} gets 1:${plan.newDenominator}. The other PDFs keep their scale.`;
  }
  return `Disconnect the risers: ${names} are deleted and their fittings become normal fittings. ${plan.levelName} gets 1:${plan.newDenominator}. The other PDFs keep their scale.`;
}

/** The message after the set-all action. */
export function scaleSetAllMessage(n: number, count: number): string {
  return `The scale is 1:${n} on ${count} PDFs. Nothing moved on the pages.`;
}

/** The message after the disconnect action. */
export function scaleDisconnectMessage(count: number): string {
  if (count === 1) return '1 riser disconnected. Its fittings are normal fittings now.';
  return `${count} risers disconnected. Their fittings are normal fittings now.`;
}

/** The message after the cancel action. previousDenominator null = the scale was not set. */
export function scaleCancelMessage(levelName: string, previousDenominator: number | null): string {
  if (previousDenominator === null) return `The scale of ${levelName} stays not set.`;
  return `The scale of ${levelName} stays 1:${previousDenominator}.`;
}

/** The message when the new scale could not be stored. */
export function scaleSetFailedText(levelName: string): string {
  return `The scale could not be set on ${levelName}. Nothing was changed.`;
}

/** The refusal when a riser member on another sheet has a different known scale. Null when none differs. Unknown scales (null) are ignored. */
export function scaleMismatchText(
  file: BuildingFile,
  args: { sheet: BuildingSheet; riser: Riser; thisPageUnitsPerRealUnit: number; scaleOf: (sheet: BuildingSheet) => number | null },
): string | null {
  const { sheet, riser, thisPageUnitsPerRealUnit, scaleOf } = args;
  for (const member of riser.members) {
    if (member.sheetId === sheet.id) continue;
    const other = file.sheets.find((candidate) => candidate.id === member.sheetId);
    if (other === undefined) continue;
    const otherScale = scaleOf(other);
    if (otherScale === null || scalesEqual(otherScale, thisPageUnitsPerRealUnit)) continue;
    return `${levelNameOf(file, sheet)} has the scale 1:${denominatorOf(thisPageUnitsPerRealUnit)}. ${riser.name} is on 1:${denominatorOf(otherScale)}. Set the same scale first.`;
  }
  return null;
}

/** The hint for the Make riser entry. It refuses when a riser with one of the given types has a member on another sheet with a different known scale. Null when none differs. */
export function makeRiserScaleHint(
  file: BuildingFile,
  args: { sheet: BuildingSheet; thisPageUnitsPerRealUnit: number; networkTypeIds: string[]; scaleOf: (sheet: BuildingSheet) => number | null },
): string | null {
  const { sheet, thisPageUnitsPerRealUnit, networkTypeIds, scaleOf } = args;
  for (const riser of file.risers) {
    if (!networkTypeIds.includes(riser.networkTypeId)) continue;
    for (const member of riser.members) {
      if (member.sheetId === sheet.id) continue;
      const other = file.sheets.find((candidate) => candidate.id === member.sheetId);
      if (other === undefined) continue;
      const otherScale = scaleOf(other);
      if (otherScale === null || scalesEqual(otherScale, thisPageUnitsPerRealUnit)) continue;
      return `Make riser is not possible here: the scale of ${levelNameOf(file, sheet)} differs from ${levelNameOf(file, other)}.`;
    }
  }
  return null;
}

function scalesEqual(scale: number | null, other: number): boolean {
  if (scale === null) return false;
  return Math.abs(scale - other) <= 1e-6 * Math.max(scale, other);
}

function denominatorOf(pageUnitsPerRealUnit: number): number {
  return Math.round(scaleDenominatorFromCalibration({ pageUnitsPerRealUnit }));
}

function levelNameOf(file: BuildingFile, sheet: BuildingSheet): string {
  return file.levels.find((level) => level.id === sheet.levelId)?.name ?? 'this level';
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
