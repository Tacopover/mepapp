import type { BuildingFile, LinePattern, Riser, RiserMember } from '@mepapp/core';

/** Layout numbers of the Risers diagram, in px. */
export const DIAGRAM_METRICS = {
  /** Height of the gap between two levels when elevations are evenly spaced. */
  gapPx: 64,
  /** Smallest distance between two level positions. */
  minGapPx: 48,
  /** Free space above the top level and below the bottom level. */
  padPx: 32,
  /** x of the first lane. */
  laneLeftPx: 44,
  /** x distance between two lanes. */
  laneStepPx: 84,
  /** Extra x distance where the network type changes. */
  typeGapPx: 24,
  /** Free space right of the last lane. */
  laneRightPx: 44,
  minWidthPx: 320,
} as const;

export interface DiagramLevel {
  id: string;
  name: string;
  elevationMm: number;
  /** 'floor +6.00 m' | 'floor ±0.00 m' | 'floor −3.00 m'. Metres with 2 decimals. */
  elevationText: string;
  /** Position of the level in the frame, px from the frame top. Higher elevation = smaller y. */
  yPx: number;
  bandTopPx: number;
  bandBottomPx: number;
}

export interface DiagramLayout {
  /** Top to bottom (highest elevation first). Equal elevations keep the order of file.levels. */
  levels: DiagramLevel[];
  heightPx: number;
  /** The lines between two bands: the middle between two neighbouring level positions. levels.length - 1 entries, top to bottom. */
  levelLinesPx: number[];
}

export interface TypeFilter {
  networkTypeId: string;
  name: string;
  color: string;
  linePattern: LinePattern;
  /** Number of risers of this type. */
  count: number;
  shown: boolean;
}

export type DotStatus = 'ok' | 'waiting' | 'off';

export interface DiagramDot {
  levelId: string;
  sheetId: string;
  yPx: number;
  status: DotStatus;
}

export interface DiagramLane {
  riserId: string;
  label: string;
  networkTypeId: string;
  color: string;
  linePattern: LinePattern;
  xPx: number;
  /** Position of the highest and the lowest member level. Equal for a riser with one level. */
  topPx: number;
  bottomPx: number;
  /** One dot for each member whose level exists in the layout, top to bottom. */
  dots: DiagramDot[];
}

