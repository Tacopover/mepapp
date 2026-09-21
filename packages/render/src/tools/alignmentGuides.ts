import { rotatePointAround, type Vec2 } from '@mepapp/core';
import type { DrawingState } from '../document.js';
import { resolveAngleSnap } from './angleSnap.js';
import type { Bounds, SelectableRef, ToolContext } from './types.js';

export interface AlignmentGuide {
  axis: 'x' | 'y';
  /** World-space coordinate the guide line sits at along its axis. */
  value: number;
  /** Perpendicular span the guide line is drawn across (world units) — covers both the dragged selection's bounds and the matched candidate's bounds, not the whole canvas. */
  from: number;
  to: number;
}

export interface AlignmentSnapResult {
  point: Vec2;
  guides: AlignmentGuide[];
}

/** Screen-px tolerance for a guide to trigger, converted to world units at drag time — same pattern as `snapRadiusScreenPx` (segment endpoint snap). */
const GUIDE_SNAP_SCREEN_PX = 6;

/**
 * Unions the world-space bounds of every id in `ids` — the dragged selection's bounds at
 * gesture start, captured once so per-frame snapping can shift it by the frame's raw
 * delta instead of recomputing element-by-element. Mirrors SketchScene's private
 * getSelectionBoundsWorld, implemented against ToolContext instead.
 */
