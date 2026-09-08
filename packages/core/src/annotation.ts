// Domain model for user-drawn markup (freehand/line/arrow/rectangle/circle/
// textbox/stickyNote/highlight/polyline) — distinct from Segment/Fitting
// (network topology, network.ts) and PlacedStamp (equipment/terminal
// symbols, stamp.ts). No rendering, no I/O; @mepapp/render maps these to
// real PDF annotation objects via @mepapp/pdf-engine's
// AnnotationKind/AnnotationGeometry, which this type mirrors field-for-field
// for the kinds MepApp itself authors (see annotationSyncEntry in
// render/scene.ts) — `stamp` isn't a user-facing draw tool, so it has no
// domain counterpart here.

import { normalizeDegrees, rotatePointAround, type Vec2 } from './geometry.js';

export type AnnotationKind = 'freehand' | 'line' | 'arrow' | 'rectangle' | 'circle' | 'textbox' | 'stickyNote' | 'highlight' | 'polyline';

export interface AnnotationRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type AnnotationGeometry =
  | { kind: 'freehand'; points: Vec2[] }
  | { kind: 'line'; from: Vec2; to: Vec2 }
  | { kind: 'arrow'; from: Vec2; to: Vec2 }
  | { kind: 'rectangle'; rect: AnnotationRect }
  | { kind: 'circle'; center: Vec2; radius: number }
  | { kind: 'textbox'; rect: AnnotationRect; text: string; rotationDegrees: number }
  | { kind: 'stickyNote'; position: Vec2; text: string }
  | { kind: 'highlight'; rect: AnnotationRect }
  | { kind: 'polyline'; points: Vec2[] };

export interface Annotation {
  id: string;
  pageIndex: number;
  /** geometry.kind is the annotation's kind — no redundant top-level field to keep in sync. */
  geometry: AnnotationGeometry;
}

