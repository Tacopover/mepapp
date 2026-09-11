import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { CommandManager, type Discipline, type PortSpec, type StampCategory, type StampDefinition, type SymbolShape, type SymbolShapeStyle } from '@mepapp/core';
import { Dialog } from './Dialog.js';
import { loadStampBitmap } from '../stampBitmap.js';
import {
  arcFromThreePoints,
  createDraftShape,
  drawSymbolShapes,
  hitTestSymbolShape,
  isDraftLargeEnough,
  mirrorShape,
  rasterizeSymbolShapes,
  rotateShapeAround,
  scaleShape,
  selectionBounds,
  selectionPivot,
  symbolShapeBounds,
  translateShape,
  updateDraftShape,
  type ShapeDrawTool,
} from '../symbolShapeCanvas.js';

/** Same 300 DPI convention as stampBitmap.ts/scene.ts's STAMP_SOURCE_DPI — stamp art's pixel size at 300 DPI is expected to match its nominal size in PDF points. */
const STAMP_SOURCE_DPI = 300;

/** Drawing-buffer resolution for the Shapes-mode canvas — always square regardless of the definition's own nativeWidth:nativeHeight aspect, same simplification the ports overlay already relies on (fractions are relative to the full preview box, not the artwork's own aspect). */
const SHAPE_CANVAS_PX = 520;

/** Rotate handle geometry, in the same SHAPE_CANVAS_PX pixel space — a stem above the selection's top edge ending in a small draggable circle. */
const ROTATE_HANDLE_OFFSET_PX = 28;
const ROTATE_HANDLE_RADIUS_PX = 6;

const DISCIPLINE_OPTIONS: Discipline[] = [
  'heatingAndCooling',
  'ventilation',
  'plumbing',
  'fireProtection',
  'electricalPathways',
  'electricalCircuits',
];