export function computeSelectionBoundsWorld(ctx: ToolContext, ids: Iterable<string>, state: DrawingState): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of ids) {
    const bounds = ctx.resolveSelectableBoundsWorld(ctx.selectableRefForId(id, state), state);
    if (!bounds) continue;
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

interface SnapCandidate {
  bounds: Bounds;
  /** A fitting is a point, not a box — its circle's edges are drawing detail, so only its center is a snap target. */
  centerOnly: boolean;
}

interface AxisMatch {
  delta: number;
  distance: number;
  guide: AlignmentGuide;
}

function nearerMatch(current: AxisMatch | null, next: AxisMatch): AxisMatch {
  return current === null || next.distance < current.distance ? next : current;
}

/**
 * Snaps a dragged selection's bounding box (`draggedBounds`, at the raw unsnapped drag
 * position) to the nearest edge/center alignment with any other stamp/fitting/annotation
 * on the page, independently per axis — the Figma/Illustrator "smart guide" behavior.
 * A center-to-center match on an axis always beats an edge match within tolerance, so
 * two similarly sized elements snap (and draw their guide) at the centers rather than
 * at whichever edge happens to be a hair nearer.
 * `excludeIds` is every id already part of the drag, so a selection never aligns to
 * itself. `originBounds` (move-selection only) is the selection's own bounds at drag
 * start, matched like any other candidate so an element snaps back onto its starting
 * x or y and can be dragged purely orthogonally. `draggedCenterOnly` drops the dragged
 * bounds' edges (a lone dragged fitting). Returns `rawPoint` adjusted by whichever
 * axis matched (either, both, or neither), plus the guide line(s) to render for visual
 * feedback.
 */
export function resolveAlignmentSnap(
  ctx: ToolContext,
  state: DrawingState,
  rawPoint: Vec2,
  draggedBounds: Bounds,
  excludeIds: ReadonlySet<string>,
  originBounds?: Bounds | null,
  draggedCenterOnly = false,
): AlignmentSnapResult {
  const tolerance = GUIDE_SNAP_SCREEN_PX / ctx.getZoomScale();
  const draggedCenterX = (draggedBounds.minX + draggedBounds.maxX) / 2;
  const draggedCenterY = (draggedBounds.minY + draggedBounds.maxY) / 2;
  const draggedXs = draggedCenterOnly ? [] : [draggedBounds.minX, draggedBounds.maxX];
  const draggedYs = draggedCenterOnly ? [] : [draggedBounds.minY, draggedBounds.maxY];

  const candidates: SnapCandidate[] = [];
  for (const ref of candidateRefs(state, excludeIds)) {
    const bounds = ctx.resolveSelectableBoundsWorld(ref, state);
    if (bounds) candidates.push({ bounds, centerOnly: ref.kind === 'fitting' });
  }
  if (originBounds) candidates.push({ bounds: originBounds, centerOnly: draggedCenterOnly });

  let centerX: AxisMatch | null = null;
  let edgeX: AxisMatch | null = null;
  let centerY: AxisMatch | null = null;
  let edgeY: AxisMatch | null = null;

  for (const { bounds, centerOnly } of candidates) {
    const candidateCenterX = (bounds.minX + bounds.maxX) / 2;
    const candidateCenterY = (bounds.minY + bounds.maxY) / 2;
    const candidateXs = centerOnly ? [] : [bounds.minX, bounds.maxX];
    const candidateYs = centerOnly ? [] : [bounds.minY, bounds.maxY];
    const spanY = { from: Math.min(draggedBounds.minY, bounds.minY), to: Math.max(draggedBounds.maxY, bounds.maxY) };
    const spanX = { from: Math.min(draggedBounds.minX, bounds.minX), to: Math.max(draggedBounds.maxX, bounds.maxX) };
    const matchX = (draggedValue: number, candidateValue: number): AxisMatch => ({
      delta: candidateValue - draggedValue,
      distance: Math.abs(candidateValue - draggedValue),
      guide: { axis: 'x', value: candidateValue, ...spanY },
    });
    const matchY = (draggedValue: number, candidateValue: number): AxisMatch => ({
      delta: candidateValue - draggedValue,
      distance: Math.abs(candidateValue - draggedValue),
      guide: { axis: 'y', value: candidateValue, ...spanX },
    });

    const centersX = matchX(draggedCenterX, candidateCenterX);
    if (centersX.distance < tolerance) centerX = nearerMatch(centerX, centersX);
    for (const draggedValue of [...draggedXs, draggedCenterX]) {
      for (const candidateValue of [...candidateXs, candidateCenterX]) {
        if (draggedValue === draggedCenterX && candidateValue === candidateCenterX) continue;
        const match = matchX(draggedValue, candidateValue);
        if (match.distance < tolerance) edgeX = nearerMatch(edgeX, match);
      }
    }

    const centersY = matchY(draggedCenterY, candidateCenterY);
    if (centersY.distance < tolerance) centerY = nearerMatch(centerY, centersY);
    for (const draggedValue of [...draggedYs, draggedCenterY]) {
      for (const candidateValue of [...candidateYs, candidateCenterY]) {
        if (draggedValue === draggedCenterY && candidateValue === candidateCenterY) continue;
        const match = matchY(draggedValue, candidateValue);
        if (match.distance < tolerance) edgeY = nearerMatch(edgeY, match);
      }
    }
  }

  const snapX = centerX ?? edgeX;
  const snapY = centerY ?? edgeY;
  const guides: AlignmentGuide[] = [];
  if (snapX) guides.push(snapX.guide);
  if (snapY) guides.push(snapY.guide);
  return { point: { x: rawPoint.x + (snapX?.delta ?? 0), y: rawPoint.y + (snapY?.delta ?? 0) }, guides };
}

/** Rays closer to parallel with a guide than this (|cos| or |sin| of the ray angle) never intersect it usefully — a tiny gap to the guide would throw the point far along the ray. */
const MIN_RAY_COMPONENT = 0.1;

interface RayMatch {
  isCenter: boolean;
  distance: number;
  point: Vec2;
  guide: AlignmentGuide;
}

/**
 * Segment end-point snap while angle-snap is active: the point stays on the angle-snapped
 * ray from `anchor` (see resolveAngleSnap) and slides along it to where that ray crosses
 * an alignment guide of a nearby stamp/fitting/annotation. A guide crossing is taken when
 * the ray point is within tolerance of the guide on the guide's own axis, same as
 * resolveAlignmentSnap; a center guide beats an edge guide, otherwise the nearest wins.
 * Returns the angle-snapped point unchanged (no guide) when nothing crosses in range.
 */
export function resolveRayAlignmentSnap(ctx: ToolContext, state: DrawingState, anchor: Vec2, rawPoint: Vec2, incrementDegrees: number): AlignmentSnapResult {
  const projected = resolveAngleSnap(anchor, rawPoint, incrementDegrees);
  const distance = Math.hypot(projected.x - anchor.x, projected.y - anchor.y);
  if (distance === 0) return { point: projected, guides: [] };
  const dirX = (projected.x - anchor.x) / distance;
  const dirY = (projected.y - anchor.y) / distance;
  const tolerance = GUIDE_SNAP_SCREEN_PX / ctx.getZoomScale();

  const matches: RayMatch[] = [];
  for (const ref of candidateRefs(state, new Set())) {
    const bounds = ctx.resolveSelectableBoundsWorld(ref, state);
    if (!bounds) continue;
    const centerOnly = ref.kind === 'fitting';
    const xValues = guideValues(bounds.minX, bounds.maxX, centerOnly);
    const yValues = guideValues(bounds.minY, bounds.maxY, centerOnly);

    if (Math.abs(dirX) > MIN_RAY_COMPONENT) {
      for (const { value, isCenter } of xValues) {
        const t = (value - anchor.x) / dirX;
        const axisDistance = Math.abs(projected.x - value);
        if (t <= 0 || axisDistance >= tolerance || Math.abs(t - distance) >= 2 * tolerance) continue;
        const point = { x: value, y: anchor.y + t * dirY };
        matches.push({ isCenter, distance: axisDistance, point, guide: { axis: 'x', value, from: Math.min(point.y, bounds.minY), to: Math.max(point.y, bounds.maxY) } });
      }
    }
    if (Math.abs(dirY) > MIN_RAY_COMPONENT) {
      for (const { value, isCenter } of yValues) {
        const t = (value - anchor.y) / dirY;
        const axisDistance = Math.abs(projected.y - value);
        if (t <= 0 || axisDistance >= tolerance || Math.abs(t - distance) >= 2 * tolerance) continue;
        const point = { x: anchor.x + t * dirX, y: value };
        matches.push({ isCenter, distance: axisDistance, point, guide: { axis: 'y', value, from: Math.min(point.x, bounds.minX), to: Math.max(point.x, bounds.maxX) } });
      }
    }
  }

  const pool = matches.some((m) => m.isCenter) ? matches.filter((m) => m.isCenter) : matches;
  let best: RayMatch | null = null;
  for (const match of pool) if (!best || match.distance < best.distance) best = match;
  return best ? { point: best.point, guides: [best.guide] } : { point: projected, guides: [] };
}

function guideValues(min: number, max: number, centerOnly: boolean): Array<{ value: number; isCenter: boolean }> {
  const center = { value: (min + max) / 2, isCenter: true };
  return centerOnly ? [center] : [{ value: min, isCenter: false }, { value: max, isCenter: false }, center];
}

/**
 * World-space bounds of a stamp not yet placed (the placement-preview ghost), given the
 * center it would land at — same corner/rotation math as SketchScene's private
 * stampCornersWorld, but against a candidate center instead of an already-placed
 * PlacedStamp, since the ghost has no id/state entry to look up bounds for.
 */
export function computeStampBoundsWorld(center: Vec2, nativeWidth: number, nativeHeight: number, scale: number, rotationDegrees: number): Bounds {
  const halfWidth = (nativeWidth / 2) * scale;
  const halfHeight = (nativeHeight / 2) * scale;
  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((local) => {
    const r = rotationDegrees === 0 ? local : rotatePointAround(local, { x: 0, y: 0 }, rotationDegrees);
    return { x: r.x + center.x, y: r.y + center.y };
  });
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    minY: Math.min(...corners.map((c) => c.y)),
    maxX: Math.max(...corners.map((c) => c.x)),
    maxY: Math.max(...corners.map((c) => c.y)),
  };
}

function candidateRefs(state: DrawingState, excludeIds: ReadonlySet<string>): SelectableRef[] {
  const refs: SelectableRef[] = [];
  for (const id of Object.keys(state.stamps)) if (!excludeIds.has(id)) refs.push({ kind: 'stamp', id });
  for (const id of Object.keys(state.fittings)) if (!excludeIds.has(id)) refs.push({ kind: 'fitting', id });
  for (const id of Object.keys(state.annotations)) if (!excludeIds.has(id)) refs.push({ kind: 'annotation', id });
  return refs;
}
