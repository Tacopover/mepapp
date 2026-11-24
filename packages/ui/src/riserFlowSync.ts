import { riserFittingIdsForSheets, riserFlowInputsOf, solveBuildingFlow, type BuildingFile, type BuildingFlowResult, type RiserFlowInput, type RiserNetworkSummary, type RiserNetworksLive, type SheetSummary } from '@mepapp/core';
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
 * Else: sheetIds = ids of all sheets with that projectUuid; lives = [{ projectUuid, riserNetworks: liveNetworksOf(riserFittingIdsForSheets(file, sheetIds)) }, ...others of other projectUuids] (liveNetworksOf called exactly once);
 * flow = solveBuildingFlow(file, summaries, lives); inputs = riserFlowInputsOf(flow, sheet.id).
 */
export function computeRiserFlow(args: {
  file: BuildingFile | null;
  projectUuid: string | null;
  pageIndex: number;
  summaries: ReadonlyMap<string, SheetSummary>;
  liveNetworksOf: (riserFittingIds: string[]) => RiserNetworkSummary[];
  others?: readonly RiserNetworksLive[];
}): RiserFlowComputation | null {
  const { file, projectUuid, pageIndex, summaries, liveNetworksOf, others } = args;
  const sheet = activeSheetOf(file, projectUuid, pageIndex);
  if (file === null || projectUuid === null || sheet === null || file.risers.length === 0) return null;
  const sheetIds = file.sheets.filter((item) => item.projectUuid === projectUuid).map((item) => item.id);
  const fittingIds = riserFittingIdsForSheets(file, sheetIds);
  if (fittingIds.length === 0) return null;
  const lives = [{ projectUuid, riserNetworks: liveNetworksOf(fittingIds) }, ...(others ?? []).filter((item) => item.projectUuid !== projectUuid)];
  const flow = solveBuildingFlow(file, summaries, lives);
  return { sheetId: sheet.id, flow, inputs: riserFlowInputsOf(flow, sheet.id) };
}

/** The live riser networks of the open documents. Session only: never stored. Key: projectUuid. */
export class LiveRiserOverlay {
  /** Counts each change. */
  version = 0;
  private readonly entries = new Map<string, RiserNetworkSummary[]>();

  /** True when the networks differ from the stored value of projectUuid. */
  set(projectUuid: string, networks: RiserNetworkSummary[]): boolean {
    if (JSON.stringify(this.entries.get(projectUuid)) === JSON.stringify(networks)) return false;
    this.entries.set(projectUuid, networks);
    this.version += 1;
    return true;
  }

  /** True when an entry was removed. */
  delete(projectUuid: string): boolean {
    const removed = this.entries.delete(projectUuid);
    if (removed) this.version += 1;
    return removed;
  }

  /** Removes the entries whose projectUuid is not in keep. True when any entry was removed. */
  retain(keep: ReadonlySet<string>): boolean {
    let removed = false;
    for (const projectUuid of this.entries.keys()) {
      if (keep.has(projectUuid)) continue;
      this.entries.delete(projectUuid);
      removed = true;
    }
    if (removed) this.version += 1;
    return removed;
  }

  /** True when an entry was removed. */
  clear(): boolean {
    if (this.entries.size === 0) return false;
    this.entries.clear();
    this.version += 1;
    return true;
  }

  /** The entries sorted by projectUuid. */
  list(): RiserNetworksLive[] {
    return [...this.entries.keys()].sort().map((projectUuid) => ({ projectUuid, riserNetworks: this.entries.get(projectUuid) ?? [] }));
  }
}

/** True when both have the same keys and the same role, demandBeyond and sides (length, demand, openEnds, in order) for each key (key order does not matter). */
export function sameRiserFlowInputs(a: RiserFlowInputs, b: RiserFlowInputs): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => {
    const left = a[key];
    const right = b[key];
    return left !== undefined && right !== undefined && left.role === right.role && left.demandBeyond === right.demandBeyond && sameSides(left.sides, right.sides);
  });
}

function sameSides(a: RiserFlowInput['sides'], b: RiserFlowInput['sides']): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((side, index) => side.demand === b[index]?.demand && side.openEnds === b[index]?.openEnds);
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
