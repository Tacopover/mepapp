// The generic half of the shape-draw/edit primitive (shared-drawing-tool.md §6, Phase 2) —
// tool palette, draft/handle/marquee/select interactions, undo, view pan/zoom, and keyboard
// shortcuts, extracted from ElementEditorDialog.tsx so a second and third consumer (the
// schematic symbol editor, the schematic template editor's free items) can reuse the exact
// same interaction code instead of re-deriving it. Contains nothing stamp-specific: no ports,
// no StampDefinition, no labelLanguage. A consumer that needs an extra tool this hook doesn't
// know about (e.g. the stamp editor's 'port' tool) supplies `onUnhandledToolPointerDown`.
import { useEffect, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction } from 'react';
import {
  CommandManager,
  angleSnap,
  applyHandleDrag,
  arcFromThreePoints,
  collectSnapPoints,
  createDraftShape,
  findNearestSnapPoint,
  gridSnap,
  hitTestSymbolShape,
  isDraftLargeEnough,
  mirrorShape,
  normalizeAngle,
  rotateShapeAround,
  scaleShape,
  selectionBounds,
  selectionPivot,
  shapeHandles,
  symbolShapeBounds,
  translateShape,
  updateDraftShape,
  type ShapeDrawTool,
  type SymbolShape,
  type SymbolShapeStyle,
} from '@mepapp/core';

/** The tool's own default style — a single source of truth so every consumer's "new shape"
    default, and any dialog-side seed logic (e.g. wrapping an existing raster icon as one
    full-canvas 'image' shape), agree on the same value. */
export const DEFAULT_STYLE: SymbolShapeStyle = { stroke: '#1a1a1a', strokeWidth: 0.01, fill: null };

/** Tool names this hook handles at pointer-down by itself. A consumer's own TTool can add
    more (e.g. the stamp editor's 'port') — anything outside this set at pointer-down falls
    through to onUnhandledToolPointerDown instead of being treated as a draw tool. */
export type BuiltinShapeTool = 'select' | 'text' | 'polygon' | 'arcThreePoint' | ShapeDrawTool;

// Exhaustiveness against ShapeDrawTool is enforced by this object literal's shape: adding or
// removing a union member without updating this set is a compile error (excess/missing property).
const DRAW_TOOL_SET: Record<ShapeDrawTool, true> = { line: true, arrow: true, rect: true, circle: true, ellipse: true, arc: true };
function isDrawTool(tool: string): tool is ShapeDrawTool {
  return Object.prototype.hasOwnProperty.call(DRAW_TOOL_SET, tool);
}

/** Screen-px pan offset plus a uniform scale — maps a "world" point (the fixed
    canvasWidthPx x canvasHeightPx box shapes are defined against) to a screen point (CSS px
    within the viewport) via screen = pan + world * scale. */