export interface RisersLayout {
  lanes: DiagramLane[];
  widthPx: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function elevationText(elevationMm: number): string {
  const hundredths = Math.round(elevationMm / 10);
  if (hundredths === 0) return 'floor ±0.00 m';
  const sign = hundredths > 0 ? '+' : '−';
  return `floor ${sign}${(Math.abs(hundredths) / 100).toFixed(2)} m`;
}

/** Spaces the levels by elevation, with at least minGapPx between two level positions. */
export function layoutLevels(levels: readonly { id: string; name: string; elevationMm: number }[]): DiagramLayout {
  const { gapPx, minGapPx, padPx } = DIAGRAM_METRICS;
  const n = levels.length;
  if (n === 0) return { levels: [], heightPx: padPx * 2, levelLinesPx: [] };

  // Lowest first. For equal elevations the later file entry comes first, so the earlier entry is drawn higher.
  const ascending = levels
    .map((level, index) => ({ level, index }))
    .sort((a, b) => a.level.elevationMm - b.level.elevationMm || b.index - a.index);
  const min = ascending[0]!.level.elevationMm;
  const span = ascending[n - 1]!.level.elevationMm - min;
  const total = gapPx * (n - 1);
  const yUp = ascending.map(({ level }, i) => (span > 0 ? ((level.elevationMm - min) / span) * total : i * gapPx));
  for (let i = 1; i < n; i++) yUp[i] = Math.max(yUp[i]!, yUp[i - 1]! + minGapPx);
  const yUpPx = yUp.map(round1);

  const heightPx = round1(yUpPx[n - 1]! + padPx * 2);
  const yPx = ascending.map((_, i) => round1(heightPx - padPx - yUpPx[i]!)).reverse();
  const levelLinesPx = yPx.slice(1).map((y, k) => round1((yPx[k]! + y) / 2));
  const sorted = ascending.map(({ level }) => level).reverse();

  return {
    levels: sorted.map((level, k) => ({
      id: level.id,
      name: level.name,
      elevationMm: level.elevationMm,
      elevationText: elevationText(level.elevationMm),
      yPx: yPx[k]!,
      bandTopPx: k === 0 ? 0 : levelLinesPx[k - 1]!,
      bandBottomPx: k === n - 1 ? heightPx : levelLinesPx[k]!,
    })),
    heightPx,
    levelLinesPx,
  };
}

/** One entry for each network type that has at least one riser, sorted by name, then id. */
export function typeFilters(risers: readonly Riser[], hidden: ReadonlySet<string>): TypeFilter[] {
  const byId = new Map<string, TypeFilter>();
  for (const riser of risers) {
    const existing = byId.get(riser.networkTypeId);
    if (existing) {
      existing.count += 1;
      continue;
    }
    byId.set(riser.networkTypeId, {
      networkTypeId: riser.networkTypeId,
      name: riser.networkType.name,
      color: riser.networkType.color,
      linePattern: riser.networkType.linePattern,
      count: 1,
      shown: !hidden.has(riser.networkTypeId),
    });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.networkTypeId.localeCompare(b.networkTypeId));
}

/** 'off' when the fitting is not at the riser position, else 'waiting' when a pending op names the sheet, else 'ok'. */
export function memberStatus(riser: Riser, member: RiserMember, conflictKeys: ReadonlySet<string>): DotStatus {
  if (conflictKeys.has(`${riser.id}|${member.sheetId}`)) return 'off';
  if (riser.pending.some((op) => op.sheetId === member.sheetId)) return 'waiting';
  return 'ok';
}

/** Number at the end of a label like 'Supply air riser 12' -> 12; null when the label does not end in digits. */
export function riserNumber(label: string): number | null {
  const match = /(\d+)$/.exec(label);
  return match ? Number(match[1]) : null;
}

function compareLabels(a: string, b: string): number {
  const numberA = riserNumber(a);
  const numberB = riserNumber(b);
  if (numberA !== null && numberB !== null && numberA !== numberB) return numberA - numberB;
  if (numberA === null && numberB !== null) return 1;
  if (numberA !== null && numberB === null) return -1;
  return a.localeCompare(b);
}

/** Lanes of the risers whose type is not hidden, ordered by type and then by the number in the label. */
export function layoutRisers(
  file: BuildingFile,
  layout: DiagramLayout,
  hidden: ReadonlySet<string>,
  conflictKeys: ReadonlySet<string>,
): RisersLayout {
  const { laneLeftPx, laneStepPx, typeGapPx, laneRightPx, minWidthPx } = DIAGRAM_METRICS;
  const levelById = new Map<string, DiagramLevel>(layout.levels.map((level) => [level.id, level]));
  const typeOrder = new Map<string, number>(typeFilters(file.risers, hidden).map((filter, index) => [filter.networkTypeId, index]));

  const candidates: { riser: Riser; dots: DiagramDot[] }[] = [];
  for (const riser of file.risers) {
    if (hidden.has(riser.networkTypeId)) continue;
    const dots: DiagramDot[] = [];
    for (const member of riser.members) {
      const level = levelById.get(member.levelId);
      if (!level) continue;
      dots.push({ levelId: level.id, sheetId: member.sheetId, yPx: level.yPx, status: memberStatus(riser, member, conflictKeys) });
    }
    if (dots.length === 0) continue;
    dots.sort((a, b) => a.yPx - b.yPx);
    candidates.push({ riser, dots });
  }
  candidates.sort(
    (a, b) =>
      typeOrder.get(a.riser.networkTypeId)! - typeOrder.get(b.riser.networkTypeId)! || compareLabels(a.riser.name, b.riser.name),
  );

  const lanes: DiagramLane[] = [];
  let typeIndex = 0;
  let previousTypeId: string | undefined;
  for (let index = 0; index < candidates.length; index++) {
    const { riser, dots } = candidates[index]!;
    if (previousTypeId !== undefined && previousTypeId !== riser.networkTypeId) typeIndex += 1;
    previousTypeId = riser.networkTypeId;
    lanes.push({
      riserId: riser.id,
      label: riser.name,
      networkTypeId: riser.networkTypeId,
      color: riser.networkType.color,
      linePattern: riser.networkType.linePattern,
      xPx: laneLeftPx + index * laneStepPx + typeIndex * typeGapPx,
      topPx: dots[0]!.yPx,
      bottomPx: dots[dots.length - 1]!.yPx,
      dots,
    });
  }

  const lastLane = lanes[lanes.length - 1];
  const widthPx = lastLane ? Math.max(minWidthPx, lastLane.xPx + laneRightPx) : minWidthPx;
  return { lanes, widthPx };
}
