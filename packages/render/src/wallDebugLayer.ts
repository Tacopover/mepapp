import { Container, Graphics } from 'pixi.js';
import { REJECT_REASON, SEGMENT_STRIDE, SEG_KIND, SEG_WIDTH, SEG_X0, SEG_X1, SEG_Y0, SEG_Y1, KIND_MASK } from '@mepapp/core';

/** Colour groups of the wall-line debug overlay. Each wall filter reason code belongs to one group. */
export type WallDebugGroup = 'kept' | 'noPartner' | 'noHatchEvidence' | 'stair' | 'dashOrHatch' | 'other';

export const WALL_DEBUG_GROUPS: readonly { group: WallDebugGroup; label: string; color: number }[] = [
  { group: 'kept', label: 'Kept as wall', color: 0x00c853 },
  { group: 'noPartner', label: 'Dropped: no partner line', color: 0xe53935 },
  { group: 'noHatchEvidence', label: 'Dropped: no hatch between the pair', color: 0xfb8c00 },
  { group: 'stair', label: 'Dropped: stair', color: 0x8e24aa },
  { group: 'dashOrHatch', label: 'Dropped: dash or hatch line', color: 0x1e88e5 },
  { group: 'other', label: 'Dropped: short, curve, loop or small part', color: 0x9e9e9e },
];

const REASON_TEXT: Record<number, string> = {
  [REJECT_REASON.kept]: 'kept as wall',
  [REJECT_REASON.shortOrNotLine]: 'dropped: too short or not a line',
  [REJECT_REASON.noPartner]: 'dropped: no parallel partner line',
  [REJECT_REASON.hatch]: 'dropped: hatch line (many short partners)',
  [REJECT_REASON.stubUntouched]: 'dropped: short piece that touches no wall',
  [REJECT_REASON.unpairedCurve]: 'dropped: curve without a partner',
  [REJECT_REASON.loop]: 'dropped: closed loop (loop rule)',
  [REJECT_REASON.stair]: 'dropped: stair rule',
  [REJECT_REASON.dash]: 'dropped: dash rule',
  [REJECT_REASON.component]: 'dropped: small separate part (component rule)',
  [REJECT_REASON.noHatchEvidence]: 'dropped: paired, but no hatch between the lines',
};

const KIND_TEXT = ['stroked line', 'filled edge', 'stroked curve piece', 'filled curve piece'];

export function wallDebugGroup(reason: number): WallDebugGroup {
  switch (reason) {
    case REJECT_REASON.kept:
      return 'kept';
    case REJECT_REASON.noPartner:
      return 'noPartner';
    case REJECT_REASON.noHatchEvidence:
      return 'noHatchEvidence';
    case REJECT_REASON.stair:
      return 'stair';
    case REJECT_REASON.dash:
    case REJECT_REASON.hatch:
      return 'dashOrHatch';
    default:
      return 'other';
  }
}

/** The line under the pointer, as shown in the tooltip. `id` is the segment index in the page's getVectorPaths output: stable while the PDF and the extraction code do not change. */
export interface WallLineInfo {
  id: string;
  index: number;
  pageIndex: number;
  group: WallDebugGroup;
  reason: string;
  lengthMm: number;
  strokeWidthPt: number;
  kind: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Filter result of one page, with a uniform grid for the nearest-line lookup under the pointer. */
export class WallDebugData {
  readonly counts: Record<WallDebugGroup, number> = { kept: 0, noPartner: 0, noHatchEvidence: 0, stair: 0, dashOrHatch: 0, other: 0 };
  private readonly cellPt: number;
  private readonly minX: number;
  private readonly minY: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: Map<number, number[]> = new Map();

