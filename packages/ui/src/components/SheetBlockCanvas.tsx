import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { resizeKeepingCorner, rotationFromPointer, snapToGrid, toBlockAxes, type ResolvedBlock, type SymbolShape } from '@mepapp/core';
import { SchematicBlockSvg } from '../schematicBlockSvg.js';
import type { useSheetView } from '../useSheetView.js';

// The editing surface that the template editor and the schematic dialog share: the sheet, the drawn
// blocks, a hit layer, outlines and handles for the selected block, and the pointer gestures that
// move, rotate and resize it. What a block maps to (a template block, or an extra of a schematic) is
// the caller's business: it passes `targetOf` and receives edits in the target's own coordinates.

const MOVE_THRESHOLD_PX = 3;
const ACCENT = '#175a8a';

interface Point {
  x: number;
  y: number;
}

interface GestureBase {
  pointerId: number;
  startClient: Point;
  start: Point;
  moved: boolean;
}

type Gesture<T> =
  | (GestureBase & { kind: 'move'; target: T; originX: number; originY: number })
  | (GestureBase & { kind: 'rotate'; target: T; center: Point })
  | (GestureBase & { kind: 'resize'; target: T; originX: number; originY: number; width: number; height: number; rotation: number })
  | (GestureBase & { kind: 'anchor'; anchor: Point });

/** Pointer handlers of a draw tool. While `active`, the canvas sends every left-button gesture here instead of selecting blocks. */
export interface SheetDrawPointer {
  active: boolean;
  onDown: (point: Point, event: ReactPointerEvent<SVGSVGElement>) => void;
  onMove: (point: Point, event: ReactPointerEvent<SVGSVGElement>) => void;
  onUp: (point: Point, event: ReactPointerEvent<SVGSVGElement>) => void;
  onDoubleClick: () => void;
}

export interface SheetBlockCanvasProps<T> {
  ariaLabel: string;
  sheetWidthMm: number;
  sheetHeightMm: number;
  sheetView: Pick<ReturnType<typeof useSheetView>, 'view' | 'setSvg' | 'clientToSheet' | 'mmPerPixel' | 'startPan' | 'movePan' | 'endPan'>;
  blocks: ResolvedBlock[];
  /** Grid in mm for move, rotate and resize. 0 = off. Alt turns it off for one gesture. */
  grid: number;
  /** Blocks of any other group draw faint. */
  dimGroupId?: string | null;
  showEmptyDrawings?: boolean;
  loadShapesFor: (definitionId: string | undefined) => SymbolShape[] | undefined;
  symbolShapesFor: (symbolId: string | undefined) => SymbolShape[] | undefined;
  /** What the user edits when a block is hit. undefined = the block cannot be selected. */
  targetOf: (block: ResolvedBlock) => T | undefined;
  sameTarget: (a: T, b: T) => boolean;
  /** Part of the history key of a gesture on this target. */
  targetKey: (target: T) => string;
  selected: T | null;
  /** The resolved block that was clicked, so its handles show when the target repeats. */
  instanceId: string | null;
  onSelect: (target: T | null, instanceId: string | null) => void;
  /** The target's own x and y: the values that a move and a resize start from. */
  readOrigin: (target: T) => Point | undefined;
  onMove: (target: T, x: number, y: number, gestureKey: string) => void;
  onRotate: (target: T, rotation: number, gestureKey: string) => void;
  onResize: (target: T, patch: { x: number; y: number; width: number; height: number }, gestureKey: string) => void;
  onGestureEnd: () => void;
  /** A draggable crosshair, for the template's group anchor. */
  anchor?: { x: number; y: number; label: string; onMove: (x: number, y: number, gestureKey: string) => void };
  draw?: SheetDrawPointer;
  onDoubleClick?: (event: ReactMouseEvent<SVGSVGElement>) => void;
  /** Called on every pointer down, so the caller can take keyboard focus. */
  onFocusRequest?: () => void;
  /** Drawn above the blocks and below the selection handles, in sheet mm. */
  overlay?: ReactNode;
  /** Drawn on top of everything, in sheet mm (marks that must stay visible). */
  topOverlay?: ReactNode;
}

