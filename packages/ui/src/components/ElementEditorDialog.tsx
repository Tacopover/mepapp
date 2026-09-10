import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { CommandManager, type Discipline, type PortSpec, type StampCategory, type StampDefinition, type SymbolShape, type SymbolShapeStyle } from '@mepapp/core';
import { Dialog } from './Dialog.js';
import { loadStampBitmap } from '../stampBitmap.js';
import {
  createDraftShape,
  drawSymbolShapes,
  hitTestSymbolShape,
  isDraftLargeEnough,
  rasterizeSymbolShapes,
  symbolShapeBounds,
  translateShape,
  updateDraftShape,
  type ShapeDrawTool,
} from '../symbolShapeCanvas.js';

/** Same 300 DPI convention as stampBitmap.ts/scene.ts's STAMP_SOURCE_DPI — stamp art's pixel size at 300 DPI is expected to match its nominal size in PDF points. */
const STAMP_SOURCE_DPI = 300;

/** Drawing-buffer resolution for the Shapes-mode canvas — always square regardless of the definition's own nativeWidth:nativeHeight aspect, same simplification the ports overlay already relies on (fractions are relative to the full preview box, not the artwork's own aspect). */
const SHAPE_CANVAS_PX = 520;

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
type ShapeTool = 'select' | 'port' | ShapeDrawTool | 'text';

const SHAPE_TOOLS: { tool: ShapeTool; label: string }[] = [
  { tool: 'select', label: 'Select' },
  { tool: 'port', label: 'Port' },
  { tool: 'line', label: 'Line' },
  { tool: 'rect', label: 'Rect' },
  { tool: 'circle', label: 'Circle' },
  { tool: 'arc', label: 'Arc' },
  { tool: 'text', label: 'Text' },
];

const DEFAULT_STYLE: SymbolShapeStyle = { stroke: '#1a1a1a', strokeWidth: 0.01, fill: null };

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
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
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [draftShape, setDraftShape] = useState<SymbolShape | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState('');
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

  const selectedShape = selectedShapeId ? shapes.find((s) => s.id === selectedShapeId) : undefined;
  const activeStyle = selectedShape?.style ?? defaultStyle;

  function commitShapes(next: SymbolShape[]) {
    shapesManager.execute({ description: 'Edit shape', execute: () => next, undo: () => shapes });
    setShapes(next);
  }

  function undoShapes() {
    setShapes(shapesManager.undo());
    setSelectedShapeId(null);
  }

  function redoShapes() {
    setShapes(shapesManager.redo());
    setSelectedShapeId(null);
  }

  function updateActiveStyle(patch: Partial<SymbolShapeStyle>) {
    if (selectedShapeId) {
      commitShapes(shapes.map((s) => (s.id === selectedShapeId ? { ...s, style: { ...s.style, ...patch } } : s)));
    } else {
      setDefaultStyle((prev) => ({ ...prev, ...patch }));
    }
  }

  function deleteSelectedShape() {
    if (!selectedShapeId) return;
    commitShapes(shapes.filter((s) => s.id !== selectedShapeId));
    setSelectedShapeId(null);
  }

  // Redraw the Shapes-mode canvas whenever its state changes.
  useEffect(() => {
    if (mode !== 'shapes') return;
    const canvas = shapesCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const toDraw = draftShape ? [...shapes.filter((s) => s.id !== draftShape.id), draftShape] : shapes;
    drawSymbolShapes(ctx, toDraw, canvas.width, canvas.height);
    const highlighted = selectedShapeId ? toDraw.find((s) => s.id === selectedShapeId) : undefined;
    if (highlighted) {
      const b = symbolShapeBounds(highlighted);
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#2f6fed';
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x * canvas.width - 3, b.y * canvas.height - 3, b.width * canvas.width + 6, b.height * canvas.height + 6);
      ctx.restore();
    }
  }, [mode, shapes, draftShape, selectedShapeId]);

  // Delete/Backspace removes the selected shape; Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes — only while Shapes mode is active and no text field has focus.
  useEffect(() => {
    if (mode !== 'shapes') return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedShapeId) {
        event.preventDefault();
        deleteSelectedShape();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redoShapes();
        else undoShapes();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redoShapes();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedShapeId, shapes]);

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
      setSelectedShapeId(shape.id);
      setEditingTextId(shape.id);
      setEditingTextValue('Label');
      setTool('select');
      return;
    }

    if (tool === 'select') {
      const hit = hitTestSymbolShape(shapes, start.fractionX, start.fractionY, SHAPE_CANVAS_PX, SHAPE_CANVAS_PX);
      setSelectedShapeId(hit?.id ?? null);
      if (!hit) return;
      const move = (ev: PointerEvent) => {
        const current = fractionFromEvent(ev.clientX, ev.clientY);
        setDraftShape(translateShape(hit, current.fractionX - start.fractionX, current.fractionY - start.fractionY));
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setDraftShape((current) => {
          if (current) commitShapes(shapes.map((s) => (s.id === current.id ? current : s)));
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
    setDraftShape(draft);
    const move = (ev: PointerEvent) => {
      const current = fractionFromEvent(ev.clientX, ev.clientY);
      draft = updateDraftShape(draft, start, current);
      setDraftShape(draft);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (isDraftLargeEnough(draft)) {
        commitShapes([...shapes, draft]);
        setSelectedShapeId(draft.id);
        setTool('select');
      }
      setDraftShape(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
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
              {selectedShape && (
                <button type="button" className="mep-property-row-remove" onClick={deleteSelectedShape} title="Delete shape">
                  ✕
                </button>
              )}
            </div>
            {selectedShape?.kind === 'arc' && (
              <>
                <div className="mep-field-row">
                  <label>Start°</label>
                  <input
                    type="number"
                    value={Math.round((selectedShape.startAngle * 180) / Math.PI)}
                    onChange={(e) =>
                      commitShapes(
                        shapes.map((s) => (s.id === selectedShape.id && s.kind === 'arc' ? { ...s, startAngle: (Number(e.target.value) * Math.PI) / 180 } : s)),
                      )
                    }
                  />
                </div>
                <div className="mep-field-row">
                  <label>End°</label>
                  <input
                    type="number"
                    value={Math.round((selectedShape.endAngle * 180) / Math.PI)}
                    onChange={(e) =>
                      commitShapes(
                        shapes.map((s) => (s.id === selectedShape.id && s.kind === 'arc' ? { ...s, endAngle: (Number(e.target.value) * Math.PI) / 180 } : s)),
                      )
                    }
                  />
                </div>
              </>
            )}
            <p className="mep-hint">Drag to draw. Select tool: click a shape to select/move it, Delete to remove. Port tool: click to place a port.</p>
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