export interface View {
  scale: number;
  panX: number;
  panY: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
/** Exported so a consumer's own zoom-in/out buttons (calling zoomAtScreenPoint directly, outside
    this hook's own wheel handler) use the identical step instead of a duplicated magic number. */
export const ZOOM_STEP = 1.1;

/** A fractional spacing of 0.02 (~2% of the canvas box) for grid snap — exported so a
    consumer-owned tool needing the same step (e.g. the stamp editor's port placement) doesn't
    have to redefine it; passed in explicitly wherever it's needed rather than imported as a
    shared global by anything outside this module. */
export const GRID_SPACING_FRACTION = 0.02;
const OBJECT_SNAP_THRESHOLD_PX = 10;
const DEFAULT_ANGLE_SNAP_DEGREES = 45;
const DUPLICATE_OFFSET_FRACTION = 0.03;

/** Rotate-handle screen-px offset from the selection's top edge (constant on-screen size
    regardless of zoom — divided by `scale` wherever it's used against world-space coords). */
const ROTATE_HANDLE_OFFSET_PX = 28;
/** Exported: a renderer draws the same handle this hook hit-tests, so both need this exact
    radius. */
export const ROTATE_HANDLE_RADIUS_PX = 6;
const GEOMETRY_HANDLE_HIT_RADIUS_PX = 8;
/** Exported for the same reason as ROTATE_HANDLE_RADIUS_PX: a renderer's "about to close this
    polygon" highlight must use the same radius this hook closes it at. */
export const POLYGON_CLOSE_HIT_RADIUS_PX = 10;
const SCALE_HANDLE_HIT_RADIUS_PX = 8;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

/** Rotate handle sits centered above the selection's top edge. Exported: both this hook's
    rotate-handle hit-test and a renderer's drawing of that same handle need the identical
    position. */
export function rotateHandlePosition(selected: SymbolShape[], widthPx: number, heightPx: number, scale: number): { x: number; y: number } | null {
  if (selected.length === 0) return null;
  const b = selectionBounds(selected, widthPx, heightPx);
  return { x: b.x + b.width / 2, y: b.y - ROTATE_HANDLE_OFFSET_PX / scale / heightPx };
}

/** Multi-shape-only scale handle at the selection bounds' bottom-right corner — a single shape
    already has its own per-kind resize handles. Exported for the same reason as
    rotateHandlePosition. */
export function scaleHandlePosition(selected: SymbolShape[], widthPx: number, heightPx: number): { x: number; y: number } | null {
  if (selected.length < 2) return null;
  const b = selectionBounds(selected, widthPx, heightPx);
  return { x: b.x + b.width, y: b.y + b.height };
}

export interface UseShapeDrawEditorOptions<TTool extends string> {
  canvasWidthPx: number;
  canvasHeightPx: number;
  /** Seeds the undo-tracked shape list once, on mount — a useState lazy initializer, so
      re-evaluating this expression on later renders has no effect (same idiom
      ElementEditorDialog already uses for its own dirty-check snapshot ref). */
  initialShapes: SymbolShape[];
  initialTool?: TTool;
  /** Called at pointer-down when `tool` isn't one this hook itself handles — the seam for a
      consumer-specific tool (e.g. the stamp editor's port-placement tool). Receives the same
      clamped fraction-space point the hook's own tools would have used. */
  onUnhandledToolPointerDown?: (tool: TTool, point: { fractionX: number; fractionY: number }) => void;
}

export interface ShapeDrawEditor<TTool extends string> {
  shapes: SymbolShape[];
  shapesManager: CommandManager<SymbolShape[]>;
  commitShapes: (next: SymbolShape[]) => void;
  undoShapes: () => void;
  redoShapes: () => void;

  tool: TTool;
  setTool: Dispatch<SetStateAction<TTool>>;
  defaultStyle: SymbolShapeStyle;
  activeStyle: SymbolShapeStyle;
  updateActiveStyle: (patch: Partial<SymbolShapeStyle>) => void;

  selectedShapeIds: Set<string>;
  setSelectedShapeIds: Dispatch<SetStateAction<Set<string>>>;
  selectedShapes: SymbolShape[];
  singleSelectedShape: SymbolShape | undefined;

  draftShapes: SymbolShape[] | null;
  marquee: { start: { fractionX: number; fractionY: number }; current: { fractionX: number; fractionY: number }; additive: boolean } | null;
  polygonDraft: { fractionX: number; fractionY: number }[] | null;
  arcThreePointDraft: { fractionX: number; fractionY: number }[] | null;
  pendingPoint: { fractionX: number; fractionY: number } | null;
  snapIndicator: { x: number; y: number } | null;

  editingTextId: string | null;
  setEditingTextId: Dispatch<SetStateAction<string | null>>;
  editingTextValue: string;
  setEditingTextValue: Dispatch<SetStateAction<string>>;
  editingTextShape: (SymbolShape & { kind: 'text' }) | undefined;
  commitTextEdit: () => void;

  scalePercentInput: string;
  setScalePercentInput: Dispatch<SetStateAction<string>>;
  applyScalePercent: () => void;

  deleteSelectedShapes: () => void;
  mirrorSelection: (axis: 'horizontal' | 'vertical') => void;
  duplicateSelection: () => void;
  rotateSelection90: () => void;
  bringSelectionToFront: () => void;
  sendSelectionToBack: () => void;

