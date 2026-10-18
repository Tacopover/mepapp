import { convertFlow, getStampPorts, routingTargetOf, type FlowUnitId, type RouteStamp, type Segment, type SizeNetworkResult, type SizePick, type SizingProblem, type SizingProblemCode } from '@mepapp/core';

const TEXTS = {
  title: 'Size network',
  startStamp: 'Start stamp',
  startPort: 'Start port',
  networkType: 'Network type',
  noEquipment: 'No equipment with a connected segment in this drawing.',
  noSegments: 'No segment is connected to this port.',
  size: 'Size network',
  close: 'Close',
  editType: 'Edit network type…',
  severityError: 'Error',
  severityWarning: 'Warning',
  severityInfo: 'Note',
  capacityUnitNote: 'Capacities are read as {unit}.',
  totalFlow: 'Total flow: {flow}',
  sizedCount: '{n} segments sized.',
  sizedCountOne: '1 segment sized.',
  sizeCount: '{size}: {count} segments',
  sizeCountOne: '{size}: 1 segment',
  riserNote: 'Sizes are for this file only. A riser through other floors is not added up.',
  twoFlowsNote: 'Stamps with two flows use one capacity here.',
  draftNote: 'Draft in 2D. Check clashes and clearances yourself.',
  disciplineNotSized: 'This network type has no sizing method. Sizing is for ventilation and heating/cooling water only. Plumbing, drains and fire protection are not sized by this command.',
  velocityNote: 'The velocity limit applies to every segment.',
  fluidAir: 'Air at 20 °C.',
  fluidWater: 'Water at 20 °C, no glycol.',
  pipeNote: 'Pipe sizes are DN. The inner diameter is taken as equal to the DN. Check copper and plastic pipe.',
  returnNote: 'Supply and return pipes must be separate networks.',
  unsizedKeep: '{n} segments are not sized and keep their old size.',
  unsizedKeepOne: '1 segment is not sized and keeps its old size.',
  newSize: '{n} segments get a new size. A size that you typed by hand is overwritten.',
  newSizeOne: '1 segment gets a new size. A size that you typed by hand is overwritten.',
  appliedCount: 'Sized {n} segments.',
  appliedCountOne: 'Sized 1 segment.',
  confirmQuestion: 'Some segments get no size and keep their old size. Size the others anyway?',
  confirmYes: 'Size anyway',
  confirmNo: 'Cancel',
  unitReadNote: 'Existing capacities of this type are read as {unit}.',
  convertQuestion: 'Convert {n} stored capacities from {old} to {new}?',
  convertQuestionOne: 'Convert 1 stored capacity from {old} to {new}?',
  convertYes: 'Convert',
  convertNo: 'Keep numbers',
  convertSkipped: '{n} capacities of stamps with two network types are not converted.',
  unitKindWarning: 'A volume unit and a power unit cannot be converted. The stored capacities keep their numbers.',
  sizesSourceHint: 'Sources for the suggested values are secondary. Check your standard.',
  deltaTHint: 'Needed when the flow unit is a power.',
  suggest: 'Use suggested values',
  flowSection: 'Flow and sizing',
  flowUnit: 'Flow unit',
  flowUnitNotSet: 'Not set',
  sizingMethod: 'Sizing method',
  methodNone: 'Not sized',
  methodAir: 'Air',
  methodWater: 'Water',
  maxVelocity: 'Maximum velocity (m/s)',
  maxDrop: 'Maximum pressure drop (Pa/m)',
  airShape: 'Shape',
  shapeRound: 'Round',
  shapeRect: 'Rectangular',
  maxAspect: 'Maximum aspect ratio',
  airSeries: 'Size series',
  seriesStandard: 'Standard',
  seriesFree: 'Free (steps of 10 mm)',
  deltaT: 'Delta T (K)',
  valueNotPositive: 'Enter a number above 0.',
  valueAtLeastOne: 'Enter a number of 1 or more.',
  editorTitle: 'Network type: {name}',
  'problem_no-start': 'No start port is chosen.',
  'problem_no-segment-at-port': 'No segment is connected to this port.',
  'problem_discipline-not-sized': 'This network type has no sizing method. Sizing is for ventilation and heating/cooling water only. Plumbing, drains and fire protection are not sized by this command.',
  'problem_method-discipline': 'The sizing method does not fit the discipline of this network type.',
  'hint_method-discipline': 'Change the method or the discipline in the network type.',
  'problem_no-flow-unit': 'The network type has no flow unit.',
  'hint_no-flow-unit': 'Set the flow unit in the network type.',
  'problem_no-sizing': 'The network type has no sizing method.',
  'hint_no-sizing': 'Set a sizing method in the network type.',
  'problem_unit-kind': 'Air is sized from a volume flow. The flow unit is a power.',
  'hint_unit-kind': 'Choose a volume unit in the network type.',
  'problem_no-delta-t': 'The flow unit is a power, so water needs a delta T.',
  'hint_no-delta-t': 'Enter the delta T in the network type.',
  'problem_no-flow': 'No segment of this network carries a flow.',
  'hint_no-flow': 'Set a capacity on at least one terminal.',
  'problem_unit-unknown': '{count} elements have a capacity that cannot be read in the flow unit.',
  'problem_unit-unknown_one': '1 element has a capacity that cannot be read in the flow unit.',
  'problem_not-resolved': '{count} segments have an unresolved flow and get no size.',
  'problem_not-resolved_one': '1 segment has an unresolved flow and gets no size.',
  'problem_zero-flow': '{count} segments carry no flow and get no size.',
  'problem_zero-flow_one': '1 segment carries no flow and gets no size.',
  'problem_too-large': '{count} segments need a size above the largest size and get no size.',
  'problem_too-large_one': '1 segment needs a size above the largest size and gets no size.',
  'problem_mixed-type': '{count} segments have another network type and get no size.',
  'problem_mixed-type_one': '1 segment has another network type and gets no size.',
  'problem_start-two-ports': 'The start stamp has segments on {count} ports of this network. A return pipe may be counted twice.',
} as const;

