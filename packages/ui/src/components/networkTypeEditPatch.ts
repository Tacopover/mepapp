import type { Discipline, FlowSense, LinePattern, NetworkType } from '@mepapp/core';
import { draftToPatch, type SizingDraft } from './sizingDraft.js';

export type NetworkTypeEditPatch = Partial<Pick<NetworkType, 'name' | 'color' | 'lineWidthPt' | 'linePattern' | 'discipline' | 'flowUnit' | 'sizingMethod' | 'flowSense'>>;

/** The patch that Save sends. A blank name keeps the old name. flowSense is always in the patch, so Save writes the effective value (also for a type that had none). */
export function networkTypeEditPatch(args: { oldName: string; name: string; color: string; lineWidthPt: number; linePattern: LinePattern; discipline: Discipline; flowSense: FlowSense; sizing: SizingDraft }): NetworkTypeEditPatch {
  return {
    name: args.name.trim() || args.oldName,
    color: args.color,
    lineWidthPt: args.lineWidthPt,
    linePattern: args.linePattern,
    discipline: args.discipline,
    flowSense: args.flowSense,
    ...draftToPatch(args.sizing),
  };
}
