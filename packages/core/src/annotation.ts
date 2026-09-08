// Domain model for user-drawn markup (freehand/line/arrow/rectangle/circle/
// textbox/stickyNote/highlight/polyline) — distinct from Segment/Fitting
// (network topology, network.ts) and PlacedStamp (equipment/terminal
// symbols, stamp.ts). No rendering, no I/O; @mepapp/render maps these to
// real PDF annotation objects via @mepapp/pdf-engine's
// AnnotationKind/AnnotationGeometry, which this type mirrors field-for-field
// for the kinds MepApp itself authors (see annotationSyncEntry in
// render/scene.ts) — `stamp` isn't a user-facing draw tool, so it has no
// domain counterpart here.

import type { Vec2 } from './geometry.js';

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
  | { kind: 'textbox'; rect: AnnotationRect; text: string }
  | { kind: 'stickyNote'; position: Vec2; text: string }
  | { kind: 'highlight'; rect: AnnotationRect }
  | { kind: 'polyline'; points: Vec2[] };

export interface Annotation {
  id: string;
  pageIndex: number;
  /** geometry.kind is the annotation's kind — no redundant top-level field to keep in sync. */
  geometry: AnnotationGeometry;
}