export type SizeTextKey = keyof typeof TEXTS;

/** Replaces each {name} in the text with String(params[name]). A {name} with no param stays as it is. */
export function sizeText(key: SizeTextKey, params?: Record<string, string | number>): string {
  const text: string = TEXTS[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match));
}

export interface SizeProblemLine {
  code: SizingProblemCode;
  severity: 'error' | 'warning' | 'info';
  text: string;
  hint: string;
}

const COUNTED_CODES: readonly SizingProblemCode[] = ['unit-unknown', 'not-resolved', 'zero-flow', 'too-large', 'mixed-type'];
const HINTED_CODES: readonly SizingProblemCode[] = ['method-discipline', 'no-flow-unit', 'no-sizing', 'unit-kind', 'no-delta-t', 'no-flow'];

/** One line per problem, in the order of `problems`. The count is the length of `ids`. */
export function sizeProblemLines(problems: readonly SizingProblem[]): SizeProblemLine[] {
  return problems.map((problem): SizeProblemLine => {
    const { code, severity } = problem;
    const count = problem.ids?.length ?? 0;
    const textKey = COUNTED_CODES.includes(code) && count === 1 ? `problem_${code}_one` : `problem_${code}`;
    let hint = '';
    if (HINTED_CODES.includes(code)) hint = sizeText(`hint_${code}` as SizeTextKey);
    if (code === 'start-two-ports') hint = sizeText('returnNote');
    return { code, severity, text: sizeText(textKey as SizeTextKey, { count }), hint };
  });
}

function pickArea(pick: SizePick): number {
  if (pick.shape === 'round') return (Math.PI / 4) * (pick.diameterMm ?? 0) * (pick.diameterMm ?? 0);
  return (pick.widthMm ?? 0) * (pick.heightMm ?? 0);
}

/**
 * The total line (only when the total is known), the sized count, then one line per size, largest first.
 * totalText is the preformatted total (for example '400 dm³/s'); the caller formats it. method picks the size label ('Ø 400' or 'DN 20').
 */