const DISCIPLINE_LABEL: Record<Discipline, string> = {
  heatingAndCooling: 'Heating & Cooling',
  ventilation: 'Ventilation',
  plumbing: 'Plumbing',
  fireProtection: 'Fire Protection',
  electricalPathways: 'Electrical Pathways',
  electricalCircuits: 'Electrical Circuits',
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

const DEFAULT_STYLE: SymbolShapeStyle = { stroke: '#1a1a1a', strokeWidth: 0.01, fill: null };

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Rotate handle sits centered above the selection's top edge, offset by a fixed pixel distance — fraction-space position, in the SHAPE_CANVAS_PX pixel convention. */
function rotateHandlePosition(selected: SymbolShape[]): { x: number; y: number } | null {
  if (selected.length === 0) return null;
  const b = selectionBounds(selected);
  return { x: b.x + b.width / 2, y: b.y - ROTATE_HANDLE_OFFSET_PX / SHAPE_CANVAS_PX };
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
export function ElementEditorDialog({ definition, onSave, onClose }: ElementEditorDialogProps) {
  const [name, setName] = useState(definition?.label ?? '');
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
  const previewRef = useRef<HTMLDivElement | null>(null);

  // Shapes mode (§5.3) — local undo/redo history, same Command/CommandManager
  // primitive the rest of the app uses, scoped to just this dialog's canvas.
  const [shapesManager] = useState(() => new CommandManager<SymbolShape[]>(definition?.shapes ?? []));
  const [shapes, setShapes] = useState<SymbolShape[]>(shapesManager.getState());
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
    const pivot = selectionPivot(selectedShapes);
    commitShapes(shapes.map((s) => (selectedShapeIds.has(s.id) ? mirrorShape(s, axis, pivot.x, pivot.y) : s)));
  }

  function applyScalePercent() {
    const factor = Number(scalePercentInput) / 100;
    if (selectedShapes.length === 0 || !Number.isFinite(factor) || factor <= 0) return;
    const pivot = selectionPivot(selectedShapes);
    commitShapes(shapes.map((s) => (selectedShapeIds.has(s.id) ? scaleShape(s, factor, pivot.x, pivot.y) : s)));
  }

  function finishPolygon() {
    if (!polygonDraft || polygonDraft.length < 3) return;
    const shape: SymbolShape = {
      id: crypto.randomUUID(),
      kind: 'polygon',
      points: polygonDraft.map((p) => ({ x: p.fractionX, y: p.fractionY })),
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

  // Redraw the Shapes-mode canvas whenever its state changes.
  useEffect(() => {
    if (mode !== 'shapes') return;
    const canvas = shapesCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // draftShapes either replaces in-place shapes being dragged (select tool) or
    // holds one not-yet-committed new shape being drawn (drag-to-create tools) —
    // handle both by replacing matching ids and appending any that aren't found.
    const draftById = draftShapes ? new Map(draftShapes.map((s) => [s.id, s])) : null;
    const toDraw = draftById
      ? [...shapes.map((s) => draftById.get(s.id) ?? s), ...draftShapes!.filter((s) => !shapes.some((orig) => orig.id === s.id))]
      : shapes;
    drawSymbolShapes(ctx, toDraw, canvas.width, canvas.height);
    for (const shape of toDraw) {
      if (!selectedShapeIds.has(shape.id)) continue;
      const b = symbolShapeBounds(shape);
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#2f6fed';
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x * canvas.width - 3, b.y * canvas.height - 3, b.width * canvas.width + 6, b.height * canvas.height + 6);
      ctx.restore();
    }
    if (marquee) {
      const minX = Math.min(marquee.start.fractionX, marquee.current.fractionX) * canvas.width;
      const minY = Math.min(marquee.start.fractionY, marquee.current.fractionY) * canvas.height;
      const w = Math.abs(marquee.current.fractionX - marquee.start.fractionX) * canvas.width;
      const h = Math.abs(marquee.current.fractionY - marquee.start.fractionY) * canvas.height;
      ctx.save();
      ctx.fillStyle = 'rgba(47, 111, 237, 0.12)';
      ctx.fillRect(minX, minY, w, h);
      ctx.strokeStyle = '#2f6fed';
      ctx.lineWidth = 1;
      ctx.strokeRect(minX, minY, w, h);
      ctx.restore();
    }
    if (tool === 'select' && !marquee) {
      const selectedForHandle = toDraw.filter((s) => selectedShapeIds.has(s.id));
      const handle = rotateHandlePosition(selectedForHandle);
      if (handle) {
        const b = selectionBounds(selectedForHandle);
        const handleX = handle.x * canvas.width;
        const handleY = handle.y * canvas.height;
        const stemTopY = b.y * canvas.height;
        ctx.save();
        ctx.strokeStyle = '#2f6fed';
        ctx.fillStyle = '#2f6fed';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(handleX, stemTopY);
        ctx.lineTo(handleX, handleY);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(handleX, handleY, ROTATE_HANDLE_RADIUS_PX, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Click-accumulate previews for Polygon and Arc (3-pt): placed vertices plus a
    // rubber-band line to the current pointer position.
    const activeDraftPoints = tool === 'polygon' ? polygonDraft : tool === 'arcThreePoint' ? arcThreePointDraft : null;
    if (activeDraftPoints && activeDraftPoints.length > 0) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#2f6fed';
      ctx.fillStyle = '#2f6fed';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(activeDraftPoints[0].fractionX * canvas.width, activeDraftPoints[0].fractionY * canvas.height);
      for (const p of activeDraftPoints.slice(1)) ctx.lineTo(p.fractionX * canvas.width, p.fractionY * canvas.height);
      if (pendingPoint) ctx.lineTo(pendingPoint.fractionX * canvas.width, pendingPoint.fractionY * canvas.height);
      ctx.stroke();
      for (const p of activeDraftPoints) {
        ctx.beginPath();
        ctx.arc(p.fractionX * canvas.width, p.fractionY * canvas.height, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }, [mode, shapes, draftShapes, selectedShapeIds, marquee, tool, polygonDraft, arcThreePointDraft, pendingPoint]);

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

  function fractionFromEvent(clientX: number, clientY: number): { fractionX: number; fractionY: number } {
    const rect = previewRef.current!.getBoundingClientRect();
    return { fractionX: clamp01((clientX - rect.left) / rect.width), fractionY: clamp01((clientY - rect.top) / rect.height) };
  }

  function addPortAt(fractionX: number, fractionY: number) {
    const id = crypto.randomUUID();
    setPorts((prev) => [...prev, { id, name: `Port ${prev.length + 1}`, fractionX, fractionY }]);
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
      if (event.detail && event.detail >= 2) return; // 2nd click of a dblclick — onDoubleClick finishes instead
      setPolygonDraft(polygonDraft ? [...polygonDraft, start] : [start]);
      return;
    }

    if (tool === 'arcThreePoint') {
      if (event.detail && event.detail >= 2) return;
      const nextPoints = arcThreePointDraft ? [...arcThreePointDraft, start] : [start];
      if (nextPoints.length < 3) {
        setArcThreePointDraft(nextPoints);
        return;
      }
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
      // Rotate-handle hit test takes priority over shape hit-testing.
      const selectedForRotate = shapes.filter((s) => selectedShapeIds.has(s.id));
      const handle = rotateHandlePosition(selectedForRotate);
      if (handle) {
        const handlePxX = handle.x * SHAPE_CANVAS_PX;
        const handlePxY = handle.y * SHAPE_CANVAS_PX;
        const clickPxX = start.fractionX * SHAPE_CANVAS_PX;
        const clickPxY = start.fractionY * SHAPE_CANVAS_PX;
        if (Math.hypot(clickPxX - handlePxX, clickPxY - handlePxY) <= ROTATE_HANDLE_RADIUS_PX + 3) {
          const pivot = selectionPivot(selectedForRotate);
          const pivotPxX = pivot.x * SHAPE_CANVAS_PX;
          const pivotPxY = pivot.y * SHAPE_CANVAS_PX;
          const startAngle = Math.atan2(clickPxY - pivotPxY, clickPxX - pivotPxX);
          const move = (ev: PointerEvent) => {
            const current = fractionFromEvent(ev.clientX, ev.clientY);
            const currentPxX = current.fractionX * SHAPE_CANVAS_PX;
            const currentPxY = current.fractionY * SHAPE_CANVAS_PX;
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

      const hit = hitTestSymbolShape(shapes, start.fractionX, start.fractionY, SHAPE_CANVAS_PX, SHAPE_CANVAS_PX);
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
          const current = fractionFromEvent(ev.clientX, ev.clientY);
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
                const b = symbolShapeBounds(s);
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
      const current = fractionFromEvent(ev.clientX, ev.clientY);
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

  function handleShapesCanvasDoubleClick() {
    if (tool === 'polygon') finishPolygon();
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
      const { fractionX, fractionY } = fractionFromEvent(ev.clientX, ev.clientY);
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
      onClose={onClose}
      actions={
        <>
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleSave}>{definition ? 'Save' : 'Create'}</button>
        </>
      }
    >
      <div className="mep-section">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={discipline} onChange={(e) => setDiscipline(e.target.value as Discipline)}>
          {DISCIPLINE_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {DISCIPLINE_LABEL[d]}
            </option>
          ))}
        </select>
        <div className="mep-seg2" style={{ width: '100%', marginBottom: 12 }}>
          {(['terminal', 'equipment'] as StampCategory[]).map((c) => (
            <button key={c} type="button" className={category === c ? 'on' : ''} onClick={() => setCategory(c)}>
              {c === 'terminal' ? 'Terminal' : 'Equipment'}
            </button>
          ))}
        </div>
      </div>

      <div className="mep-section">
        <h4>Artwork</h4>
        <div className="mep-seg2" style={{ width: '100%', marginBottom: 8 }}>
          <button type="button" className={mode === 'import' ? 'on' : ''} onClick={() => setMode('import')}>
            Import image
          </button>
          <button type="button" className={mode === 'shapes' ? 'on' : ''} onClick={() => setMode('shapes')}>
            Draw shapes
          </button>
        </div>

        {mode === 'shapes' && (
          <>
            <div className="mep-field-row">
              <label>W (pt)</label>
              <input type="number" min={1} value={nativeWidth} onChange={(e) => setNativeWidth(Number(e.target.value))} />
            </div>
            <div className="mep-field-row">
              <label>H (pt)</label>
              <input type="number" min={1} value={nativeHeight} onChange={(e) => setNativeHeight(Number(e.target.value))} />
            </div>
          </>
        )}

        {mode === 'import' ? (
          <>
            <label className="mep-stamp-tile mep-file-btn" style={{ width: '100%' }}>
              {artworkDataUrl ? 'Replace image…' : 'Import image…'}
              <input
                type="file"
                accept="image/png,image/svg+xml"
                onChange={(e) => e.target.files?.[0] && void handleArtworkFile(e.target.files[0])}
              />
            </label>
            <p className="mep-hint">Click the preview to add a port. Drag a port to move it. Double-click a port to rename it.</p>
          </>
        ) : (
          <>
            <div className="mep-shape-toolbar">
              {SHAPE_TOOLS.map(({ tool: t, label }) => (
                <button key={t} type="button" className={tool === t ? 'on' : ''} onClick={() => setTool(t)}>
                  {label}
                </button>
              ))}
              <button type="button" onClick={undoShapes} disabled={!shapesManager.canUndo} title="Undo">
                ⤺
              </button>
              <button type="button" onClick={redoShapes} disabled={!shapesManager.canRedo} title="Redo">
                ⤻
              </button>
            </div>
            <div className="mep-shape-toolbar">
              <button type="button" onClick={() => mirrorSelection('horizontal')} disabled={selectedShapes.length === 0} title="Mirror horizontally">
                Mirror ↔
              </button>
              <button type="button" onClick={() => mirrorSelection('vertical')} disabled={selectedShapes.length === 0} title="Mirror vertically">
                Mirror ↕
              </button>
              <label>
                Scale %{' '}
                <input
                  type="number"
                  min={1}
                  style={{ width: 56 }}
                  value={scalePercentInput}
                  disabled={selectedShapes.length === 0}
                  onChange={(e) => setScalePercentInput(e.target.value)}
                  onBlur={applyScalePercent}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyScalePercent();
                  }}
                />
              </label>
            </div>
            <div className="mep-shape-style-row">
              <label>
                Stroke <input type="color" value={activeStyle.stroke} onChange={(e) => updateActiveStyle({ stroke: e.target.value })} />
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
              {activeStyle.fill !== null && (
                <input type="color" value={activeStyle.fill} onChange={(e) => updateActiveStyle({ fill: e.target.value })} />
              )}
              {selectedShapes.length > 0 && (
                <button type="button" className="mep-property-row-remove" onClick={deleteSelectedShapes} title="Delete shape">
                  ✕
                </button>
              )}
            </div>
            {singleSelectedShape?.kind === 'arc' && (
              <>
                <div className="mep-field-row">
                  <label>Start°</label>
                  <input
                    type="number"
                    value={Math.round((singleSelectedShape.startAngle * 180) / Math.PI)}
                    onChange={(e) =>
                      commitShapes(
                        shapes.map((s) => (s.id === singleSelectedShape.id && s.kind === 'arc' ? { ...s, startAngle: (Number(e.target.value) * Math.PI) / 180 } : s)),
                      )
                    }
                  />
                </div>
                <div className="mep-field-row">
                  <label>End°</label>
                  <input
                    type="number"
                    value={Math.round((singleSelectedShape.endAngle * 180) / Math.PI)}
                    onChange={(e) =>
                      commitShapes(
                        shapes.map((s) => (s.id === singleSelectedShape.id && s.kind === 'arc' ? { ...s, endAngle: (Number(e.target.value) * Math.PI) / 180 } : s)),
                      )
                    }
                  />
                </div>
              </>
            )}
            <p className="mep-hint">
              Drag to draw. Select tool: click a shape to select/move it, Delete to remove. Shift-click or drag a marquee to
              multi-select and move/delete as a group. Port tool: click to place a port. Arc
              (3-pt): click start, end, then a point the arc passes through. Polygon: click each vertex, double-click or Enter to
              finish, Escape to cancel.
            </p>
          </>
        )}

        <div className="mep-element-editor-preview" ref={previewRef} onClick={handlePreviewClick}>
          {mode === 'import' ? (
            artworkDataUrl && <img src={artworkDataUrl} alt="" />
          ) : (
            <canvas
              ref={shapesCanvasRef}
              width={SHAPE_CANVAS_PX}
              height={SHAPE_CANVAS_PX}
              onPointerDown={handleShapesCanvasPointerDown}
              onPointerMove={handleShapesCanvasPointerMove}
              onDoubleClick={handleShapesCanvasDoubleClick}
            />
          )}
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
              style={{ left: `${editingPort.fractionX * 100}%`, top: `${editingPort.fractionY * 100}%` }}
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
              style={{ left: `${editingTextShape.x * 100}%`, top: `${editingTextShape.y * 100}%` }}
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
            Linked ports collapse into one connectivity node once placed — e.g. a unit's supply and return, so a
            segment between them never bridges the two networks.
          </p>
          <button type="button" className={linkMode ? 'on' : ''} onClick={() => { setLinkMode(!linkMode); setLinkFirstPortId(null); }}>
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

      {error && <p className="mep-field-error">{error}</p>}
    </Dialog>
  );
}