/** Shifts an annotation's geometry by (dx, dy) — every point/rect corner/center/position field moves uniformly, kind by kind. Used by the render layer's drag-to-move gesture. */
export function translateAnnotationGeometry(g: AnnotationGeometry, dx: number, dy: number): AnnotationGeometry {
  switch (g.kind) {
    case 'freehand':
    case 'polyline':
      return { ...g, points: g.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case 'line':
    case 'arrow':
      return { ...g, from: { x: g.from.x + dx, y: g.from.y + dy }, to: { x: g.to.x + dx, y: g.to.y + dy } };
    case 'rectangle':
    case 'highlight':
    case 'textbox':
      return { ...g, rect: { x0: g.rect.x0 + dx, y0: g.rect.y0 + dy, x1: g.rect.x1 + dx, y1: g.rect.y1 + dy } };
    case 'circle':
      return { ...g, center: { x: g.center.x + dx, y: g.center.y + dy } };
    case 'stickyNote':
      return { ...g, position: { x: g.position.x + dx, y: g.position.y + dy } };
  }
}

/** The center of an AnnotationRect. */
function rectCenter(rect: AnnotationRect): Vec2 {
  return { x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2 };
}

/** The rect's 4 corners, each rotated by rotationDegrees around the rect's own center — used to draw, hit-test, and bound a rotated textbox. Identity (the plain corners) when rotationDegrees is 0. */
export function rotatedRectCorners(rect: AnnotationRect, rotationDegrees: number): Vec2[] {
  const center = rectCenter(rect);
  const corners = [
    { x: rect.x0, y: rect.y0 },
    { x: rect.x1, y: rect.y0 },
    { x: rect.x1, y: rect.y1 },
    { x: rect.x0, y: rect.y1 },
  ];
  return rotationDegrees === 0 ? corners : corners.map((c) => rotatePointAround(c, center, rotationDegrees));
}

/**
 * Rotates an annotation's geometry by deltaDegrees around `pivot` — the same
 * group-rotate gesture multiRotate gives stamps, extended to annotations,
 * which have no rotation field of their own (see the doc comment on
 * AnnotationGeometry). Point-based kinds (freehand/polyline/line/arrow)
 * rotate every point; circle rotates its center only (a circle has no
 * orientation to advance). rectangle/highlight have no rotation field in
 * either this type or the PDF annotation kinds MepApp writes for them —
 * resolved as "reposition only": their center orbits the pivot but the rect
 * itself stays axis-aligned, same width/height. stickyNote's fixed icon
 * square is treated the same way, rotating only its anchor position.
 * textbox is the one kind that genuinely tilts: its rect's center orbits the
 * pivot the same as rectangle/highlight, but its own rotationDegrees also
 * advances by deltaDegrees, so the text itself reads at an angle — see
 * rotatedRectCorners, and the render/PDF layers that consume it.
 */
export function rotateAnnotationGeometry(g: AnnotationGeometry, pivot: Vec2, deltaDegrees: number): AnnotationGeometry {
  switch (g.kind) {
    case 'freehand':
    case 'polyline':
      return { ...g, points: g.points.map((p) => rotatePointAround(p, pivot, deltaDegrees)) };
    case 'line':
    case 'arrow':
      return { ...g, from: rotatePointAround(g.from, pivot, deltaDegrees), to: rotatePointAround(g.to, pivot, deltaDegrees) };
    case 'circle':
      return { ...g, center: rotatePointAround(g.center, pivot, deltaDegrees) };
    case 'rectangle':
    case 'highlight': {
      const width = g.rect.x1 - g.rect.x0;
      const height = g.rect.y1 - g.rect.y0;
      const center = rotatePointAround(rectCenter(g.rect), pivot, deltaDegrees);
      return { ...g, rect: { x0: center.x - width / 2, y0: center.y - height / 2, x1: center.x + width / 2, y1: center.y + height / 2 } };
    }
    case 'textbox': {
      const width = g.rect.x1 - g.rect.x0;
      const height = g.rect.y1 - g.rect.y0;
      const center = rotatePointAround(rectCenter(g.rect), pivot, deltaDegrees);
      return {
        ...g,
        rect: { x0: center.x - width / 2, y0: center.y - height / 2, x1: center.x + width / 2, y1: center.y + height / 2 },
        rotationDegrees: normalizeDegrees(g.rotationDegrees + deltaDegrees),
      };
    }
    case 'stickyNote':
      return { ...g, position: rotatePointAround(g.position, pivot, deltaDegrees) };
  }
}

/** Axis-aligned world-space bounds of one annotation's geometry — used for selection-box overlay, rubber-band hit-testing, and as the fallback anchor for the group rotation handle. Annotations have no rotation of their own, so this is always axis-aligned, unlike a stamp's rotated bounding box. */
export function annotationBoundsWorld(g: AnnotationGeometry, stickyNoteIconSize: number): { minX: number; minY: number; maxX: number; maxY: number } {
  switch (g.kind) {
    case 'freehand':
    case 'polyline':
      return {
        minX: Math.min(...g.points.map((p) => p.x)),
        minY: Math.min(...g.points.map((p) => p.y)),
        maxX: Math.max(...g.points.map((p) => p.x)),
        maxY: Math.max(...g.points.map((p) => p.y)),
      };
    case 'line':
    case 'arrow':
      return {
        minX: Math.min(g.from.x, g.to.x),
        minY: Math.min(g.from.y, g.to.y),
        maxX: Math.max(g.from.x, g.to.x),
        maxY: Math.max(g.from.y, g.to.y),
      };
    case 'rectangle':
    case 'highlight':
      return {
        minX: Math.min(g.rect.x0, g.rect.x1),
        minY: Math.min(g.rect.y0, g.rect.y1),
        maxX: Math.max(g.rect.x0, g.rect.x1),
        maxY: Math.max(g.rect.y0, g.rect.y1),
      };
    case 'textbox': {
      // Rotated (or not — identity when rotationDegrees is 0), so this is
      // always the true bounding box, not just the raw rect's corners.
      const corners = rotatedRectCorners(g.rect, g.rotationDegrees);
      return {
        minX: Math.min(...corners.map((c) => c.x)),
        minY: Math.min(...corners.map((c) => c.y)),
        maxX: Math.max(...corners.map((c) => c.x)),
        maxY: Math.max(...corners.map((c) => c.y)),
      };
    }
    case 'circle':
      return { minX: g.center.x - g.radius, minY: g.center.y - g.radius, maxX: g.center.x + g.radius, maxY: g.center.y + g.radius };
    case 'stickyNote':
      return { minX: g.position.x, minY: g.position.y, maxX: g.position.x + stickyNoteIconSize, maxY: g.position.y + stickyNoteIconSize };
  }
}
