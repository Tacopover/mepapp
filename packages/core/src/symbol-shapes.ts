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
  /** null = unfilled (stroke only). Ignored by 'line' and 'arc', which are never filled. */
  fill: string | null;
}

export type SymbolShape =
  | { id: string; kind: 'line'; x1: number; y1: number; x2: number; y2: number; style: SymbolShapeStyle }
  | { id: string; kind: 'rect'; x: number; y: number; width: number; height: number; style: SymbolShapeStyle }
  | { id: string; kind: 'circle'; cx: number; cy: number; radius: number; style: SymbolShapeStyle }
  | {
      id: string;
      kind: 'arc';
      cx: number;
      cy: number;
      radius: number;
      /** Radians. */
      startAngle: number;
      endAngle: number;
      style: SymbolShapeStyle;
    }
  | { id: string; kind: 'text'; x: number; y: number; text: string; fontSize: number; style: SymbolShapeStyle }
  /** Same two-point shape as 'line', rendered with an arrowhead at (x2,y2). */
  | { id: string; kind: 'arrow'; x1: number; y1: number; x2: number; y2: number; style: SymbolShapeStyle }
  | { id: string; kind: 'ellipse'; cx: number; cy: number; radiusX: number; radiusY: number; style: SymbolShapeStyle }
  | { id: string; kind: 'polygon'; points: { x: number; y: number }[]; style: SymbolShapeStyle };
