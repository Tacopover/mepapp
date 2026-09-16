// Vector primitives for the Element Editor dialog's Shapes mode
// (ports-custom-element-editor-spec.md §5.3) — the editable source for a
// custom StampDefinition's artwork. Every coordinate is fractional over the
// definition's own bounding box (0..1), the same convention PortSpec already
// uses for fractionX/fractionY, so a shape stays correctly placed regardless
// of the definition's final nativeWidth/nativeHeight. No rendering here —
// packages/render's SymbolShape rasterizer (or the Element Editor's own
// editing canvas) is what actually draws these; core stays rendering-free.

export interface SymbolShapeStyle {
  stroke: string;
  strokeWidth: number;
  /** null = unfilled (stroke only). Ignored by 'line' and 'arc', which are never filled. Stroke/strokeWidth/fill are all ignored by 'image' too — every SymbolShape still carries a style so call sites (the style toolbar, activeStyle fallback) never need a kind-aware branch. */
  fill: string | null;
}

/** Radians, about the shape's own bounds center. Optional/absent means 0 — same defaultable convention as `shapes?` itself, no schema version bump needed. */
type Rotatable = { rotation?: number };

/**
 * Cumulative factor applied by the Element Editor's Scale % field/handle since the shape was
 * created (1 = never scaled that way). Optional/absent means 1, same defaultable convention as
 * `rotation?`. This is bookkeeping only, purely for that UI to show/target an absolute "current
 * scale" for the selected shape — nothing in drawSymbolShapes/hitTestSymbolShape/symbolShapeBounds
 * reads it, since a Scale operation already bakes the size change directly into the shape's own
 * geometry (radius, width/height, points) the same way it always has. Reshaping a single dimension
 * via a corner/radius drag handle (applyHandleDrag) does NOT update this field — it tracks the
 * Scale operation specifically, not "how big is this shape" in general.
 */
type Scalable = { scale?: number };

export type SymbolShape =
  | ({ id: string; kind: 'line'; x1: number; y1: number; x2: number; y2: number; style: SymbolShapeStyle } & Rotatable & Scalable)
  | ({ id: string; kind: 'rect'; x: number; y: number; width: number; height: number; style: SymbolShapeStyle } & Rotatable & Scalable)
  | ({ id: string; kind: 'circle'; cx: number; cy: number; radius: number; style: SymbolShapeStyle } & Rotatable & Scalable)
  | ({
      id: string;
      kind: 'arc';
      cx: number;
      cy: number;
      radius: number;
      /** Radians. */
      startAngle: number;
      endAngle: number;
      style: SymbolShapeStyle;
    } & Rotatable & Scalable)
  | ({ id: string; kind: 'text'; x: number; y: number; text: string; fontSize: number; style: SymbolShapeStyle } & Rotatable & Scalable)
  /** Same two-point shape as 'line', rendered with an arrowhead at (x2,y2). */
  | ({ id: string; kind: 'arrow'; x1: number; y1: number; x2: number; y2: number; style: SymbolShapeStyle } & Rotatable & Scalable)
  | ({ id: string; kind: 'ellipse'; cx: number; cy: number; radiusX: number; radiusY: number; style: SymbolShapeStyle } & Rotatable & Scalable)
  | ({ id: string; kind: 'polygon'; points: { x: number; y: number }[]; style: SymbolShapeStyle } & Rotatable & Scalable)
  /** An imported raster/SVG image placed as a movable/deletable/resizable shape among the others (ports-custom-element-editor-spec.md's Import/Draw merge) — `dataUrl` is the same self-contained `data:` URL convention StampDefinition.iconRef already uses. Same x/y/width/height/rotation shape as 'rect'; `style` is carried but unused (drawSymbolShapes draws the image itself, no stroke/fill). */
  | ({ id: string; kind: 'image'; dataUrl: string; x: number; y: number; width: number; height: number; style: SymbolShapeStyle } & Rotatable & Scalable);