export function sizeResultLines(result: SizeNetworkResult, totalText: string, method: 'air' | 'water' = 'air'): string[] {
  const lines: string[] = [];
  if (result.totalFlowM3s !== null) lines.push(sizeText('totalFlow', { flow: totalText }));
  const sized = result.sizes.length;
  lines.push(sized === 1 ? sizeText('sizedCountOne') : sizeText('sizedCount', { n: sized }));

  const groups = new Map<string, { label: string; area: number; count: number }>();
  for (const pick of result.sizes) {
    const label = sizeLabel(pick, method);
    const group = groups.get(label) ?? { label, area: pickArea(pick), count: 0 };
    group.count += 1;
    groups.set(label, group);
  }
  const sorted = [...groups.values()].sort((a, b) => b.area - a.area || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  for (const group of sorted) {
    lines.push(group.count === 1
      ? sizeText('sizeCountOne', { size: group.label })
      : sizeText('sizeCount', { size: group.label, count: group.count }));
  }
  return lines;
}

/** Round: 'Ø 400', or 'DN 20' with method 'water'. Rectangular: '800 × 400' (width × height). */
export function sizeLabel(pick: SizePick, method?: 'air' | 'water'): string {
  if (pick.shape === 'round') return method === 'water' ? `DN ${pick.diameterMm}` : `Ø ${pick.diameterMm}`;
  return `${pick.widthMm} × ${pick.heightMm}`;
}

const EDIT_TYPE_CODES: readonly SizingProblemCode[] = ['no-flow-unit', 'no-sizing', 'no-delta-t', 'unit-kind', 'method-discipline'];

/** True when one problem is fixed in the network type editor, so the dialog shows the "Edit network type…" button. */
export function showEditTypeButton(problems: readonly SizingProblem[]): boolean {
  return problems.some((problem) => EDIT_TYPE_CODES.includes(problem.code));
}

/** The ids of the ports of the stamp that have a segment end, in the order of the segments. */
export function portsWithSegment(stampId: string, segments: readonly Segment[]): string[] {
  const ids: string[] = [];
  for (const segment of segments) {
    for (const point of [segment.endpointA, segment.endpointB]) {
      if (point.kind === 'port' && point.elementId === stampId && !ids.includes(point.portId)) ids.push(point.portId);
    }
  }
  return ids;
}

/** The ids of the stamps that a segment of the list ends on. */
export function stampIdsOfSegments(segments: readonly Segment[], segmentIds: readonly string[]): Set<string> {
  const wanted = new Set(segmentIds);
  const ids = new Set<string>();
  for (const segment of segments) {
    if (!wanted.has(segment.id)) continue;
    for (const point of [segment.endpointA, segment.endpointB]) {
      if (point.kind === 'port') ids.add(point.elementId);
    }
  }
  return ids;
}

/** True when a stamp of the set has routing targets of two or more network types on its ports. */
export function hasTwoFlows(stamps: readonly RouteStamp[], stampIds: ReadonlySet<string>): boolean {
  return stamps.some((stamp) => {
    if (!stampIds.has(stamp.id)) return false;
    const targets = new Set<string>();
    for (const port of getStampPorts(stamp)) {
      const target = routingTargetOf(stamp, port.id);
      if (target !== undefined) targets.add(target);
    }
    return targets.size >= 2;
  });
}

/** True when the first press of the Size button must ask first: some segment of the network gets no size. */
export function needsConfirm(result: SizeNetworkResult): boolean {
  return result.unsized.length > 0;
}

/** The total flow with its unit, for example '400 dm³/s'. A volume unit is kept; a power unit or no unit shows l/s. */
export function totalFlowText(totalFlowM3s: number, unit: FlowUnitId | null): string {
  const shown: FlowUnitId = unit !== null && convertFlow(1, unit, 'm³/s') !== null ? unit : 'l/s';
  const value = convertFlow(totalFlowM3s, 'm³/s', shown) ?? totalFlowM3s;
  return `${Number(value.toPrecision(4))} ${shown}`;
}

/** The lines under the sized count: the segments that keep their old size, then the segments that get a new size. */
export function sizeChangeLines(result: SizeNetworkResult): string[] {
  const lines: string[] = [];
  const kept = result.unsized.length;
  if (kept > 0) lines.push(kept === 1 ? sizeText('unsizedKeepOne') : sizeText('unsizedKeep', { n: kept }));
  const changed = result.sizes.length;
  if (changed > 0) lines.push(changed === 1 ? sizeText('newSizeOne') : sizeText('newSize', { n: changed }));
  return lines;
}
