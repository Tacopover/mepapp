import { useEffect, useMemo, useRef, useState, type ComponentType, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { CommandManager, type Discipline, type PortSpec, type StampCategory, type StampDefinition, type SymbolShape, type SymbolShapeStyle } from '@mepapp/core';
import { ColorPicker } from './ColorPicker.js';
import { Dialog } from './Dialog.js';
import { loadStampBitmap } from '../stampBitmap.js';
import { stampLabelFor } from './StampsPanel.js';
import type { StampLabelLanguage } from './LanguageToggle.js';
import {
  IconArcThreePointTool,
  IconArcTool,
  IconBringToFront,
  IconCircleTool,
  IconCopy,
  IconEllipseTool,
  IconGridSnap,
  IconLineArrow,
  IconMinus,
  IconMirror,
  IconObjectSnap,
  IconPlus,
  IconPolygonTool,
  IconPort,
  IconRectTool,
  IconRedo,
  IconRotate,
  IconScale,
  IconSegment,
  IconSelect,
  IconSendToBack,
  IconSnapAngle,
  IconTextbox,
  IconTrash,
  IconUndo,
  IconZoomFit,
  type IconProps,
} from '../icons.js';
import {
  angleSnap,
  applyHandleDrag,
  arcFromThreePoints,
  collectSnapPoints,
  createDraftShape,
  drawSymbolShapes,
  findNearestSnapPoint,
  gridSnap,
  hitTestSymbolShape,
  isDraftLargeEnough,
  mirrorShape,
  normalizeAngle,
  rasterizeSymbolShapes,
  rescaleShapeForCanvasResize,
  rotateShapeAround,
  scaleShape,
  selectionBounds,
  selectionPivot,
  shapeHandles,
  symbolShapeBounds,
  translateShape,
  updateDraftShape,
  type ShapeDrawTool,
} from '../symbolShapeCanvas.js';

/** Same 300 DPI convention as stampBitmap.ts/scene.ts's STAMP_SOURCE_DPI — stamp art's pixel size at 300 DPI is expected to match its nominal size in PDF points. */
const STAMP_SOURCE_DPI = 300;

/** Cap on the Shapes-mode canvas's longer side, in drawing-buffer px — the shorter side is derived from the definition's own nativeWidth:nativeHeight aspect (see shapeCanvasSize) so a wide/tall stamp doesn't get squished into a square, matching how it actually looks placed on the PDF. */
const SHAPE_CANVAS_MAX_PX = 520;

/** Rotate/geometry handle geometry — all in screen px (constant on-screen size regardless of zoom, same "screen px, zoom-independent" convention as scene.ts's own handle constants), converted to world px via `/ view.scale` wherever they're drawn or hit-tested against world-space coordinates. */
const ROTATE_HANDLE_OFFSET_PX = 28;
const ROTATE_HANDLE_RADIUS_PX = 6;
const GEOMETRY_HANDLE_RADIUS_PX = 5;
const GEOMETRY_HANDLE_HIT_RADIUS_PX = 8;
const POLYGON_CLOSE_HIT_RADIUS_PX = 10;

/** Zoom/pan range — mirrors packages/render/src/scene.ts's own MIN_ZOOM/MAX_ZOOM convention, tightened since symbol artwork is small and a full PDF page's 0.05–32 range doesn't apply (element-editor-ui-redesign-spec.md §3). */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.1;

/** Grid/angle/object snap (§6) — a fractional spacing of 0.02 (~2% of the artwork box) and a 10-screen-px object-snap catch radius are reasonable starting guesses, untested against real fixture-scale symbols (§8 open item). */
const GRID_SPACING_FRACTION = 0.02;
const OBJECT_SNAP_THRESHOLD_PX = 10;
const DEFAULT_ANGLE_SNAP_DEGREES = 45;
const SNAP_INDICATOR_COLOR = '#e8590c';
const SNAP_INDICATOR_RADIUS_PX = 5;

/** Duplicate's fixed fractional offset (§4.2) — same convention element-editor-snapping-clipboard-spec.md §5.2 already settled on for its own Ctrl+V paste. */
const DUPLICATE_OFFSET_FRACTION = 0.03;

/** Screen-px pan offset plus a uniform scale — same shape as scene.ts's own world transform, just plain state instead of a PixiJS Container. Maps a "world" point (artwork px, the same fixed space shapeCanvasSize computes) to a screen point (CSS px within the viewport) via screen = pan + world * scale. */
interface View {
  scale: number;
  panX: number;
  panY: number;
}

function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

/** Longer side fixed at SHAPE_CANVAS_MAX_PX, shorter side scaled down to match the artwork's own aspect ratio — same "contain within a box" sizing the placed-on-PDF render and the final rasterize-to-iconRef step already use via nativeWidth/nativeHeight. */
function shapeCanvasSize(nativeWidth: number, nativeHeight: number): { widthPx: number; heightPx: number } {
  const w = nativeWidth > 0 ? nativeWidth : 1;
  const h = nativeHeight > 0 ? nativeHeight : 1;
  const scale = SHAPE_CANVAS_MAX_PX / Math.max(w, h);
  return { widthPx: Math.max(1, Math.round(w * scale)), heightPx: Math.max(1, Math.round(h * scale)) };
}

const DISCIPLINE_OPTIONS: Discipline[] = [
  'heatingAndCooling',
  'ventilation',
  'plumbing',
  'fireProtection',
  'electrical',
  'other',
];

const DISCIPLINE_LABEL: Record<Discipline, string> = {
  heatingAndCooling: 'Heating & Cooling',
  ventilation: 'Ventilation',
  plumbing: 'Plumbing',
  fireProtection: 'Fire Protection',
  electrical: 'Electrical',
  other: 'Other',
};

type ArtworkMode = 'import' | 'shapes';
type ShapeTool = 'select' | 'port' | ShapeDrawTool | 'text' | 'polygon' | 'arcThreePoint';

const SHAPE_TOOLS: { tool: ShapeTool; label: string }[] = [
  { tool: 'select', label: 'Select' },
  { tool: 'port', label: 'Port' },
  { tool: 'line', label: 'Line' },
  { tool: 'arrow', label: 'Arrow' },
  { tool: 'rect', label: 'Rect' },
  { tool: 'circle', label: 'Circle' },
  { tool: 'ellipse', label: 'Ellipse' },
  { tool: 'arc', label: 'Arc' },
  { tool: 'arcThreePoint', label: 'Arc (3-pt)' },
  { tool: 'polygon', label: 'Polygon' },
  { tool: 'text', label: 'Text' },
];

/** Icon-only rail (element-editor-ui-redesign-spec.md §2) — reuses the main canvas's own icon set (Rail.tsx / icons.tsx) where a tool already has one. */
const SHAPE_TOOL_ICONS: Record<ShapeTool, ComponentType<IconProps>> = {
  select: IconSelect,
  port: IconPort,
  line: IconSegment,
  arrow: IconLineArrow,
  rect: IconRectTool,
  circle: IconCircleTool,
  ellipse: IconEllipseTool,
  arc: IconArcTool,
  arcThreePoint: IconArcThreePointTool,
  polygon: IconPolygonTool,
  text: IconTextbox,
};

type ElementEditorTab = 'shapes' | 'ports' | 'labels';

const DEFAULT_STYLE: SymbolShapeStyle = { stroke: '#1a1a1a', strokeWidth: 0.01, fill: null };

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Rotate handle sits centered above the selection's top edge, offset by a fixed screen-px distance (divided by `scale` to convert to the world-px space bounds/coordinates live in, so it stays a constant size on screen regardless of zoom). */
function rotateHandlePosition(selected: SymbolShape[], widthPx: number, heightPx: number, scale: number): { x: number; y: number } | null {
  if (selected.length === 0) return null;
  const b = selectionBounds(selected, widthPx, heightPx);
  return { x: b.x + b.width / 2, y: b.y - ROTATE_HANDLE_OFFSET_PX / scale / heightPx };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export interface ElementEditorDialogProps {
  /** The definition being edited ("Edit ports…" from a placed custom instance's Properties panel), or undefined for "Create custom element". Editing changes the definition going forward — it does not retroactively touch instances already placed from it, same as a library definition's own fields were never live-linked to its placed instances. */
  definition?: StampDefinition;
  /** The Stamps tab's picker-label language (see LanguageToggle) — only used to seed the Name field from definition.labelNl when opening a library stamp for editing; the saved definition always keeps a single label going forward (see StampsPanel's stampLabelFor doc comment). */
  labelLanguage?: StampLabelLanguage;
  onSave: (definition: StampDefinition) => void;
  onClose: () => void;
}

/**
 * Element Editor dialog (ports-custom-element-editor-spec.md §5.2 + §5.3) —
 * authors a custom StampDefinition: name/discipline/category, artwork (a
 * raster import, or a vector Shapes-mode drawing canvas rasterized to the
 * same iconRef `data:` URL at save time so every downstream render/placement
 * call site keeps treating artwork as "an image"), and click-to-place ports
 * with drag-to-reposition, double-click-to-rename, and a link-mode toggle
 * for grouping ports that are internally wired together (converted to a real
 * instance-level PortGroup at placement, see SketchScene.placeStamp).
 */
export function ElementEditorDialog({ definition, labelLanguage, onSave, onClose }: ElementEditorDialogProps) {
  const [name, setName] = useState(definition ? stampLabelFor(definition, labelLanguage ?? 'en') : '');
  const [discipline, setDiscipline] = useState<Discipline>(definition?.discipline ?? 'ventilation');
  const [category, setCategory] = useState<StampCategory>(definition?.category === 'equipment' ? 'equipment' : 'terminal');
  const [mode, setMode] = useState<ArtworkMode>(definition?.shapes && definition.shapes.length > 0 ? 'shapes' : 'import');
  const [artworkDataUrl, setArtworkDataUrl] = useState<string | null>(mode === 'import' ? (definition?.iconRef ?? null) : null);
  const [nativeWidth, setNativeWidth] = useState(definition?.nativeWidth ?? 48);
  const [nativeHeight, setNativeHeight] = useState(definition?.nativeHeight ?? 48);
  const [ports, setPorts] = useState<PortSpec[]>(definition?.ports ?? []);
  const [groups, setGroups] = useState<string[][]>(definition?.definitionPortGroups ?? []);
  const [linkMode, setLinkMode] = useState(false);
  const [linkFirstPortId, setLinkFirstPortId] = useState<string | null>(null);
  const [editingPortId, setEditingPortId] = useState<string | null>(null);
  const [editPortName, setEditPortName] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** The fixed-size viewport DOM element (§2/§3) — the coordinate-space reference for fractionFromEvent, wheel-zoom, and pan-drag; distinct from the artwork's own "world" pixel box (canvasWidthPx × canvasHeightPx), which is drawn inside it at the current view.scale/pan. */
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Shapes/Ports/Labels tab bar (§2) — Shapes is only ever offered while artwork mode is 'shapes'
  // (no vector geometry to edit in 'import' mode), so switching mode away from it falls back to Ports.
  const [activeTab, setActiveTab] = useState<ElementEditorTab>(mode === 'shapes' ? 'shapes' : 'ports');
  useEffect(() => {
    if (mode !== 'shapes' && activeTab === 'shapes') setActiveTab('ports');
  }, [mode, activeTab]);

  // Recomputed as the user edits nativeWidth/nativeHeight so the preview box
  // and canvas stay in sync with the definition's true aspect ratio.
  const { widthPx: canvasWidthPx, heightPx: canvasHeightPx } = useMemo(() => shapeCanvasSize(nativeWidth, nativeHeight), [nativeWidth, nativeHeight]);

  // Zoom & pan (§3) — the viewport's own CSS size is independent of the artwork's aspect
  // ratio (unlike the pre-redesign canvas, which was sized to match it exactly), so it's
  // tracked separately via ResizeObserver and used both for Fit and for the Shapes-mode
  // canvas's device-pixel backing buffer (see the draw effect below).
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

  // Re-fit whenever the artwork's own world size changes (W/H edits, artwork import
  // changing aspect) — but only after the initial mount fit above has already happened,
  // so this doesn't race it with a stale (pre-measurement) viewportSize.
  useEffect(() => {
    if (hasFitRef.current) fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasWidthPx, canvasHeightPx]);

  // Wheel-to-zoom, pivoted on the cursor so the artwork point under it stays fixed — a plain
  // addEventListener (not React's onWheel) so preventDefault reliably stops the page scrolling.
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

  /** Shared by the wheel handler and the bottom bar's zoom buttons — zooms so screenPoint's world position stays fixed under it, same convention as scene.ts's own applyZoomAtScreenPoint. */
  function zoomAtScreenPoint(factor: number, screenPoint: { x: number; y: number }) {
    setView((prev) => {
      const newScale = clampZoom(prev.scale * factor);
      const worldX = (screenPoint.x - prev.panX) / prev.scale;
      const worldY = (screenPoint.y - prev.panY) / prev.scale;
      return { scale: newScale, panX: screenPoint.x - worldX * newScale, panY: screenPoint.y - worldY * newScale };
    });
  }

  /** Pan on middle- or right-mouse-button drag — same raw screen-space delta as scene.ts's own pan branch, no scale division. */
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

  // Shapes mode (§5.3) — local undo/redo history, same Command/CommandManager
  // primitive the rest of the app uses, scoped to just this dialog's canvas.
  const [shapesManager] = useState(() => new CommandManager<SymbolShape[]>(definition?.shapes ?? []));
  const [shapes, setShapes] = useState<SymbolShape[]>(shapesManager.getState());

  // Unsaved-changes warning (§7) — isDirty is a snapshot diff, not a scattered `dirty = true` flag
  // touched by every setter: one JSON comparison correctly treats "moved a shape back to where it
  // started" as still dirty (matching normal unsaved-changes UX), and there's exactly one place to
  // keep in sync with new saveable fields. initialSnapshotRef captures the value ONCE at mount —
  // its useRef initializer expression re-evaluates every render (a JS-argument-evaluation quirk),
  // but useRef only keeps the very first result, which is exactly the mount-time snapshot we want.
  function computeSnapshot(): string {
    return JSON.stringify({ name, discipline, category, mode, artworkDataUrl, nativeWidth, nativeHeight, ports, groups, shapes });
  }
  const initialSnapshotRef = useRef(computeSnapshot());
  const isDirty = computeSnapshot() !== initialSnapshotRef.current;
  const [pendingClose, setPendingClose] = useState(false);

  function requestClose() {
    if (isDirty) setPendingClose(true);
    else onClose();
  }

  // Escape closes just the confirm block, not the whole dialog — a capture-phase listener with
  // stopPropagation, same pattern the polygon/arc-3pt draft-cancel handler below already uses,
  // since Dialog's own Escape-closes-everything listener is also on document (see
  // project-dialog-escape-listener-conflict).
  useEffect(() => {
    if (!pendingClose) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setPendingClose(false);
    }
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [pendingClose]);

  const [tool, setTool] = useState<ShapeTool>('select');
  const [defaultStyle, setDefaultStyle] = useState<SymbolShapeStyle>(DEFAULT_STYLE);
  const [selectedShapeIds, setSelectedShapeIds] = useState<Set<string>>(new Set());
  const [draftShapes, setDraftShapes] = useState<SymbolShape[] | null>(null);
  const [marquee, setMarquee] = useState<{ start: { fractionX: number; fractionY: number }; current: { fractionX: number; fractionY: number }; additive: boolean } | null>(null);
  const [polygonDraft, setPolygonDraft] = useState<{ fractionX: number; fractionY: number }[] | null>(null);
  const [arcThreePointDraft, setArcThreePointDraft] = useState<{ fractionX: number; fractionY: number }[] | null>(null);
  const [pendingPoint, setPendingPoint] = useState<{ fractionX: number; fractionY: number } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState('');
  const [scalePercentInput, setScalePercentInput] = useState('100');
  const shapesCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const textRenameRef = useRef<HTMLInputElement | null>(null);

  // Grid/angle/object snap (§6) — three independently toggleable modes, since a user may want any
  // one without the others. snapIndicator (fraction space) shows what point is currently
  // snapped-to during a handle-drag, matching the old app's SnapIndicator concept.
  const [gridSnapEnabled, setGridSnapEnabled] = useState(false);
  const [angleSnapEnabled, setAngleSnapEnabled] = useState(false);
  const [angleSnapDegreesInput, setAngleSnapDegreesInput] = useState(String(DEFAULT_ANGLE_SNAP_DEGREES));
  const [objectSnapEnabled, setObjectSnapEnabled] = useState(false);
  const [snapIndicator, setSnapIndicator] = useState<{ x: number; y: number } | null>(null);
  const angleSnapDegrees = Number(angleSnapDegreesInput) || DEFAULT_ANGLE_SNAP_DEGREES;

  // Text placement opens the rename input from inside the same pointerdown
  // that created the shape — autoFocus there loses a race against the
  // browser's own post-mousedown focus handling (mousedown targets the
  // canvas, a non-focusable element, which blurs whatever just got focused).
  // Deferring the focus call, same fix already used for the floating
  // textbox-annotation prompt in App.tsx.
  useEffect(() => {
    if (!editingTextId) return;
    const id = setTimeout(() => textRenameRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [editingTextId]);

  const selectedShapes = shapes.filter((s) => selectedShapeIds.has(s.id));
  const singleSelectedShape = selectedShapes.length === 1 ? selectedShapes[0] : undefined;
  const activeStyle = selectedShapes[0]?.style ?? defaultStyle;

  function commitShapes(next: SymbolShape[]) {
    shapesManager.execute({ description: 'Edit shape', execute: () => next, undo: () => shapes });
    setShapes(next);
  }

  // Canvas resize, not image resize: editing nativeWidth/nativeHeight changes the fraction-space
  // box's own aspect ratio (via shapeCanvasSize), so without this, every shape/port's fraction
  // coordinates would be silently reinterpreted against the new aspect and visibly shift. Rescale
  // their raw coordinates by the old/new *native* (physical, real-world-unit) size ratio — per axis —
  // so each one's ABSOLUTE physical position/size stays fixed and only the surrounding canvas
  // boundary changes, matching an image editor's "canvas size" (keep content in place) rather than
  // "image size" (stretch content). This must use nativeWidth/nativeHeight directly, not the derived
  // canvasWidthPx/heightPx: shapeCanvasSize's own scale factor is SHAPE_CANVAS_MAX_PX/Math.max(w,h),
  // so canvasWidthPx/heightPx don't scale linearly per axis with nativeWidth/nativeHeight whenever
  // the aspect ratio changes — only the native sizes themselves do.
  //
  // sMin (for radius/strokeWidth, which are fractions of Math.min(canvasWidthPx, canvasHeightPx) —
  // see drawSymbolShapes) is the one exception to "derive from native sizes directly": that min is
  // itself driven by shapeCanvasSize's cap on the *longer* native side, so its old/new ratio isn't
  // Math.min(oldNative)/Math.min(newNative) — going from 48×48 to 48×96 halves the rendered min
  // dimension (520→260) even though the native min side (48) never changes. Computing it from the
  // actual pixel boxes sidesteps re-deriving that relationship by hand.
  const nativeSizeRef = useRef({ width: nativeWidth, height: nativeHeight });
  useEffect(() => {
    const prev = nativeSizeRef.current;
    if (prev.width === nativeWidth && prev.height === nativeHeight) return;
    const sx = prev.width / nativeWidth;
    const sy = prev.height / nativeHeight;
    const prevCanvas = shapeCanvasSize(prev.width, prev.height);
    const nextCanvas = shapeCanvasSize(nativeWidth, nativeHeight);
    const sMin = Math.min(prevCanvas.widthPx, prevCanvas.heightPx) / Math.min(nextCanvas.widthPx, nextCanvas.heightPx);
    commitShapes(shapes.map((s) => rescaleShapeForCanvasResize(s, sx, sy, sMin)));
    setPorts((prevPorts) => prevPorts.map((p) => ({ ...p, fractionX: p.fractionX * sx, fractionY: p.fractionY * sy })));
    nativeSizeRef.current = { width: nativeWidth, height: nativeHeight };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeWidth, nativeHeight]);

  function undoShapes() {
    setShapes(shapesManager.undo());
    setSelectedShapeIds(new Set());
  }

  function redoShapes() {
    setShapes(shapesManager.redo());
    setSelectedShapeIds(new Set());
  }

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
    const factor = Number(scalePercentInput) / 100;
    if (selectedShapes.length === 0 || !Number.isFinite(factor) || factor <= 0) return;
    const pivot = selectionPivot(selectedShapes, canvasWidthPx, canvasHeightPx);
    commitShapes(shapes.map((s) => (selectedShapeIds.has(s.id) ? scaleShape(s, factor, pivot.x, pivot.y) : s)));
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

  /** z-order is array order (drawSymbolShapes' own paint-order convention) — bring-to-front/send-to-back reorder the selection to the end/start, keeping the selected shapes' own relative order among themselves. */
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
    setTool('select');
    setPolygonDraft(null);
    setPendingPoint(null);
  }

  function cancelActiveDraft() {
    setPolygonDraft(null);
    setArcThreePointDraft(null);
    setPendingPoint(null);
  }

  // Switching tools abandons any in-progress Polygon/Arc(3-pt) click-accumulation.
  useEffect(() => {
    cancelActiveDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // Redraw the Shapes-mode canvas whenever its state changes. The canvas's own backing buffer
  // is sized to the viewport's CSS size × devicePixelRatio (not the artwork's world size) —
  // view.scale/pan are baked into the draw transform below instead of a CSS transform on the
  // canvas element, so lines stay crisp at high zoom instead of a scaled bitmap blurring (§3).
  useEffect(() => {
    if (mode !== 'shapes') return;
    const canvas = shapesCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const bufferWidth = Math.max(1, Math.round(viewportSize.width * dpr));
    const bufferHeight = Math.max(1, Math.round(viewportSize.height * dpr));
    if (canvas.width !== bufferWidth) canvas.width = bufferWidth;
    if (canvas.height !== bufferHeight) canvas.height = bufferHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewportSize.width, viewportSize.height);
    ctx.save();
    ctx.translate(view.panX, view.panY);
    ctx.scale(view.scale, view.scale);
    // Selection/handle/marquee "chrome" is drawn in this same zoomed world-space transform, so a
    // literal screen-px size (line width, dash length, handle radius) would visibly grow/shrink
    // with zoom — divide by view.scale first so it renders at a constant size on screen instead,
    // same convention scene.ts uses for its own handle/selection-outline drawing.
    const chromeScale = 1 / view.scale;
    // Canvas/stamp bounds — the fixed nativeWidth×nativeHeight box shapes/ports are defined
    // against, drawn first (behind shapes/selection chrome) so the user can see the element's
    // actual extent while placing geometry.
    ctx.save();
    ctx.setLineDash([6 * chromeScale, 4 * chromeScale]);
    ctx.strokeStyle = '#57676f';
    ctx.lineWidth = chromeScale;
    ctx.strokeRect(0, 0, canvasWidthPx, canvasHeightPx);
    ctx.restore();
    // draftShapes either replaces in-place shapes being dragged (select tool) or
    // holds one not-yet-committed new shape being drawn (drag-to-create tools) —
    // handle both by replacing matching ids and appending any that aren't found.
    const draftById = draftShapes ? new Map(draftShapes.map((s) => [s.id, s])) : null;
    const toDraw = draftById
      ? [...shapes.map((s) => draftById.get(s.id) ?? s), ...draftShapes!.filter((s) => !shapes.some((orig) => orig.id === s.id))]
      : shapes;
    drawSymbolShapes(ctx, toDraw, canvasWidthPx, canvasHeightPx);
    for (const shape of toDraw) {
      if (!selectedShapeIds.has(shape.id)) continue;
      const b = symbolShapeBounds(shape, canvasWidthPx, canvasHeightPx);
      const pad = 3 * chromeScale;
      ctx.save();
      ctx.setLineDash([4 * chromeScale, 3 * chromeScale]);
      ctx.strokeStyle = '#2f6fed';
      ctx.lineWidth = chromeScale;
      ctx.strokeRect(b.x * canvasWidthPx - pad, b.y * canvasHeightPx - pad, b.width * canvasWidthPx + pad * 2, b.height * canvasHeightPx + pad * 2);
      ctx.restore();
    }
    if (marquee) {
      const minX = Math.min(marquee.start.fractionX, marquee.current.fractionX) * canvasWidthPx;
      const minY = Math.min(marquee.start.fractionY, marquee.current.fractionY) * canvasHeightPx;
      const w = Math.abs(marquee.current.fractionX - marquee.start.fractionX) * canvasWidthPx;
      const h = Math.abs(marquee.current.fractionY - marquee.start.fractionY) * canvasHeightPx;
      ctx.save();
      ctx.fillStyle = 'rgba(47, 111, 237, 0.12)';
      ctx.fillRect(minX, minY, w, h);
      ctx.strokeStyle = '#2f6fed';
      ctx.lineWidth = chromeScale;
      ctx.strokeRect(minX, minY, w, h);
      ctx.restore();
    }
    if (tool === 'select' && !marquee) {
      const selectedForHandle = toDraw.filter((s) => selectedShapeIds.has(s.id));
      const handle = rotateHandlePosition(selectedForHandle, canvasWidthPx, canvasHeightPx, view.scale);
      if (handle) {
        const b = selectionBounds(selectedForHandle, canvasWidthPx, canvasHeightPx);
        const handleX = handle.x * canvasWidthPx;
        const handleY = handle.y * canvasHeightPx;
        const stemTopY = b.y * canvasHeightPx;
        ctx.save();
        ctx.strokeStyle = '#2f6fed';
        ctx.fillStyle = '#2f6fed';
        ctx.lineWidth = chromeScale;
        ctx.beginPath();
        ctx.moveTo(handleX, stemTopY);
        ctx.lineTo(handleX, handleY);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(handleX, handleY, ROTATE_HANDLE_RADIUS_PX * chromeScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // Geometry (resize/reshape) handles — only when exactly one shape is selected, per the
      // hit-test order in handleShapesCanvasPointerDown: rotate handle → geometry handle → body drag.
      if (selectedForHandle.length === 1) {
        for (const geomHandle of shapeHandles(selectedForHandle[0], canvasWidthPx, canvasHeightPx)) {
          ctx.save();
          ctx.strokeStyle = '#2f6fed';
          ctx.fillStyle = '#fff';
          ctx.lineWidth = chromeScale;
          ctx.beginPath();
          ctx.arc(geomHandle.x * canvasWidthPx, geomHandle.y * canvasHeightPx, GEOMETRY_HANDLE_RADIUS_PX * chromeScale, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Object-snap indicator (§6.3) — a distinct accent color so it doesn't get lost against the
    // selection-blue #2f6fed, shown at whatever point a handle-drag is currently snapped to.
    if (snapIndicator) {
      ctx.save();
      ctx.strokeStyle = SNAP_INDICATOR_COLOR;
      ctx.lineWidth = 1.5 * chromeScale;
      ctx.beginPath();
      ctx.arc(snapIndicator.x * canvasWidthPx, snapIndicator.y * canvasHeightPx, SNAP_INDICATOR_RADIUS_PX * chromeScale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Click-accumulate previews for Polygon and Arc (3-pt): placed vertices plus a
    // rubber-band line (or, for Arc 3-pt once start+end are placed, a live preview of the actual
    // arc bulging toward the pointer) to the current pointer position.
    const activeDraftPoints = tool === 'polygon' ? polygonDraft : tool === 'arcThreePoint' ? arcThreePointDraft : null;
    if (activeDraftPoints && activeDraftPoints.length > 0) {
      ctx.save();
      ctx.setLineDash([4 * chromeScale, 3 * chromeScale]);
      ctx.strokeStyle = '#2f6fed';
      ctx.fillStyle = '#2f6fed';
      ctx.lineWidth = chromeScale;
      const previewArc =
        tool === 'arcThreePoint' && activeDraftPoints.length === 2 && pendingPoint
          ? arcFromThreePoints(activeDraftPoints[0], activeDraftPoints[1], pendingPoint, defaultStyle)
          : null;
      if (previewArc && previewArc.kind === 'arc') {
        const r = previewArc.radius * Math.min(canvasWidthPx, canvasHeightPx);
        ctx.beginPath();
        ctx.ellipse(previewArc.cx * canvasWidthPx, previewArc.cy * canvasHeightPx, r, r, 0, previewArc.startAngle, previewArc.endAngle);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(activeDraftPoints[0].fractionX * canvasWidthPx, activeDraftPoints[0].fractionY * canvasHeightPx);
        for (const p of activeDraftPoints.slice(1)) ctx.lineTo(p.fractionX * canvasWidthPx, p.fractionY * canvasHeightPx);
        if (pendingPoint) ctx.lineTo(pendingPoint.fractionX * canvasWidthPx, pendingPoint.fractionY * canvasHeightPx);
        ctx.stroke();
      }
      for (const p of activeDraftPoints) {
        ctx.beginPath();
        ctx.arc(p.fractionX * canvasWidthPx, p.fractionY * canvasHeightPx, 3 * chromeScale, 0, Math.PI * 2);
        ctx.fill();
      }
      // Highlight the polygon's start vertex when the pointer is within closing range, hinting
      // that clicking there finishes the shape instead of adding another vertex.
      if (tool === 'polygon' && activeDraftPoints.length >= 3 && pendingPoint) {
        const closePx = Math.hypot(
          (pendingPoint.fractionX - activeDraftPoints[0].fractionX) * canvasWidthPx,
          (pendingPoint.fractionY - activeDraftPoints[0].fractionY) * canvasHeightPx,
        );
        if (closePx <= POLYGON_CLOSE_HIT_RADIUS_PX / view.scale) {
          ctx.setLineDash([]);
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(activeDraftPoints[0].fractionX * canvasWidthPx, activeDraftPoints[0].fractionY * canvasHeightPx, GEOMETRY_HANDLE_RADIUS_PX * chromeScale, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }, [mode, shapes, draftShapes, selectedShapeIds, marquee, tool, polygonDraft, arcThreePointDraft, pendingPoint, canvasWidthPx, canvasHeightPx, viewportSize, view, defaultStyle]);

  // Delete/Backspace removes the selected shape; Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes — only while Shapes mode is active and no text field has focus.
  useEffect(() => {
    if (mode !== 'shapes') return;
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
        // Cancel the in-progress draft only — stop the event reaching Dialog's own
        // Escape-closes-the-whole-dialog listener (also on document, registered
        // during Dialog's child-mounts-first effect, so capture phase is the only
        // way to run before it).
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
  }, [mode, selectedShapeIds, shapes, polygonDraft, arcThreePointDraft]);

  async function handleArtworkFile(file: File) {
    const [dataUrl, bitmap] = await Promise.all([readAsDataUrl(file), loadStampBitmap(file)]);
    setArtworkDataUrl(dataUrl);
    setNativeWidth((bitmap.width * 72) / STAMP_SOURCE_DPI);
    setNativeHeight((bitmap.height * 72) / STAMP_SOURCE_DPI);
  }

  /** Screen px (viewport-relative) → world px (the artwork's own fixed canvasWidthPx/heightPx
      box) → fraction, inverting the current view transform. Every caller keeps working purely
      in 0–1 fraction space, unchanged by zoom/pan — only this screen→fraction conversion does. */
  function fractionFromEvent(clientX: number, clientY: number): { fractionX: number; fractionY: number } {
    const rect = viewportRef.current!.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const worldX = (screenX - view.panX) / view.scale;
    const worldY = (screenY - view.panY) / view.scale;
    return { fractionX: clamp01(worldX / canvasWidthPx), fractionY: clamp01(worldY / canvasHeightPx) };
  }

  function addPortAt(fractionX: number, fractionY: number) {
    const id = crypto.randomUUID();
    const x = gridSnapEnabled ? gridSnap(fractionX, GRID_SPACING_FRACTION) : fractionX;
    const y = gridSnapEnabled ? gridSnap(fractionY, GRID_SPACING_FRACTION) : fractionY;
    setPorts((prev) => [...prev, { id, name: `Port ${prev.length + 1}`, fractionX: x, fractionY: y }]);
  }

  function handlePreviewClick(event: MouseEvent<HTMLDivElement>) {
    if (mode !== 'import' || !artworkDataUrl) return;
    const { fractionX, fractionY } = fractionFromEvent(event.clientX, event.clientY);
    addPortAt(fractionX, fractionY);
  }

  function handleShapesCanvasPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const start = fractionFromEvent(event.clientX, event.clientY);

    if (tool === 'port') {
      addPortAt(start.fractionX, start.fractionY);
      return;
    }

    if (tool === 'text') {
      const shape: SymbolShape = { id: crypto.randomUUID(), kind: 'text', x: start.fractionX, y: start.fractionY, text: 'Label', fontSize: 0.08, style: defaultStyle };
      commitShapes([...shapes, shape]);
      setSelectedShapeIds(new Set([shape.id]));
      setEditingTextId(shape.id);
      setEditingTextValue('Label');
      setTool('select');
      return;
    }

    if (tool === 'polygon') {
      // Clicking back near the first vertex closes the polygon instead of requiring a double-click
      // — the intuitive "close the loop" gesture. Needs at least 3 vertices placed already so this
      // click isn't just re-clicking the first point of a still-open 1- or 2-point draft.
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
      // Click order is start, end, then a point the arc bulges toward (sets the radius) —
      // arcFromThreePoints's own (start, end, through) parameter order, so no reordering needed.
      const arc = arcFromThreePoints(nextPoints[0], nextPoints[1], nextPoints[2], defaultStyle);
      setArcThreePointDraft(null);
      setPendingPoint(null);
      if (arc) {
        commitShapes([...shapes, arc]);
        setSelectedShapeIds(new Set([arc.id]));
        setTool('select');
      }
      return;
    }

    if (tool === 'select') {
      const canvasEl = event.currentTarget;
      // Hit-test order (§4): rotate handle → geometry handle (single selection only) → shape-body drag → marquee.
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
            const current = fractionFromEvent(ev.clientX, ev.clientY);
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

      // Geometry (resize/reshape) handle hit test — only when exactly one shape is selected.
      // originalShape is captured once here and passed unchanged to every applyHandleDrag call
      // in `move`, never re-derived from the mutating draft — the §4.1 fix.
      if (selectedForRotate.length === 1) {
        const originalShape = selectedForRotate[0];
        const hitRadius = GEOMETRY_HANDLE_HIT_RADIUS_PX / view.scale;
        const hitHandle = shapeHandles(originalShape, canvasWidthPx, canvasHeightPx).find(
          (h) => Math.hypot(h.x * canvasWidthPx - start.fractionX * canvasWidthPx, h.y * canvasHeightPx - start.fractionY * canvasHeightPx) <= hitRadius,
        );
        if (hitHandle) {
          canvasEl.setPointerCapture(event.pointerId);
          // Arc start/end handles need their sweep clamped continuously frame-to-frame (see
          // applyHandleDrag's sweepReference doc comment) rather than against the drag-start
          // snapshot alone — chained forward here as each move's own result feeds the next.
          let sweepReference = originalShape.kind === 'arc' ? normalizeAngle(originalShape.endAngle - originalShape.startAngle) : undefined;
          const move = (ev: PointerEvent) => {
            const current = fractionFromEvent(ev.clientX, ev.clientY);
            let point = { x: current.fractionX, y: current.fractionY };
            // Angle snap only for a line/arrow endpoint handle — a "fixed point + moving point" drag.
            if (angleSnapEnabled && (originalShape.kind === 'line' || originalShape.kind === 'arrow')) {
              const fixed = hitHandle.id === 'p1' ? { x: originalShape.x2, y: originalShape.y2 } : { x: originalShape.x1, y: originalShape.y1 };
              point = angleSnap(fixed, point, angleSnapDegrees);
            }
            // Object/endpoint snap takes priority over grid snap — an exact geometric match beats a rounded-to-grid guess (§6.3).
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
          return; // shift-click only toggles membership, no drag — matches scene.ts's shift-click convention
        }
        // Clicking a shape already in a multi-selection keeps the whole group selected
        // (so it can be group-dragged); clicking outside it replaces the selection.
        const dragIds = selectedShapeIds.has(hit.id) ? selectedShapeIds : new Set([hit.id]);
        setSelectedShapeIds(dragIds);
        const dragShapes = shapes.filter((s) => dragIds.has(s.id));
        const move = (ev: PointerEvent) => {
          let current = fractionFromEvent(ev.clientX, ev.clientY);
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

      // Empty canvas: marquee-select. Non-additive click clears the current selection immediately.
      if (!event.shiftKey) setSelectedShapeIds(new Set());
      setMarquee({ start, current: start, additive: event.shiftKey });
      const move = (ev: PointerEvent) => {
        const current = fractionFromEvent(ev.clientX, ev.clientY);
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
            // A shape counts as inside if its bounds midpoint falls inside the marquee
            // rectangle — same rule as the old app's rubber-band select, not full overlap.
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

    // Drag-to-create: line, rect, circle, arc.
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
        setTool('select');
      }
      setDraftShapes(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function handleShapesCanvasPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if ((tool === 'polygon' && polygonDraft) || (tool === 'arcThreePoint' && arcThreePointDraft)) {
      setPendingPoint(fractionFromEvent(event.clientX, event.clientY));
    }
  }

  function handleShapesCanvasDoubleClick(event: MouseEvent<HTMLCanvasElement>) {
    if (tool === 'polygon') {
      // The dblclick's own two constituent pointerdowns each already appended a point (there's no
      // reliable native signal at pointerdown time to know a dblclick is coming) — drop the last one,
      // a near-duplicate of the true final vertex, before finishing.
      finishPolygon(polygonDraft && polygonDraft.length > 1 ? polygonDraft.slice(0, -1) : polygonDraft);
      return;
    }
    if (tool === 'select') {
      const { fractionX, fractionY } = fractionFromEvent(event.clientX, event.clientY);
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

  function linkPorts(a: string, b: string) {
    setGroups((prev) => {
      const groupA = prev.find((g) => g.includes(a));
      const groupB = prev.find((g) => g.includes(b));
      if (groupA && groupA === groupB) return prev; // already linked
      if (groupA && groupB) return [...prev.filter((g) => g !== groupA && g !== groupB), [...new Set([...groupA, ...groupB])]];
      if (groupA) return prev.map((g) => (g === groupA ? [...g, b] : g));
      if (groupB) return prev.map((g) => (g === groupB ? [...g, a] : g));
      return [...prev, [a, b]];
    });
  }

  function handlePortPointerDown(event: ReactPointerEvent<HTMLDivElement>, portId: string) {
    event.stopPropagation();
    if (linkMode) {
      if (!linkFirstPortId) {
        setLinkFirstPortId(portId);
      } else if (linkFirstPortId === portId) {
        setLinkFirstPortId(null);
      } else {
        linkPorts(linkFirstPortId, portId);
        setLinkFirstPortId(null);
      }
      return;
    }
    const move = (ev: PointerEvent) => {
      const current = fractionFromEvent(ev.clientX, ev.clientY);
      const fractionX = gridSnapEnabled ? gridSnap(current.fractionX, GRID_SPACING_FRACTION) : current.fractionX;
      const fractionY = gridSnapEnabled ? gridSnap(current.fractionY, GRID_SPACING_FRACTION) : current.fractionY;
      setPorts((prev) => prev.map((p) => (p.id === portId ? { ...p, fractionX, fractionY } : p)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function handlePortDoubleClick(event: MouseEvent<HTMLDivElement>, port: PortSpec) {
    event.stopPropagation();
    setEditingPortId(port.id);
    setEditPortName(port.name);
  }

  function commitPortRename() {
    if (editingPortId && editPortName.trim()) {
      const trimmed = editPortName.trim();
      setPorts((prev) => prev.map((p) => (p.id === editingPortId ? { ...p, name: trimmed } : p)));
    }
    setEditingPortId(null);
  }

  function removePort(id: string) {
    setPorts((prev) => prev.filter((p) => p.id !== id));
    setGroups((prev) => prev.map((g) => g.filter((pid) => pid !== id)).filter((g) => g.length >= 2));
    if (linkFirstPortId === id) setLinkFirstPortId(null);
  }

  function ungroup(index: number) {
    setGroups((prev) => prev.filter((_, i) => i !== index));
  }

  function portName(id: string): string {
    return ports.find((p) => p.id === id)?.name ?? id;
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!nativeWidth || !nativeHeight) {
      setError('Width and height are required.');
      return;
    }
    let iconRef: string;
    if (mode === 'shapes') {
      if (shapes.length === 0) {
        setError('Draw at least one shape, or switch to Import image.');
        return;
      }
      const widthPx = (nativeWidth / 72) * STAMP_SOURCE_DPI;
      const heightPx = (nativeHeight / 72) * STAMP_SOURCE_DPI;
      iconRef = rasterizeSymbolShapes(shapes, widthPx, heightPx);
    } else {
      if (!artworkDataUrl) {
        setError('Artwork is required.');
        return;
      }
      iconRef = artworkDataUrl;
    }
    onSave({
      id: definition?.id ?? crypto.randomUUID(),
      label: name.trim(),
      discipline,
      category,
      nativeWidth,
      nativeHeight,
      ports,
      iconRef,
      source: 'custom',
      definitionPortGroups: groups.length > 0 ? groups : undefined,
      shapes: mode === 'shapes' ? shapes : undefined,
    });
  }

  const editingPort = editingPortId ? ports.find((p) => p.id === editingPortId) : undefined;
  const editingTextShape = editingTextId ? shapes.find((s) => s.id === editingTextId) : undefined;

  return (
    <Dialog
      title={definition ? 'Edit Element' : 'Create Custom Element'}
      onClose={requestClose}
      className="mep-modal--wide"
      actions={
        <>
          <button onClick={requestClose}>Cancel</button>
          <button onClick={handleSave}>{definition ? 'Save' : 'Create'}</button>
        </>
      }
    >
      <div className="mep-ee-body">
        {pendingClose && (
          <div className="mep-ee-confirm-close">
            <div className="mep-ee-confirm-close-box">
              <p>Discard unsaved changes?</p>
              <div className="mep-ee-confirm-close-actions">
                <button type="button" onClick={() => setPendingClose(false)}>
                  Keep editing
                </button>
                <button type="button" onClick={onClose}>
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="mep-ee-header">
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={discipline} onChange={(e) => setDiscipline(e.target.value as Discipline)}>
            {DISCIPLINE_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {DISCIPLINE_LABEL[d]}
              </option>
            ))}
          </select>
          <div className="mep-seg2">
            {(['terminal', 'equipment'] as StampCategory[]).map((c) => (
              <button key={c} type="button" className={category === c ? 'on' : ''} onClick={() => setCategory(c)}>
                {c === 'terminal' ? 'Terminal' : 'Equipment'}
              </button>
            ))}
          </div>
          <div className="mep-seg2">
            <button type="button" className={mode === 'import' ? 'on' : ''} onClick={() => setMode('import')}>
              Import
            </button>
            <button
              type="button"
              className={mode === 'shapes' ? 'on' : ''}
              onClick={() => {
                setMode('shapes');
                setActiveTab('shapes');
              }}
            >
              Draw
            </button>
          </div>
          <div className="mep-ee-header-wh">
            <label>
              W <input type="number" min={1} value={nativeWidth} onChange={(e) => setNativeWidth(Number(e.target.value))} />
            </label>
            <label>
              H <input type="number" min={1} value={nativeHeight} onChange={(e) => setNativeHeight(Number(e.target.value))} />
            </label>
          </div>
          {mode === 'import' && (
            <label className="mep-stamp-tile mep-file-btn mep-ee-header-import">
              {artworkDataUrl ? 'Replace image…' : 'Import image…'}
              <input
                type="file"
                accept="image/png,image/svg+xml"
                onChange={(e) => e.target.files?.[0] && void handleArtworkFile(e.target.files[0])}
              />
            </label>
          )}
        </div>

        <div className="mep-subtabs">
          {mode === 'shapes' && (
            <button type="button" className={activeTab === 'shapes' ? 'on' : ''} onClick={() => setActiveTab('shapes')}>
              Shapes
            </button>
          )}
          <button type="button" className={activeTab === 'ports' ? 'on' : ''} onClick={() => setActiveTab('ports')}>
            Ports
          </button>
          <button type="button" className={activeTab === 'labels' ? 'on' : ''} disabled title="Coming soon">
            Labels
          </button>
        </div>

        <div className="mep-ee-grid">
          {mode === 'shapes' && activeTab === 'shapes' && (
            <div className="mep-ee-rail" style={{ gridColumn: '1 / 2' }}>
              {SHAPE_TOOLS.map(({ tool: t, label }) => {
                const Icon = SHAPE_TOOL_ICONS[t];
                return (
                  <button key={t} type="button" className={`mep-rail-btn${tool === t ? ' active' : ''}`} title={label} onClick={() => setTool(t)}>
                    <Icon size={18} />
                  </button>
                );
              })}
              <div className="mep-rail-divider" />
              <button type="button" className="mep-rail-btn" title="Undo" disabled={!shapesManager.canUndo} onClick={undoShapes}>
                <IconUndo size={18} />
              </button>
              <button type="button" className="mep-rail-btn" title="Redo" disabled={!shapesManager.canRedo} onClick={redoShapes}>
                <IconRedo size={18} />
              </button>
            </div>
          )}

          <div className="mep-ee-canvas-col" style={{ gridColumn: '2 / 3' }}>
            <div
              className="mep-element-editor-preview"
              ref={viewportRef}
              onClick={handlePreviewClick}
              onPointerDown={handleViewportPointerDown}
              onContextMenu={(e) => e.preventDefault()}
            >
              {mode === 'shapes' && (
                <canvas ref={shapesCanvasRef} onPointerDown={handleShapesCanvasPointerDown} onPointerMove={handleShapesCanvasPointerMove} onDoubleClick={handleShapesCanvasDoubleClick} />
              )}
              <div
                className="mep-ee-artwork"
                style={{ width: canvasWidthPx, height: canvasHeightPx, transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.scale})` }}
              >
                {mode === 'import' && artworkDataUrl && <img src={artworkDataUrl} alt="" />}
                {ports.map((port) => (
                  <div
                    key={port.id}
                    className={`mep-element-editor-port${linkMode && linkFirstPortId === port.id ? ' selected' : ''}`}
                    style={{ left: `${port.fractionX * 100}%`, top: `${port.fractionY * 100}%` }}
                    onPointerDown={(e) => handlePortPointerDown(e, port.id)}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => handlePortDoubleClick(e, port)}
                    title={port.name}
                  >
                    <span className="mep-element-editor-port-label">{port.name}</span>
                  </div>
                ))}
                {editingPort && (
                  <input
                    autoFocus
                    className="mep-element-editor-port-rename"
                    style={{
                      left: `${editingPort.fractionX * 100}%`,
                      top: `${editingPort.fractionY * 100}%`,
                      transform: `scale(${1 / view.scale}) translate(-50%, -140%)`,
                    }}
                    value={editPortName}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditPortName(e.target.value)}
                    onBlur={commitPortRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitPortRename();
                      if (e.key === 'Escape') setEditingPortId(null);
                    }}
                  />
                )}
                {editingTextShape && editingTextShape.kind === 'text' && (
                  <input
                    ref={textRenameRef}
                    className="mep-element-editor-port-rename"
                    style={{
                      left: `${editingTextShape.x * 100}%`,
                      top: `${editingTextShape.y * 100}%`,
                      transform: `scale(${1 / view.scale}) translate(-50%, -140%)`,
                    }}
                    value={editingTextValue}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditingTextValue(e.target.value)}
                    onBlur={commitTextEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitTextEdit();
                      if (e.key === 'Escape') setEditingTextId(null);
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="mep-ee-sidebar" style={{ gridColumn: '3 / 4' }}>
            {activeTab === 'ports' && (
              <>
                <p className="mep-hint">
                  {mode === 'import'
                    ? 'Click the preview to add a port.'
                    : 'Use the Port tool on the Shapes tab to add a port.'}{' '}
                  Drag a port to move it. Double-click a port to rename it.
                </p>
                {ports.length > 0 && (
                  <div className="mep-section">
                    <h4>Ports</h4>
                    {ports.map((port) => (
                      <div className="mep-port-list-row" key={port.id}>
                        <input value={port.name} onChange={(e) => setPorts((prev) => prev.map((p) => (p.id === port.id ? { ...p, name: e.target.value } : p)))} />
                        <button type="button" className="mep-property-row-remove" onClick={() => removePort(port.id)} title="Remove port">
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {ports.length >= 2 && (
                  <div className="mep-section">
                    <h4>Linked Ports</h4>
                    <p className="mep-hint">
                      Linked ports collapse into one connectivity node once placed — e.g. a unit's supply and return,
                      so a segment between them never bridges the two networks.
                    </p>
                    <button
                      type="button"
                      className={linkMode ? 'on' : ''}
                      onClick={() => {
                        setLinkMode(!linkMode);
                        setLinkFirstPortId(null);
                      }}
                    >
                      {linkMode ? 'Done linking' : 'Link ports…'}
                    </button>
                    {linkMode && <p className="mep-hint">Click two ports above to link them.</p>}
                    {groups.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        {groups.map((group, i) => (
                          <span className="mep-port-group-chip" key={i}>
                            {group.map(portName).join(' + ')}
                            <button type="button" className="mep-property-row-remove" onClick={() => ungroup(i)} title="Ungroup">
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {activeTab === 'labels' && <p className="mep-hint">Labels — coming soon.</p>}
          </div>
        </div>

        {mode === 'shapes' && activeTab === 'shapes' && (
          <div className="mep-ee-bar">
            <div className="mep-ee-bar-cluster mep-shape-style-row">
              <label>
                Stroke <ColorPicker value={activeStyle.stroke} onChange={(color) => updateActiveStyle({ stroke: color })} />
              </label>
              <label>
                Width{' '}
                <input
                  type="number"
                  min={0.002}
                  max={0.05}
                  step={0.002}
                  value={activeStyle.strokeWidth}
                  onChange={(e) => updateActiveStyle({ strokeWidth: Number(e.target.value) })}
                  style={{ width: 56 }}
                />
              </label>
              <label>
                <input type="checkbox" checked={activeStyle.fill !== null} onChange={(e) => updateActiveStyle({ fill: e.target.checked ? activeStyle.stroke : null })} /> Fill
              </label>
              {activeStyle.fill !== null && <ColorPicker value={activeStyle.fill} onChange={(color) => updateActiveStyle({ fill: color })} />}
            </div>
            <div className="mep-ee-bar-divider" />
            <div className="mep-ee-bar-cluster">
              <button type="button" className="mep-rail-btn" onClick={duplicateSelection} disabled={selectedShapes.length === 0} title="Duplicate">
                <IconCopy size={18} />
              </button>
              <button type="button" className="mep-rail-btn" onClick={rotateSelection90} disabled={selectedShapes.length === 0} title="Rotate 90°">
                <IconRotate size={18} />
              </button>
              <button type="button" className="mep-rail-btn" onClick={() => mirrorSelection('horizontal')} disabled={selectedShapes.length === 0} title="Mirror horizontally">
                <IconMirror size={18} />
              </button>
              <button
                type="button"
                className="mep-rail-btn"
                onClick={() => mirrorSelection('vertical')}
                disabled={selectedShapes.length === 0}
                title="Mirror vertically"
              >
                <IconMirror size={18} style={{ transform: 'rotate(90deg)' }} />
              </button>
              <label className="mep-ee-scale-field">
                <IconScale size={16} />
                <input
                  type="number"
                  min={1}
                  style={{ width: 48 }}
                  value={scalePercentInput}
                  disabled={selectedShapes.length === 0}
                  onChange={(e) => setScalePercentInput(e.target.value)}
                  onBlur={applyScalePercent}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyScalePercent();
                  }}
                />
                %
              </label>
              <button type="button" className="mep-rail-btn" onClick={bringSelectionToFront} disabled={selectedShapes.length === 0} title="Bring to front">
                <IconBringToFront size={18} />
              </button>
              <button type="button" className="mep-rail-btn" onClick={sendSelectionToBack} disabled={selectedShapes.length === 0} title="Send to back">
                <IconSendToBack size={18} />
              </button>
              <button type="button" className="mep-rail-btn" onClick={deleteSelectedShapes} disabled={selectedShapes.length === 0} title="Delete">
                <IconTrash size={18} />
              </button>
            </div>
            <div className="mep-ee-bar-divider" />
            <div className="mep-ee-bar-cluster">
              <button type="button" className="mep-rail-btn" onClick={() => zoomAtScreenPoint(1 / ZOOM_STEP, { x: viewportSize.width / 2, y: viewportSize.height / 2 })} title="Zoom out">
                <IconMinus size={16} />
              </button>
              <span className="mep-ee-zoom-readout">{Math.round(view.scale * 100)}%</span>
              <button type="button" className="mep-rail-btn" onClick={() => zoomAtScreenPoint(ZOOM_STEP, { x: viewportSize.width / 2, y: viewportSize.height / 2 })} title="Zoom in">
                <IconPlus size={16} />
              </button>
              <button type="button" className="mep-rail-btn" onClick={() => fitView()} title="Fit">
                <IconZoomFit size={18} />
              </button>
            </div>
            <div className="mep-ee-bar-divider" />
            <div className="mep-ee-bar-cluster">
              <button type="button" className={`mep-rail-btn${gridSnapEnabled ? ' active' : ''}`} onClick={() => setGridSnapEnabled((v) => !v)} title="Grid snap">
                <IconGridSnap size={16} />
              </button>
              <button type="button" className={`mep-rail-btn${objectSnapEnabled ? ' active' : ''}`} onClick={() => setObjectSnapEnabled((v) => !v)} title="Object snap">
                <IconObjectSnap size={16} />
              </button>
              <button type="button" className={`mep-rail-btn${angleSnapEnabled ? ' active' : ''}`} onClick={() => setAngleSnapEnabled((v) => !v)} title="Angle snap">
                <IconSnapAngle size={16} />
              </button>
              <input
                type="number"
                min={1}
                max={180}
                className="mep-ee-angle-input"
                value={angleSnapDegreesInput}
                disabled={!angleSnapEnabled}
                onChange={(e) => setAngleSnapDegreesInput(e.target.value)}
                title="Angle snap increment (degrees)"
              />
            </div>
            {singleSelectedShape?.kind === 'arc' && (
              <>
                <div className="mep-ee-bar-divider" />
                <div className="mep-ee-bar-cluster">
                  <label>
                    Start°
                    <input
                      type="number"
                      style={{ width: 52 }}
                      value={Math.round((singleSelectedShape.startAngle * 180) / Math.PI)}
                      onChange={(e) =>
                        commitShapes(
                          shapes.map((s) => (s.id === singleSelectedShape.id && s.kind === 'arc' ? { ...s, startAngle: (Number(e.target.value) * Math.PI) / 180 } : s)),
                        )
                      }
                    />
                  </label>
                  <label>
                    End°
                    <input
                      type="number"
                      style={{ width: 52 }}
                      value={Math.round((singleSelectedShape.endAngle * 180) / Math.PI)}
                      onChange={(e) =>
                        commitShapes(
                          shapes.map((s) => (s.id === singleSelectedShape.id && s.kind === 'arc' ? { ...s, endAngle: (Number(e.target.value) * Math.PI) / 180 } : s)),
                        )
                      }
                    />
                  </label>
                </div>
              </>
            )}
          </div>
        )}

        {error && <p className="mep-field-error">{error}</p>}
      </div>
    </Dialog>
  );
}
