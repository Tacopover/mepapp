import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { SchematicSymbol, SheetSize, SymbolShape } from '@mepapp/core';
import type { SheetDrawPointer } from './components/SheetBlockCanvas.js';
import {
  DEFAULT_LINE_WIDTH_MM,
  addCorner,
  drawStyle,
  finishShape,
  growDraft,
  isDragTool,
  polygonFromCorners,
  snapPoint,
  startDraft,
  type DrawnItem,
  type SheetDrawTool,
} from './sheetDraw.js';
import { SymbolShapesSvg } from './symbolShapeSvg.js';

// State and pointer handling of the draw tools on the sheet (electrical-schematic-templates.md Phase
// 5b-3), shared by the template editor and the schematic dialog. It only produces `DrawnItem`s; the
// caller decides what a finished item becomes (a template block, or an extra of a schematic).

interface Point {
  x: number;
  y: number;
}

export interface UseSheetDrawOptions {
  sheet: SheetSize;
  /** Grid in mm for the points of a shape. Alt turns it off for one pointer event. */
  grid: number;
  onFinish: (item: DrawnItem) => void;
}

const DEFAULT_TEXT = 'Text';
const OVERLAY_MIN_STROKE_MM = 0.05;
const GHOST_INK = '#175a8a';

export function useSheetDraw({ sheet, grid, onFinish }: UseSheetDrawOptions) {
  const [tool, setToolState] = useState<SheetDrawTool>('select');
  const [lineWidthMm, setLineWidthMm] = useState(DEFAULT_LINE_WIDTH_MM);
  const [fill, setFill] = useState(false);
  const [keepTool, setKeepTool] = useState(false);
  const [symbol, setSymbol] = useState<SchematicSymbol | null>(null);
  const [draft, setDraft] = useState<SymbolShape | null>(null);
  const [corners, setCorners] = useState<Point[]>([]);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [pendingText, setPendingText] = useState<Point | null>(null);
  const [textValue, setTextValue] = useState(DEFAULT_TEXT);
  const startRef = useRef<Point | null>(null);

  function clearActivity() {
    setDraft(null);
    setCorners([]);
    setPendingText(null);
    startRef.current = null;
  }

  function setTool(next: SheetDrawTool) {
    clearActivity();
    setToolState(next);
  }

  function finish(item: DrawnItem, keep: boolean) {
    clearActivity();
    onFinish(item);
    if (!keepTool && !keep) setToolState('select');
  }

  const at = (point: Point, event: { altKey: boolean }) => snapPoint(point, event.altKey ? 0 : grid);
  const style = () => drawStyle(lineWidthMm, fill, sheet);

  function finishPolygon() {
    const polygon = polygonFromCorners(crypto.randomUUID(), corners, sheet, style());
    const item = polygon ? finishShape(polygon, sheet, lineWidthMm) : undefined;
    if (item) finish(item, false);
  }

  function confirmText() {
    if (!pendingText) return;
    const text = textValue.trim() === '' ? DEFAULT_TEXT : textValue;
    finish({ kind: 'text', at: pendingText, text }, false);
    setTextValue(DEFAULT_TEXT);
  }

  const pointerHandlers: SheetDrawPointer = {
    active: tool !== 'select',
    onDown(point: Point, event: ReactPointerEvent<SVGSVGElement>) {
      const p = at(point, event);
      if (isDragTool(tool)) {
        startRef.current = p;
        setDraft(startDraft(tool, crypto.randomUUID(), p, sheet, style()));
      } else if (tool === 'polygon') {
        setCorners((current) => addCorner(current, p));
      } else if (tool === 'text') {
        setPendingText(p);
      } else if (tool === 'symbol' && symbol) {
        finish({ kind: 'symbol', at: p, symbol }, event.shiftKey);
      }
    },
    onMove(point: Point, event: ReactPointerEvent<SVGSVGElement>) {
      const p = at(point, event);
      setPointer(p);
      if (draft && startRef.current) setDraft(growDraft(draft, startRef.current, p, sheet));
    },
    onUp(point: Point, event: ReactPointerEvent<SVGSVGElement>) {
      const start = startRef.current;
      if (!draft || !start) return;
      const item = finishShape(growDraft(draft, start, at(point, event), sheet), sheet, lineWidthMm);
      if (item) finish(item, event.shiftKey);
      else clearActivity();
    },
    onDoubleClick() {
      if (tool === 'polygon') finishPolygon();
    },
  };

  /** Escape: cancels what is being drawn, or else leaves the tool. Returns true when it did something. */
  function escape(): boolean {
    if (draft || corners.length > 0 || pendingText) {
      clearActivity();
      return true;
    }
    if (tool !== 'select') {
      setToolState('select');
      return true;
    }
    return false;
  }

  /** Enter and Backspace while a polygon is being drawn. Returns true when the key was used. */
  function keyDown(event: { key: string }): boolean {
    if (tool !== 'polygon') return false;
    if (event.key === 'Enter' && corners.length >= 3) {
      finishPolygon();
      return true;
    }
    if (event.key === 'Backspace' && corners.length > 0) {
      setCorners((current) => current.slice(0, -1));
      return true;
    }
    return false;
  }

  const overlay = (
    <g pointerEvents="none">
      {draft && <SymbolShapesSvg shapes={[draft]} widthPx={sheet.widthMm} heightPx={sheet.heightMm} minStrokePx={OVERLAY_MIN_STROKE_MM} />}
      {tool === 'polygon' && corners.length > 0 && (
        <polyline points={[...corners, ...(pointer ? [pointer] : [])].map((c) => `${c.x},${c.y}`).join(' ')} fill="none" stroke={GHOST_INK} strokeWidth={lineWidthMm} strokeDasharray={`${lineWidthMm * 6} ${lineWidthMm * 3}`} />
      )}
      {pendingText && <circle cx={pendingText.x} cy={pendingText.y} r={1} fill={GHOST_INK} />}
      {tool === 'symbol' && symbol && pointer && (
        <g opacity={0.5} transform={`translate(${pointer.x} ${pointer.y})`}>
          <SymbolShapesSvg shapes={symbol.shapes} widthPx={symbol.widthMm} heightPx={symbol.heightMm} minStrokePx={OVERLAY_MIN_STROKE_MM} />
        </g>
      )}
    </g>
  );

  return {
    tool,
    setTool,
    lineWidthMm,
    setLineWidthMm,
    fill,
    setFill,
    keepTool,
    setKeepTool,
    symbol,
    setSymbol,
    pendingText,
    textValue,
    setTextValue,
    confirmText,
    escape,
    keyDown,
    pointer: pointerHandlers,
    overlay,
  };
}

export type SheetDraw = ReturnType<typeof useSheetDraw>;