export function SheetBlockCanvas<T>({
  ariaLabel,
  sheetWidthMm,
  sheetHeightMm,
  sheetView,
  blocks,
  grid,
  dimGroupId,
  showEmptyDrawings,
  loadShapesFor,
  symbolShapesFor,
  targetOf,
  sameTarget,
  targetKey,
  selected,
  instanceId,
  onSelect,
  readOrigin,
  onMove,
  onRotate,
  onResize,
  onGestureEnd,
  anchor,
  draw,
  onDoubleClick,
  onFocusRequest,
  overlay,
  topOverlay,
}: SheetBlockCanvasProps<T>) {
  const { view, setSvg, clientToSheet, mmPerPixel: px, startPan, movePan, endPan } = sheetView;
  const gestureRef = useRef<Gesture<T> | null>(null);
  const panClickRef = useRef<Point | null>(null);
  const drawPointerRef = useRef<number | null>(null);

  const isSelected = (block: ResolvedBlock) => {
    const target = targetOf(block);
    return selected !== null && target !== undefined && sameTarget(target, selected);
  };
  const instances = selected === null ? [] : blocks.filter(isSelected);
  const handleInstance = instances.find((b) => b.id === instanceId) ?? instances[0];
  const drawing = draw?.active === true;

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    event.preventDefault();
    onFocusRequest?.();
    const pointer = clientToSheet(event.clientX, event.clientY);
    if (event.button === 1 || !pointer) {
      startPan(event);
      return;
    }
    if (event.button !== 0) return;
    if (drawing && draw) {
      drawPointerRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      draw.onDown(pointer, event);
      return;
    }
    const element = event.target as Element;
    const handle = element.closest('[data-handle]')?.getAttribute('data-handle');
    const hitId = element.closest('[data-hit-block]')?.getAttribute('data-hit-block');
    const base = { pointerId: event.pointerId, startClient: { x: event.clientX, y: event.clientY }, start: pointer, moved: false };

    if (handle === 'anchor' && anchor) {
      gestureRef.current = { ...base, kind: 'anchor', anchor: { x: anchor.x, y: anchor.y } };
    } else if ((handle === 'rotate' || handle === 'resize') && selected !== null && handleInstance) {
      const origin = readOrigin(selected);
      if (!origin) return;
      gestureRef.current =
        handle === 'rotate'
          ? { ...base, kind: 'rotate', target: selected, center: { x: handleInstance.x + handleInstance.width / 2, y: handleInstance.y + handleInstance.height / 2 } }
          : { ...base, kind: 'resize', target: selected, originX: origin.x, originY: origin.y, width: handleInstance.width, height: handleInstance.height, rotation: handleInstance.rotation };
    } else if (hitId) {
      const hit = blocks.find((b) => b.id === hitId);
      const target = hit ? targetOf(hit) : undefined;
      const origin = target !== undefined ? readOrigin(target) : undefined;
      if (!hit || target === undefined || !origin) return;
      onSelect(target, hit.id);
      gestureRef.current = { ...base, kind: 'move', target, originX: origin.x, originY: origin.y };
    } else {
      startPan(event);
      panClickRef.current = { x: event.clientX, y: event.clientY };
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (drawing && draw) {
      const point = clientToSheet(event.clientX, event.clientY);
      if (point) draw.onMove(point, event);
      if (drawPointerRef.current !== null) return;
    }
    const gesture = gestureRef.current;
    if (!gesture) {
      movePan(event);
      return;
    }
    if (gesture.pointerId !== event.pointerId) return;
    if (!gesture.moved && Math.hypot(event.clientX - gesture.startClient.x, event.clientY - gesture.startClient.y) < MOVE_THRESHOLD_PX) return;
    gesture.moved = true;
    const pointer = clientToSheet(event.clientX, event.clientY);
    if (!pointer) return;
    const snap = event.altKey ? 0 : grid;
    const dx = pointer.x - gesture.start.x;
    const dy = pointer.y - gesture.start.y;

    if (gesture.kind === 'move') {
      onMove(gesture.target, snapToGrid(gesture.originX + dx, snap), snapToGrid(gesture.originY + dy, snap), `move:${targetKey(gesture.target)}`);
    } else if (gesture.kind === 'rotate') {
      onRotate(gesture.target, rotationFromPointer(gesture.center, pointer, event.shiftKey ? undefined : 5), `rotate:${targetKey(gesture.target)}`);
    } else if (gesture.kind === 'resize') {
      const local = toBlockAxes(dx, dy, gesture.rotation);
      const width = Math.max(1, snapToGrid(gesture.width + local.x, snap));
      const height = Math.max(1, snapToGrid(gesture.height + local.y, snap));
      const position = resizeKeepingCorner({ x: gesture.originX, y: gesture.originY, rotation: gesture.rotation }, { width: gesture.width, height: gesture.height }, { width, height });
      onResize(gesture.target, { width, height, ...position }, `resize:${targetKey(gesture.target)}`);
    } else if (anchor) {
      anchor.onMove(snapToGrid(gesture.anchor.x + dx, snap), snapToGrid(gesture.anchor.y + dy, snap), 'anchor');
    }
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (drawPointerRef.current !== null) {
      drawPointerRef.current = null;
      const point = clientToSheet(event.clientX, event.clientY);
      if (draw && point && event.type === 'pointerup') draw.onUp(point, event);
      return;
    }
    gestureRef.current = null;
    endPan();
    onGestureEnd();
    const click = panClickRef.current;
    panClickRef.current = null;
    if (click && event.type === 'pointerup' && Math.hypot(event.clientX - click.x, event.clientY - click.y) < MOVE_THRESHOLD_PX + 1) onSelect(null, null);
  }

  function handleDoubleClick(event: ReactMouseEvent<SVGSVGElement>) {
    if (drawing && draw) draw.onDoubleClick();
    else onDoubleClick?.(event);
  }

  return (
    <svg
      ref={setSvg}
      className="mep-schematic-canvas"
      role="img"
      aria-label={ariaLabel}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      style={drawing ? { cursor: 'crosshair' } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={handleDoubleClick}
    >
      <rect x={0} y={0} width={sheetWidthMm} height={sheetHeightMm} fill="#ffffff" stroke="#9aa3ad" strokeWidth={0.4} />
      <g pointerEvents="none">
        {blocks.map((block) => (
          <g key={block.id} opacity={dimGroupId && block.groupId !== undefined && block.groupId !== dimGroupId ? 0.3 : 1}>
            <SchematicBlockSvg block={block} loadShapes={block.type === 'loadSymbol' ? loadShapesFor(block.loadStampDefinitionId) : undefined} symbolShapes={symbolShapesFor(block.symbolId)} showEmptyDrawings={showEmptyDrawings} />
          </g>
        ))}
      </g>

      {!drawing && (
        <g>
          {blocks.map((block) => {
            if (targetOf(block) === undefined) return null;
            const outlineOnly = block.type === 'frame' || block.type === 'section';
            return (
              <g key={block.id} transform={`translate(${block.x} ${block.y}) rotate(${block.rotation} ${block.width / 2} ${block.height / 2})`}>
                <rect
                  data-hit-block={block.id}
                  width={block.width}
                  height={block.height}
                  fill={outlineOnly ? 'none' : 'transparent'}
                  stroke={outlineOnly ? 'transparent' : 'none'}
                  strokeWidth={outlineOnly ? Math.max(3, px * 6) : undefined}
                  pointerEvents={outlineOnly ? 'stroke' : 'all'}
                  cursor="move"
                />
              </g>
            );
          })}
        </g>
      )}

      {overlay}

      <g pointerEvents="none">
        {instances.map((block) => (
          <rect
            key={block.id}
            transform={`translate(${block.x} ${block.y}) rotate(${block.rotation} ${block.width / 2} ${block.height / 2})`}
            width={block.width}
            height={block.height}
            fill="none"
            stroke={ACCENT}
            strokeWidth={px * (block === handleInstance ? 2 : 1)}
            strokeDasharray={block === handleInstance ? undefined : `${px * 4} ${px * 3}`}
          />
        ))}
      </g>

      {handleInstance && !drawing && (
        <g transform={`translate(${handleInstance.x} ${handleInstance.y}) rotate(${handleInstance.rotation} ${handleInstance.width / 2} ${handleInstance.height / 2})`}>
          <line x1={handleInstance.width / 2} y1={0} x2={handleInstance.width / 2} y2={-px * 16} stroke={ACCENT} strokeWidth={px} pointerEvents="none" />
          <circle data-handle="rotate" cx={handleInstance.width / 2} cy={-px * 16} r={px * 5} fill="#ffffff" stroke={ACCENT} strokeWidth={px * 1.5} cursor="grab" />
          <rect data-handle="resize" x={handleInstance.width - px * 4} y={handleInstance.height - px * 4} width={px * 8} height={px * 8} fill="#ffffff" stroke={ACCENT} strokeWidth={px * 1.5} cursor="nwse-resize" />
        </g>
      )}

      {anchor && (
        <g data-handle="anchor" cursor={drawing ? undefined : 'move'} pointerEvents={drawing ? 'none' : undefined}>
          <circle cx={anchor.x} cy={anchor.y} r={px * 9} fill="transparent" pointerEvents="all" />
          <g pointerEvents="none" stroke={ACCENT} strokeWidth={px * 1.5}>
            <line x1={anchor.x - px * 8} y1={anchor.y} x2={anchor.x + px * 8} y2={anchor.y} />
            <line x1={anchor.x} y1={anchor.y - px * 8} x2={anchor.x} y2={anchor.y + px * 8} />
            <circle cx={anchor.x} cy={anchor.y} r={px * 4} fill="none" />
            <text x={anchor.x + px * 10} y={anchor.y - px * 6} fontSize={px * 11} fill={ACCENT} stroke="none" fontFamily="Arial, Helvetica, sans-serif">
              {anchor.label}
            </text>
          </g>
        </g>
      )}
      {topOverlay}
    </svg>
  );
}
