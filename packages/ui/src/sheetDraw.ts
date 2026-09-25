import {
  circuitMatchesRule,
  createDraftShape,
  drawnShapeToBlock,
  getEffectiveCircuitTypeId,
  snapToGrid,
  symbolShapeBounds,
  updateDraftShape,
  type GeneratedSchematic,
  type SchematicInput,
  type SchematicSymbol,
  type SchematicTemplate,
  type SheetSize,
  type SymbolShape,
  type SymbolShapeStyle,
} from '@mepapp/core';

// Pure helpers for drawing on the sheet (electrical-schematic-templates.md Phase 5b-3). The user
// draws in sheet mm. While a shape is being drawn it is stored as fractions of the whole sheet, the
// coordinate system that the shared shape functions expect; when it is finished it turns into one
// small block (`drawnShapeToBlock`).

export type SheetDrawTool = 'select' | 'line' | 'arrow' | 'rect' | 'circle' | 'ellipse' | 'arc' | 'polygon' | 'text' | 'symbol';
export type SheetDragTool = 'line' | 'arrow' | 'rect' | 'circle' | 'ellipse' | 'arc';

export const SHEET_DRAW_TOOLS: { id: SheetDrawTool; label: string; hint: string }[] = [
  { id: 'select', label: 'Select', hint: 'Select, move, rotate and resize blocks' },
  { id: 'line', label: 'Line', hint: 'Drag to draw a line' },
  { id: 'arrow', label: 'Arrow', hint: 'Drag to draw an arrow' },
  { id: 'rect', label: 'Rectangle', hint: 'Drag from corner to corner' },
  { id: 'circle', label: 'Circle', hint: 'Drag from the centre outwards' },
  { id: 'ellipse', label: 'Ellipse', hint: 'Drag from corner to corner of the box' },
  { id: 'arc', label: 'Arc', hint: 'Drag from the centre outwards. The arc sweeps 270 degrees; change it in Edit drawing' },
  { id: 'polygon', label: 'Polygon', hint: 'Click the corners. Double-click or press Enter to finish, Backspace removes the last corner' },
  { id: 'text', label: 'Text', hint: 'Click where the text goes, then type it' },
  { id: 'symbol', label: 'Symbol', hint: 'Choose a symbol from the library, then click where it goes' },
];

export const LINE_WIDTHS_MM = [0.25, 0.35, 0.5, 0.7];
export const DEFAULT_LINE_WIDTH_MM = 0.35;
export const DRAW_INK = '#111111';

/** A shape that is smaller than this, in mm, on both axes is a click, not a drawing. */
const MIN_EXTENT_MM = 1;
/** Corners closer together than this, in mm, count as one (a double-click adds the same corner twice). */
const SAME_CORNER_MM = 0.5;

interface Point {
  x: number;
  y: number;
}

export function isDragTool(tool: SheetDrawTool): tool is SheetDragTool {
  return tool === 'line' || tool === 'arrow' || tool === 'rect' || tool === 'circle' || tool === 'ellipse' || tool === 'arc';
}

export function snapPoint(point: Point, grid: number): Point {
  return { x: snapToGrid(point.x, grid), y: snapToGrid(point.y, grid) };
}

export function toSheetFraction(point: Point, sheet: SheetSize): { fractionX: number; fractionY: number } {
  return { fractionX: point.x / sheet.widthMm, fractionY: point.y / sheet.heightMm };
}

/** The style of a shape while it is drawn. `drawnShapeToBlock` sets the final line width in mm. */
export function drawStyle(lineWidthMm: number, fill: boolean, sheet: SheetSize): SymbolShapeStyle {
  return { stroke: DRAW_INK, strokeWidth: lineWidthMm / Math.min(sheet.widthMm, sheet.heightMm), fill: fill ? DRAW_INK : null };
}

export function startDraft(tool: SheetDragTool, id: string, start: Point, sheet: SheetSize, style: SymbolShapeStyle): SymbolShape {
  return createDraftShape(tool, id, toSheetFraction(start, sheet), style);
}

export function growDraft(draft: SymbolShape, start: Point, current: Point, sheet: SheetSize): SymbolShape {
  return updateDraftShape(draft, toSheetFraction(start, sheet), toSheetFraction(current, sheet), { widthPx: sheet.widthMm, heightPx: sheet.heightMm });
}

/** A closed polygon through the corners, or undefined with fewer than three. */
export function polygonFromCorners(id: string, corners: Point[], sheet: SheetSize, style: SymbolShapeStyle): SymbolShape | undefined {
  if (corners.length < 3) return undefined;
  return { id, kind: 'polygon', points: corners.map((c) => ({ x: c.x / sheet.widthMm, y: c.y / sheet.heightMm })), style, rotation: 0 };
}

/** Adds a corner unless it sits on the previous one. */
export function addCorner(corners: Point[], point: Point): Point[] {
  const last = corners[corners.length - 1];
  if (last && Math.hypot(point.x - last.x, point.y - last.y) < SAME_CORNER_MM) return corners;
  return [...corners, point];
}

export interface DrawnBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DrawnItem =
  | { kind: 'shape'; box: DrawnBox; shape: SymbolShape }
  | { kind: 'text'; at: Point; text: string }
  | { kind: 'symbol'; at: Point; symbol: SchematicSymbol };

/** The block that a finished shape becomes, or undefined when it is too small to be more than a click. */
export function finishShape(shape: SymbolShape, sheet: SheetSize, lineWidthMm: number): DrawnItem | undefined {
  const bounds = symbolShapeBounds(shape, sheet.widthMm, sheet.heightMm);
  if (bounds.width * sheet.widthMm < MIN_EXTENT_MM && bounds.height * sheet.heightMm < MIN_EXTENT_MM) return undefined;
  const { shape: placed, ...box } = drawnShapeToBlock(shape, sheet, lineWidthMm);
  return { kind: 'shape', box, shape: placed };
}

const TEXT_MM_PER_CHAR = 1.6;
const TEXT_HEIGHT_MM = 6;

/** A size for a text block that holds `text` on one line at the default font size. */
export function textBlockSize(text: string): { width: number; height: number } {
  const longest = Math.max(...text.split('\n').map((line) => line.length), 1);
  return { width: Math.max(8, Math.ceil(longest * TEXT_MM_PER_CHAR + 2)), height: Math.max(TEXT_HEIGHT_MM, text.split('\n').length * 4 + 2) };
}

/**
 * The sheet position of the first circuit that `groupId` draws, or undefined when it draws none. A
 * shape drawn "into a group" is stored relative to a circuit origin, and the first circuit is the one
 * the user sees it on while drawing.
 */
export function firstCircuitOrigin(template: SchematicTemplate, input: SchematicInput, generated: GeneratedSchematic, groupId: string): { x: number; y: number } | undefined {
  for (const circuitId of generated.circuitOrder) {
    const circuit = input.circuits.find((c) => c.id === circuitId);
    if (!circuit) continue;
    const group = template.groups.find((g) => circuitMatchesRule(g.rule, circuit, getEffectiveCircuitTypeId(circuit, input.panel)));
    if (group?.id === groupId) return generated.circuitOrigins[circuitId];
  }
  return undefined;
}

/** Rounds a length in mm to 3 decimals, so a stored position does not carry floating-point noise. */
export const roundMm = (value: number): number => Math.round(value * 1000) / 1000;
