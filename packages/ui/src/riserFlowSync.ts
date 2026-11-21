import { riserFittingIdsForSheets, riserFlowInputsOf, solveBuildingFlow, type BuildingFile, type BuildingFlowResult, type RiserFlowInput, type RiserNetworkSummary, type SheetSummary } from '@mepapp/core';
import { activeSheetOf } from './riserActions.js';

export type RiserFlowInputs = Record<string, RiserFlowInput>;

export interface RiserFlowComputation {
  /** Id of the sheet of the shown page. */
  sheetId: string;
  flow: BuildingFlowResult;
  inputs: RiserFlowInputs;
}

/**
 * The solve of the whole building and the scene inputs for the shown page.
 * Returns null (and never calls liveNetworksOf) when: file is null, file.risers is empty, no sheet of file has projectUuid and pageIndex
 * (use activeSheetOf), or no riser member sits on a sheet of that projectUuid (riserFittingIdsForSheets over ALL sheets with that projectUuid is empty).
 * Else: sheetIds = ids of all sheets with that projectUuid; live = { projectUuid, riserNetworks: liveNetworksOf(riserFittingIdsForSheets(file, sheetIds)) } (called exactly once);
 * flow = solveBuildingFlow(file, summaries, live); inputs = riserFlowInputsOf(flow, sheet.id).
 */
export function computeRiserFlow(args: {
  file: BuildingFile | null;
  projectUuid: string | null;
  pageIndex: number;
  summaries: ReadonlyMap<string, SheetSummary>;
  liveNetworksOf: (riserFittingIds: string[]) => RiserNetworkSummary[];
}): RiserFlowComputation | null {
  const { file, projectUuid, pageIndex, summaries, liveNetworksOf } = args;
  const sheet = activeSheetOf(file, projectUuid, pageIndex);
  if (file === null || projectUuid === null || sheet === null || file.risers.length === 0) return null;
  const sheetIds = file.sheets.filter((item) => item.projectUuid === projectUuid).map((item) => item.id);
  const fittingIds = riserFittingIdsForSheets(file, sheetIds);
  if (fittingIds.length === 0) return null;
  const live = { projectUuid, riserNetworks: liveNetworksOf(fittingIds) };
  const flow = solveBuildingFlow(file, summaries, live);
  return { sheetId: sheet.id, flow, inputs: riserFlowInputsOf(flow, sheet.id) };
}

/** True when both have the same keys and the same role and demandBeyond for each key (key order does not matter). */
export function sameRiserFlowInputs(a: RiserFlowInputs, b: RiserFlowInputs): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => {
    const left = a[key];
    const right = b[key];
    return left !== undefined && right !== undefined && left.role === right.role && left.demandBeyond === right.demandBeyond;
  });
}

/** Remembers what the scene holds. */
export class RiserFlowSender {
  private held: RiserFlowInputs = {};

  /** The scene dropped its inputs (page change, document activation): it now holds none. */
  reset(): void {
    this.held = {};
  }

  /** Returns `inputs` when it differs from what the scene holds (and remembers it); returns null when the scene already holds the same. So {} is returned once after non-empty inputs (to clear them), and never when the scene holds none. */
  next(inputs: RiserFlowInputs): RiserFlowInputs | null {
    if (sameRiserFlowInputs(this.held, inputs)) return null;
    this.held = inputs;
    return inputs;
  }
}