  gridSnapEnabled: boolean;
  setGridSnapEnabled: Dispatch<SetStateAction<boolean>>;
  angleSnapEnabled: boolean;
  setAngleSnapEnabled: Dispatch<SetStateAction<boolean>>;
  angleSnapDegreesInput: string;
  setAngleSnapDegreesInput: Dispatch<SetStateAction<string>>;
  angleSnapDegrees: number;
  objectSnapEnabled: boolean;
  setObjectSnapEnabled: Dispatch<SetStateAction<boolean>>;

  view: View;
  viewportSize: { width: number; height: number };
  viewportRef: RefObject<HTMLDivElement | null>;
  fitView: (size?: { width: number; height: number }) => void;
  zoomAtScreenPoint: (factor: number, screenPoint: { x: number; y: number }) => void;
  handleViewportPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;

  fractionFromEvent: (clientX: number, clientY: number, clamp?: boolean) => { fractionX: number; fractionY: number };

  handleCanvasPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  handleCanvasPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  handleCanvasDoubleClick: (event: ReactMouseEvent<HTMLCanvasElement>) => void;
}

export function useShapeDrawEditor<TTool extends string = BuiltinShapeTool>(options: UseShapeDrawEditorOptions<TTool>): ShapeDrawEditor<TTool> {
  const { canvasWidthPx, canvasHeightPx, onUnhandledToolPointerDown } = options;
  const selectTool = 'select' as TTool;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<View>({ scale: 1, panX: 0, panY: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const hasFitRef = useRef(false);

  function fitView(size: { width: number; height: number } = viewportSize) {
    const scale = clampZoom(Math.min(size.width / canvasWidthPx, size.height / canvasHeightPx));
    setView({ scale, panX: (size.width - canvasWidthPx * scale) / 2, panY: (size.height - canvasHeightPx * scale) / 2 });
  }

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const size = { width: entry.contentRect.width, height: entry.contentRect.height };
      setViewportSize(size);
      if (!hasFitRef.current && size.width > 4 && size.height > 4) {
        hasFitRef.current = true;
        fitView(size);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hasFitRef.current) fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasWidthPx, canvasHeightPx]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const rect = el!.getBoundingClientRect();
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      zoomAtScreenPoint(factor, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function zoomAtScreenPoint(factor: number, screenPoint: { x: number; y: number }) {
    setView((prev) => {
      const newScale = clampZoom(prev.scale * factor);
      const worldX = (screenPoint.x - prev.panX) / prev.scale;
      const worldY = (screenPoint.y - prev.panY) / prev.scale;
      return { scale: newScale, panX: screenPoint.x - worldX * newScale, panY: screenPoint.y - worldY * newScale };
    });
  }

  function handleViewportPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 1 && event.button !== 2) return;
    event.preventDefault();
    const startScreen = { x: event.clientX, y: event.clientY };
    const startView = view;
    const move = (ev: PointerEvent) => {
      setView({ ...startView, panX: startView.panX + (ev.clientX - startScreen.x), panY: startView.panY + (ev.clientY - startScreen.y) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const [shapesManager] = useState(() => new CommandManager<SymbolShape[]>(options.initialShapes));
  const [shapes, setShapes] = useState<SymbolShape[]>(shapesManager.getState());

  function commitShapes(next: SymbolShape[]) {
    shapesManager.execute({ description: 'Edit shape', execute: () => next, undo: () => shapes });
    setShapes(next);
  }

  function undoShapes() {
    setShapes(shapesManager.undo());
    setSelectedShapeIds(new Set());
  }

  function redoShapes() {
    setShapes(shapesManager.redo());
    setSelectedShapeIds(new Set());
  }

  const [tool, setTool] = useState<TTool>(options.initialTool ?? selectTool);
  const [defaultStyle, setDefaultStyle] = useState<SymbolShapeStyle>(DEFAULT_STYLE);
  const [selectedShapeIds, setSelectedShapeIds] = useState<Set<string>>(new Set());
  const [draftShapes, setDraftShapes] = useState<SymbolShape[] | null>(null);
  const [marquee, setMarquee] = useState<ShapeDrawEditor<TTool>['marquee']>(null);
  const [polygonDraft, setPolygonDraft] = useState<{ fractionX: number; fractionY: number }[] | null>(null);
  const [arcThreePointDraft, setArcThreePointDraft] = useState<{ fractionX: number; fractionY: number }[] | null>(null);
  const [pendingPoint, setPendingPoint] = useState<{ fractionX: number; fractionY: number } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState('');
  const [scalePercentInput, setScalePercentInput] = useState('100');

  const [gridSnapEnabled, setGridSnapEnabled] = useState(false);
  const [angleSnapEnabled, setAngleSnapEnabled] = useState(false);
  const [angleSnapDegreesInput, setAngleSnapDegreesInput] = useState(String(DEFAULT_ANGLE_SNAP_DEGREES));
  const [objectSnapEnabled, setObjectSnapEnabled] = useState(false);
  const [snapIndicator, setSnapIndicator] = useState<{ x: number; y: number } | null>(null);
  const angleSnapDegrees = Number(angleSnapDegreesInput) || DEFAULT_ANGLE_SNAP_DEGREES;

  const selectedShapes = shapes.filter((s) => selectedShapeIds.has(s.id));
  const singleSelectedShape = selectedShapes.length === 1 ? selectedShapes[0] : undefined;
  const activeStyle = selectedShapes[0]?.style ?? defaultStyle;
  const editingTextShapeRaw = editingTextId ? shapes.find((s) => s.id === editingTextId) : undefined;
  const editingTextShape = editingTextShapeRaw?.kind === 'text' ? editingTextShapeRaw : undefined;

  useEffect(() => {
    setScalePercentInput(singleSelectedShape ? String(Math.round((singleSelectedShape.scale ?? 1) * 100)) : '100');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleSelectedShape?.id, singleSelectedShape?.scale]);

  function updateActiveStyle(patch: Partial<SymbolShapeStyle>) {
    if (selectedShapeIds.size > 0) {
      commitShapes(shapes.map((s) => (selectedShapeIds.has(s.id) ? { ...s, style: { ...s.style, ...patch } } : s)));
    } else {
      setDefaultStyle((prev) => ({ ...prev, ...patch }));
    }
  }

  function deleteSelectedShapes() {
    if (selectedShapeIds.size === 0) return;
    commitShapes(shapes.filter((s) => !selectedShapeIds.has(s.id)));
    setSelectedShapeIds(new Set());
  }

  function mirrorSelection(axis: 'horizontal' | 'vertical') {
    if (selectedShapes.length === 0) return;
    const pivot = selectionPivot(selectedShapes, canvasWidthPx, canvasHeightPx);
    commitShapes(shapes.map((s) => (selectedShapeIds.has(s.id) ? mirrorShape(s, axis, pivot.x, pivot.y) : s)));
  }

  function applyScalePercent() {
    const target = Number(scalePercentInput) / 100;
    if (selectedShapes.length === 0 || !Number.isFinite(target) || target <= 0) return;
    const pivot = selectionPivot(selectedShapes, canvasWidthPx, canvasHeightPx);
    if (singleSelectedShape) {
      const factor = target / (singleSelectedShape.scale ?? 1);
      if (!Number.isFinite(factor) || factor <= 0) return;
      commitShapes(shapes.map((s) => (s.id === singleSelectedShape.id ? scaleShape(s, factor, pivot.x, pivot.y) : s)));
    } else {
      commitShapes(shapes.map((s) => (selectedShapeIds.has(s.id) ? scaleShape(s, target, pivot.x, pivot.y) : s)));
    }
  }

  function duplicateSelection() {
    if (selectedShapes.length === 0) return;
    const clones = selectedShapes.map((s) => ({ ...translateShape(s, DUPLICATE_OFFSET_FRACTION, DUPLICATE_OFFSET_FRACTION), id: crypto.randomUUID() }));
    commitShapes([...shapes, ...clones]);
    setSelectedShapeIds(new Set(clones.map((c) => c.id)));
  }

  function rotateSelection90() {
    if (selectedShapes.length === 0) return;
    const pivot = selectionPivot(selectedShapes, canvasWidthPx, canvasHeightPx);
    commitShapes(shapes.map((s) => (selectedShapeIds.has(s.id) ? rotateShapeAround(s, Math.PI / 2, pivot.x, pivot.y) : s)));
  }

  function bringSelectionToFront() {
    if (selectedShapeIds.size === 0) return;
    commitShapes([...shapes.filter((s) => !selectedShapeIds.has(s.id)), ...shapes.filter((s) => selectedShapeIds.has(s.id))]);
  }

  function sendSelectionToBack() {
    if (selectedShapeIds.size === 0) return;
    commitShapes([...shapes.filter((s) => selectedShapeIds.has(s.id)), ...shapes.filter((s) => !selectedShapeIds.has(s.id))]);
  }

  function finishPolygon(points = polygonDraft) {
    if (!points || points.length < 3) return;
    const shape: SymbolShape = {
      id: crypto.randomUUID(),
      kind: 'polygon',
      points: points.map((p) => ({ x: p.fractionX, y: p.fractionY })),
      style: defaultStyle,
    };
    commitShapes([...shapes, shape]);
    setSelectedShapeIds(new Set([shape.id]));
    setTool(selectTool);
    setPolygonDraft(null);
    setPendingPoint(null);
  }

  function cancelActiveDraft() {
    setPolygonDraft(null);
    setArcThreePointDraft(null);
    setPendingPoint(null);
  }

  useEffect(() => {
    cancelActiveDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedShapeIds.size > 0) {
        event.preventDefault();
        deleteSelectedShapes();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redoShapes();
        else undoShapes();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redoShapes();
      } else if (event.key === 'Escape' && (polygonDraft || arcThreePointDraft)) {
        event.preventDefault();
        event.stopPropagation();
        cancelActiveDraft();
      } else if (event.key === 'Enter' && polygonDraft && polygonDraft.length >= 3) {
        event.preventDefault();
        finishPolygon();
      }
    }
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShapeIds, shapes, polygonDraft, arcThreePointDraft]);

  function fractionFromEvent(clientX: number, clientY: number, clamp = true): { fractionX: number; fractionY: number } {
    const rect = viewportRef.current!.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const worldX = (screenX - view.panX) / view.scale;
    const worldY = (screenY - view.panY) / view.scale;
    const fractionX = worldX / canvasWidthPx;
    const fractionY = worldY / canvasHeightPx;
    return clamp ? { fractionX: clamp01(fractionX), fractionY: clamp01(fractionY) } : { fractionX, fractionY };
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const start = fractionFromEvent(event.clientX, event.clientY);

    if (tool === 'text') {
      const shape: SymbolShape = { id: crypto.randomUUID(), kind: 'text', x: start.fractionX, y: start.fractionY, text: 'Label', fontSize: 0.08, style: defaultStyle };
      commitShapes([...shapes, shape]);
      setSelectedShapeIds(new Set([shape.id]));
      setEditingTextId(shape.id);
      setEditingTextValue('Label');
      setTool(selectTool);
      return;
    }

    if (tool === 'polygon') {
      if (polygonDraft && polygonDraft.length >= 3) {
        const first = polygonDraft[0];
        const closePx = Math.hypot((start.fractionX - first.fractionX) * canvasWidthPx, (start.fractionY - first.fractionY) * canvasHeightPx);
        if (closePx <= POLYGON_CLOSE_HIT_RADIUS_PX / view.scale) {
          finishPolygon(polygonDraft);
          return;
        }
      }
      setPolygonDraft(polygonDraft ? [...polygonDraft, start] : [start]);
      return;
    }

    if (tool === 'arcThreePoint') {
      const nextPoints = arcThreePointDraft ? [...arcThreePointDraft, start] : [start];
      if (nextPoints.length < 3) {
        setArcThreePointDraft(nextPoints);
        return;
      }
      const arc = arcFromThreePoints(nextPoints[0], nextPoints[1], nextPoints[2], defaultStyle, canvasWidthPx, canvasHeightPx);
      setArcThreePointDraft(null);
      setPendingPoint(null);
      if (arc) {
        commitShapes([...shapes, arc]);
        setSelectedShapeIds(new Set([arc.id]));
        setTool(selectTool);
      }
      return;
    }

    if (tool === 'select') {
      const start = fractionFromEvent(event.clientX, event.clientY, false);
      const canvasEl = event.currentTarget;
      const selectedForRotate = shapes.filter((s) => selectedShapeIds.has(s.id));
      const handle = rotateHandlePosition(selectedForRotate, canvasWidthPx, canvasHeightPx, view.scale);
      if (handle) {
        const handlePxX = handle.x * canvasWidthPx;
        const handlePxY = handle.y * canvasHeightPx;
        const clickPxX = start.fractionX * canvasWidthPx;
        const clickPxY = start.fractionY * canvasHeightPx;
        if (Math.hypot(clickPxX - handlePxX, clickPxY - handlePxY) <= (ROTATE_HANDLE_RADIUS_PX + 3) / view.scale) {
          const pivot = selectionPivot(selectedForRotate, canvasWidthPx, canvasHeightPx);
          const pivotPxX = pivot.x * canvasWidthPx;
          const pivotPxY = pivot.y * canvasHeightPx;
          const startAngle = Math.atan2(clickPxY - pivotPxY, clickPxX - pivotPxX);
          const move = (ev: PointerEvent) => {
            const current = fractionFromEvent(ev.clientX, ev.clientY, false);
            const currentPxX = current.fractionX * canvasWidthPx;
            const currentPxY = current.fractionY * canvasHeightPx;
            const currentAngle = Math.atan2(currentPxY - pivotPxY, currentPxX - pivotPxX);
            const delta = currentAngle - startAngle;
            setDraftShapes(selectedForRotate.map((s) => rotateShapeAround(s, delta, pivot.x, pivot.y)));
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            setDraftShapes((current) => {
              if (current) {
                const currentById = new Map(current.map((s) => [s.id, s]));
                commitShapes(shapes.map((s) => currentById.get(s.id) ?? s));
              }
              return null;
            });
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
          return;
        }
      }

      if (selectedForRotate.length > 1) {
        const sHandle = scaleHandlePosition(selectedForRotate, canvasWidthPx, canvasHeightPx);
        if (sHandle) {
          const handlePxX = sHandle.x * canvasWidthPx;
          const handlePxY = sHandle.y * canvasHeightPx;
          const clickPxX = start.fractionX * canvasWidthPx;
          const clickPxY = start.fractionY * canvasHeightPx;
          if (Math.hypot(clickPxX - handlePxX, clickPxY - handlePxY) <= SCALE_HANDLE_HIT_RADIUS_PX / view.scale) {
            const pivot = selectionPivot(selectedForRotate, canvasWidthPx, canvasHeightPx);
            const pivotPxX = pivot.x * canvasWidthPx;
            const pivotPxY = pivot.y * canvasHeightPx;
            const startDistPx = Math.max(1, Math.hypot(handlePxX - pivotPxX, handlePxY - pivotPxY));
            const move = (ev: PointerEvent) => {
              const current = fractionFromEvent(ev.clientX, ev.clientY, false);
              const currentPxX = current.fractionX * canvasWidthPx;
              const currentPxY = current.fractionY * canvasHeightPx;
              const currentDistPx = Math.hypot(currentPxX - pivotPxX, currentPxY - pivotPxY);
              const factor = Math.max(0.02, currentDistPx / startDistPx);
              setDraftShapes(selectedForRotate.map((s) => scaleShape(s, factor, pivot.x, pivot.y)));
            };
            const up = () => {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
              setDraftShapes((current) => {
                if (current) {
                  const currentById = new Map(current.map((s) => [s.id, s]));
                  commitShapes(shapes.map((s) => currentById.get(s.id) ?? s));
                }
                return null;
              });
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            return;
          }
        }
      }

      if (selectedForRotate.length === 1) {
        const originalShape = selectedForRotate[0];
        const hitRadius = GEOMETRY_HANDLE_HIT_RADIUS_PX / view.scale;
        const hitHandle = shapeHandles(originalShape, canvasWidthPx, canvasHeightPx).find(
          (h) => Math.hypot(h.x * canvasWidthPx - start.fractionX * canvasWidthPx, h.y * canvasHeightPx - start.fractionY * canvasHeightPx) <= hitRadius,
        );
        if (hitHandle) {
          canvasEl.setPointerCapture(event.pointerId);
          let sweepReference = originalShape.kind === 'arc' ? normalizeAngle(originalShape.endAngle - originalShape.startAngle) : undefined;
          const move = (ev: PointerEvent) => {
            const current = fractionFromEvent(ev.clientX, ev.clientY, false);
            let point = { x: current.fractionX, y: current.fractionY };
            if (angleSnapEnabled && (originalShape.kind === 'line' || originalShape.kind === 'arrow')) {
              const fixed = hitHandle.id === 'p1' ? { x: originalShape.x2, y: originalShape.y2 } : { x: originalShape.x1, y: originalShape.y1 };
              point = angleSnap(fixed, point, angleSnapDegrees);
            }
            let indicator: { x: number; y: number } | null = null;
            if (objectSnapEnabled) {
              const candidates = collectSnapPoints(shapes, originalShape.id);
              const snapped = findNearestSnapPoint(point, candidates, canvasWidthPx, canvasHeightPx, OBJECT_SNAP_THRESHOLD_PX / view.scale);
              if (snapped) {
                point = snapped;
                indicator = snapped;
              }
            }
            if (!indicator && gridSnapEnabled) {
              point = { x: gridSnap(point.x, GRID_SPACING_FRACTION), y: gridSnap(point.y, GRID_SPACING_FRACTION) };
            }
            setSnapIndicator(indicator);
            const draftShape = applyHandleDrag(originalShape, hitHandle.id, point, canvasWidthPx, canvasHeightPx, sweepReference);
            if (sweepReference !== undefined && draftShape.kind === 'arc') sweepReference = normalizeAngle(draftShape.endAngle - draftShape.startAngle);
            setDraftShapes([draftShape]);
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            canvasEl.releasePointerCapture(event.pointerId);
            setSnapIndicator(null);
            setDraftShapes((current) => {
              if (current) {
                const currentById = new Map(current.map((s) => [s.id, s]));
                commitShapes(shapes.map((s) => currentById.get(s.id) ?? s));
              }
              return null;
            });
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
          return;
        }
      }

      const hit = hitTestSymbolShape(shapes, start.fractionX, start.fractionY, canvasWidthPx, canvasHeightPx, 6 / view.scale);
      if (hit) {
        if (event.shiftKey) {
          setSelectedShapeIds((prev) => {
            const next = new Set(prev);
            if (next.has(hit.id)) next.delete(hit.id);
            else next.add(hit.id);
            return next;
          });
          return;
        }
        const dragIds = selectedShapeIds.has(hit.id) ? selectedShapeIds : new Set([hit.id]);
        setSelectedShapeIds(dragIds);
        const dragShapes = shapes.filter((s) => dragIds.has(s.id));
        const move = (ev: PointerEvent) => {
          let current = fractionFromEvent(ev.clientX, ev.clientY, false);
          if (gridSnapEnabled) {
            current = { fractionX: gridSnap(current.fractionX, GRID_SPACING_FRACTION), fractionY: gridSnap(current.fractionY, GRID_SPACING_FRACTION) };
          }
          const dx = current.fractionX - start.fractionX;
          const dy = current.fractionY - start.fractionY;
          setDraftShapes(dragShapes.map((s) => translateShape(s, dx, dy)));
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          setDraftShapes((current) => {
            if (current) {
              const currentById = new Map(current.map((s) => [s.id, s]));
              commitShapes(shapes.map((s) => currentById.get(s.id) ?? s));
            }
            return null;
          });
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        return;
      }

      if (!event.shiftKey) setSelectedShapeIds(new Set());
      setMarquee({ start, current: start, additive: event.shiftKey });
      const move = (ev: PointerEvent) => {
        const current = fractionFromEvent(ev.clientX, ev.clientY, false);
        setMarquee((prev) => (prev ? { ...prev, current } : prev));
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setMarquee((prev) => {
          if (prev) {
            const minX = Math.min(prev.start.fractionX, prev.current.fractionX);
            const maxX = Math.max(prev.start.fractionX, prev.current.fractionX);
            const minY = Math.min(prev.start.fractionY, prev.current.fractionY);
            const maxY = Math.max(prev.start.fractionY, prev.current.fractionY);
            const hitIds = shapes
              .filter((s) => {
                const b = symbolShapeBounds(s, canvasWidthPx, canvasHeightPx);
                const midX = b.x + b.width / 2;
                const midY = b.y + b.height / 2;
                return midX >= minX && midX <= maxX && midY >= minY && midY <= maxY;
              })
              .map((s) => s.id);
            setSelectedShapeIds((prevIds) => (prev.additive ? new Set([...prevIds, ...hitIds]) : new Set(hitIds)));
          }
          return null;
        });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }

    if (isDrawTool(tool)) {
      const id = crypto.randomUUID();
      let draft = createDraftShape(tool, id, start, defaultStyle);
      setDraftShapes([draft]);
      const move = (ev: PointerEvent) => {
        let current = fractionFromEvent(ev.clientX, ev.clientY);
        let point = { x: current.fractionX, y: current.fractionY };
        if (angleSnapEnabled && (tool === 'line' || tool === 'arrow')) {
          point = angleSnap({ x: start.fractionX, y: start.fractionY }, point, angleSnapDegrees);
        }
        if (gridSnapEnabled) {
          point = { x: gridSnap(point.x, GRID_SPACING_FRACTION), y: gridSnap(point.y, GRID_SPACING_FRACTION) };
        }
        current = { fractionX: point.x, fractionY: point.y };
        draft = updateDraftShape(draft, start, current);
        setDraftShapes([draft]);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (isDraftLargeEnough(draft)) {
          commitShapes([...shapes, draft]);
          setSelectedShapeIds(new Set([draft.id]));
          setTool(selectTool);
        }
        setDraftShapes(null);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }

    onUnhandledToolPointerDown?.(tool, start);
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if ((tool === 'polygon' && polygonDraft) || (tool === 'arcThreePoint' && arcThreePointDraft)) {
      setPendingPoint(fractionFromEvent(event.clientX, event.clientY));
    }
  }

  function handleCanvasDoubleClick(event: ReactMouseEvent<HTMLCanvasElement>) {
    if (tool === 'polygon') {
      finishPolygon(polygonDraft && polygonDraft.length > 1 ? polygonDraft.slice(0, -1) : polygonDraft);
      return;
    }
    if (tool === 'select') {
      const { fractionX, fractionY } = fractionFromEvent(event.clientX, event.clientY, false);
      const hit = hitTestSymbolShape(shapes, fractionX, fractionY, canvasWidthPx, canvasHeightPx, 6 / view.scale);
      if (hit && hit.kind === 'text') {
        setSelectedShapeIds(new Set([hit.id]));
        setEditingTextId(hit.id);
        setEditingTextValue(hit.text);
      }
    }
  }

  function commitTextEdit() {
    if (editingTextId && editingTextValue.trim()) {
      const trimmed = editingTextValue.trim();
      commitShapes(shapes.map((s) => (s.id === editingTextId && s.kind === 'text' ? { ...s, text: trimmed } : s)));
    }
    setEditingTextId(null);
  }

  return {
    shapes,
    shapesManager,
    commitShapes,
    undoShapes,
    redoShapes,
    tool,
    setTool,
    defaultStyle,
    activeStyle,
    updateActiveStyle,
    selectedShapeIds,
    setSelectedShapeIds,
    selectedShapes,
    singleSelectedShape,
    draftShapes,
    marquee,
    polygonDraft,
    arcThreePointDraft,
    pendingPoint,
    snapIndicator,
    editingTextId,
    setEditingTextId,
    editingTextValue,
    setEditingTextValue,
    editingTextShape,
    commitTextEdit,
    scalePercentInput,
    setScalePercentInput,
    applyScalePercent,
    deleteSelectedShapes,
    mirrorSelection,
    duplicateSelection,
    rotateSelection90,
    bringSelectionToFront,
    sendSelectionToBack,
    gridSnapEnabled,
    setGridSnapEnabled,
    angleSnapEnabled,
    setAngleSnapEnabled,
    angleSnapDegreesInput,
    setAngleSnapDegreesInput,
    angleSnapDegrees,
    objectSnapEnabled,
    setObjectSnapEnabled,
    view,
    viewportSize,
    viewportRef,
    fitView,
    zoomAtScreenPoint,
    handleViewportPointerDown,
    fractionFromEvent,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasDoubleClick,
  };
}