  constructor(
    readonly pageIndex: number,
    readonly segments: Float64Array,
    readonly segmentCount: number,
    readonly reason: Uint8Array,
    readonly mmPerPt: number,
    bounds: [number, number, number, number],
  ) {
    for (let i = 0; i < segmentCount; i++) this.counts[wallDebugGroup(reason[i]!)]++;
    this.minX = bounds[0];
    this.minY = bounds[1];
    this.cellPt = Math.max(10, Math.sqrt(((bounds[2] - bounds[0]) * (bounds[3] - bounds[1])) / 40000));
    this.cols = Math.max(1, Math.ceil((bounds[2] - bounds[0]) / this.cellPt));
    this.rows = Math.max(1, Math.ceil((bounds[3] - bounds[1]) / this.cellPt));
    const S = SEGMENT_STRIDE;
    for (let i = 0; i < segmentCount; i++) {
      const o = i * S;
      const [c0, r0] = this.cell(Math.min(segments[o + SEG_X0]!, segments[o + SEG_X1]!), Math.min(segments[o + SEG_Y0]!, segments[o + SEG_Y1]!));
      const [c1, r1] = this.cell(Math.max(segments[o + SEG_X0]!, segments[o + SEG_X1]!), Math.max(segments[o + SEG_Y0]!, segments[o + SEG_Y1]!));
      // Very long lines would fill many cells; they are rare, so the bounding-box cells are good enough.
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const key = r * this.cols + c;
          const list = this.cells.get(key);
          if (list) list.push(i);
          else this.cells.set(key, [i]);
        }
      }
    }
  }

  private cell(x: number, y: number): [number, number] {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cellPt)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.minY) / this.cellPt)));
    return [c, r];
  }

  /** The nearest line within `tolPt` of (x, y) whose group is visible, or null. */
  nearest(x: number, y: number, tolPt: number, hidden: ReadonlySet<WallDebugGroup>): number | null {
    const [c0, r0] = this.cell(x - tolPt, y - tolPt);
    const [c1, r1] = this.cell(x + tolPt, y + tolPt);
    const S = SEGMENT_STRIDE;
    const seg = this.segments;
    let best = -1;
    let bestD = tolPt * tolPt;
    const seen = new Set<number>();
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (const i of this.cells.get(r * this.cols + c) ?? []) {
          if (seen.has(i)) continue;
          seen.add(i);
          if (hidden.has(wallDebugGroup(this.reason[i]!))) continue;
          const o = i * S;
          const ax = seg[o + SEG_X0]!;
          const ay = seg[o + SEG_Y0]!;
          const dx = seg[o + SEG_X1]! - ax;
          const dy = seg[o + SEG_Y1]! - ay;
          const len2 = dx * dx + dy * dy;
          const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
          const ex = ax + t * dx - x;
          const ey = ay + t * dy - y;
          const d = ex * ex + ey * ey;
          // A kept line wins a tie, so walls are easy to pick where lines lie on top of each other.
          if (d < bestD || (d === bestD && best >= 0 && this.reason[i] === REJECT_REASON.kept)) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    return best >= 0 ? best : null;
  }

  info(i: number): WallLineInfo {
    const o = i * SEGMENT_STRIDE;
    const s = this.segments;
    const x0 = s[o + SEG_X0]!;
    const y0 = s[o + SEG_Y0]!;
    const x1 = s[o + SEG_X1]!;
    const y1 = s[o + SEG_Y1]!;
    const r = this.reason[i]!;
    return {
      id: `P${this.pageIndex + 1}-L${i}`,
      index: i,
      pageIndex: this.pageIndex,
      group: wallDebugGroup(r),
      reason: REASON_TEXT[r] ?? `reason ${r}`,
      lengthMm: Math.hypot(x1 - x0, y1 - y0) * this.mmPerPt,
      strokeWidthPt: s[o + SEG_WIDTH]!,
      kind: KIND_TEXT[s[o + SEG_KIND]! & KIND_MASK] ?? 'unknown',
      x0,
      y0,
      x1,
      y1,
    };
  }
}

/** Draws every line of `data` into `layer`, one Graphics per colour group (so a group hides without a redraw), with 1-pixel lines at any zoom. Kept walls are drawn last, on top. */
export function drawWallDebug(layer: Container, data: WallDebugData | null, hidden: ReadonlySet<WallDebugGroup>): void {
  for (const child of layer.removeChildren()) child.destroy();
  if (!data) return;
  const S = SEGMENT_STRIDE;
  const seg = data.segments;
  const byGroup = new Map<WallDebugGroup, Graphics>();
  for (const { group } of [...WALL_DEBUG_GROUPS].reverse()) {
    const g = new Graphics();
    g.label = group;
    g.visible = !hidden.has(group);
    byGroup.set(group, g);
    layer.addChild(g);
  }
  for (let i = 0; i < data.segmentCount; i++) {
    const o = i * S;
    byGroup.get(wallDebugGroup(data.reason[i]!))!.moveTo(seg[o + SEG_X0]!, seg[o + SEG_Y0]!).lineTo(seg[o + SEG_X1]!, seg[o + SEG_Y1]!);
  }
  for (const { group, color } of WALL_DEBUG_GROUPS) byGroup.get(group)!.stroke({ width: 1, color, alpha: group === 'other' ? 0.45 : 0.95, pixelLine: true });
  const highlight = new Graphics();
  highlight.label = 'highlight';
  layer.addChild(highlight);
}

/** Shows or hides the colour groups of an already drawn layer. */
export function setWallDebugGroupVisibility(layer: Container, hidden: ReadonlySet<WallDebugGroup>): void {
  for (const child of layer.children) if (child.label !== 'highlight') child.visible = !hidden.has(child.label as WallDebugGroup);
}

/** Marks the line under the pointer with a thick black line (`widthPt` in page points, so the caller keeps it a few screen pixels wide). */
export function drawWallDebugHighlight(layer: Container, data: WallDebugData | null, index: number | null, widthPt: number): void {
  const highlight = layer.children.find((c) => c.label === 'highlight') as Graphics | undefined;
  if (!highlight) return;
  highlight.clear();
  if (!data || index === null) return;
  const o = index * SEGMENT_STRIDE;
  const s = data.segments;
  highlight.moveTo(s[o + SEG_X0]!, s[o + SEG_Y0]!).lineTo(s[o + SEG_X1]!, s[o + SEG_Y1]!).stroke({ width: widthPt, color: 0x000000, alpha: 0.9, cap: 'round' });
}
