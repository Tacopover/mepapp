import { useEffect, useMemo, useRef, useState } from 'react';
import { STAMP_LIBRARY, type Discipline, type StampCategory, type StampDefinition } from '@mepapp/core';
import { Dialog } from './Dialog.js';
import { loadStampBitmap } from '../stampBitmap.js';
import { stampLabelFor } from './StampsPanel.js';
import type { StampLabelLanguage } from './LanguageToggle.js';
import { DEFAULT_STYLE, GRID_SPACING_FRACTION, useShapeDrawEditor, type BuiltinShapeTool } from '../useShapeDrawEditor.js';
import { usePortEditor } from '../usePortEditor.js';
import { fitCanvasSize } from '../shapeCanvasSize.js';
import { IconPort } from '../icons.js';
import { rasterizeSymbolShapes, rescaleShapeForCanvasResize } from '../symbolShapeCanvas.js';
import { ShapeDrawSurface } from './ShapeDrawSurface.js';
import { BUILTIN_SHAPE_TOOL_DEFS, ShapeStyleBar, ShapeToolRail, type ShapeToolDef } from './ShapeDrawToolbar.js';

/** Same 300 DPI convention as stampBitmap.ts/scene.ts's STAMP_SOURCE_DPI — stamp art's pixel size at 300 DPI is expected to match its nominal size in PDF points. */
const STAMP_SOURCE_DPI = 300;

/** Cap on the Shapes-mode canvas's longer side, in drawing-buffer px — the shorter side is derived from the definition's own nativeWidth:nativeHeight aspect (see fitCanvasSize) so a wide/tall stamp doesn't get squished into a square, matching how it actually looks placed on the PDF. */
const SHAPE_CANVAS_MAX_PX = 520;

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

type ShapeTool = BuiltinShapeTool | 'port';

/** The Shape tools plus the stamp-only Port tool, right after Select. */
const SHAPE_TOOLS: ShapeToolDef<ShapeTool>[] = [BUILTIN_SHAPE_TOOL_DEFS[0], { tool: 'port', label: 'Port', Icon: IconPort }, ...BUILTIN_SHAPE_TOOL_DEFS.slice(1)];

type ElementEditorTab = 'shapes' | 'ports' | 'labels';

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
  /** The active document's current custom elements — used only to detect a Name collision at save time (see handleSave's overwrite-confirmation prompt), never rendered directly. */
  existingCustomDefinitions: StampDefinition[];
  /** The Stamps tab's picker-label language (see LanguageToggle) — only used to seed the Name field from definition.labelNl when opening a library stamp for editing; the saved definition always keeps a single label going forward (see StampsPanel's stampLabelFor doc comment). */
  labelLanguage?: StampLabelLanguage;
  onSave: (definition: StampDefinition) => void;
  onClose: () => void;
}

/**
 * Element Editor dialog (ports-custom-element-editor-spec.md §5.2 + §5.3;
 * shared-drawing-tool.md §6 Phase 2 for the useShapeDrawEditor/usePortEditor split) —
 * authors a custom StampDefinition: name/discipline/category, artwork (one
 * vector Shapes canvas — drawn shapes, imported images, or both at once,
 * each import landing as its own movable/deletable/resizable 'image' shape
 * alongside the rest — rasterized together to the same iconRef `data:` URL
 * at save time so every downstream render/placement call site keeps
 * treating artwork as "an image"), and click-to-place ports
 * with drag-to-reposition, double-click-to-rename, and a link-mode toggle
 * for grouping ports that are internally wired together (converted to a real
 * instance-level PortGroup at placement, see SketchScene.placeStamp).
 */
export function ElementEditorDialog({ definition, existingCustomDefinitions, labelLanguage, onSave, onClose }: ElementEditorDialogProps) {
  const [name, setName] = useState(definition ? stampLabelFor(definition, labelLanguage ?? 'en') : '');
  const [discipline, setDiscipline] = useState<Discipline>(definition?.discipline ?? 'ventilation');
  const [category, setCategory] = useState<StampCategory>(definition?.category === 'equipment' ? 'equipment' : 'terminal');
  const [nativeWidth, setNativeWidth] = useState(definition?.nativeWidth ?? 48);
  const [nativeHeight, setNativeHeight] = useState(definition?.nativeHeight ?? 48);
  const [error, setError] = useState<string | null>(null);

  // Shapes/Ports/Labels tab bar (§2) — Shapes and Ports are both always available now that
  // Import/Draw are merged into one always-on canvas (an imported image is just another shape).
  const [activeTab, setActiveTab] = useState<ElementEditorTab>('shapes');

  // Recomputed as the user edits nativeWidth/nativeHeight so the preview box
  // and canvas stay in sync with the definition's true aspect ratio.
  const { widthPx: canvasWidthPx, heightPx: canvasHeightPx } = useMemo(() => fitCanvasSize(nativeWidth, nativeHeight, SHAPE_CANVAS_MAX_PX), [nativeWidth, nativeHeight]);

  // The shared shape-draw/edit primitive (shared-drawing-tool.md) — tool palette, draft/handle/
  // marquee/select interactions, undo, view pan/zoom, keyboard shortcuts. 'port' isn't a tool it
  // knows about, so its pointer-down falls through to onUnhandledToolPointerDown, which hands
  // off to portsEditor below.
  const editor = useShapeDrawEditor<ShapeTool>({
    canvasWidthPx,
    canvasHeightPx,
    // Seeds the undo-tracked shape list once, on mount (useState lazy-initializer semantics —
    // see useShapeDrawEditor's own doc comment). A definition saved before the Import/Draw merge
    // has an iconRef but no shapes (it was raster-only, no vector source) — seed one full-canvas
    // 'image' shape from that iconRef so its art becomes an editable/movable/deletable shape like
    // any newly-imported one, instead of vanishing from the (now sole) canvas.
    initialShapes:
      definition?.shapes && definition.shapes.length > 0
        ? definition.shapes
        : definition?.iconRef
          ? [{ id: crypto.randomUUID(), kind: 'image', dataUrl: definition.iconRef, x: 0, y: 0, width: 1, height: 1, style: DEFAULT_STYLE }]
          : [],
    onUnhandledToolPointerDown: (t, point) => {
      if (t === 'port') portsEditor.addPortAt(point.fractionX, point.fractionY);
    },
  });

  // Ports tool state + logic, shared with the (not-yet-built) schematic symbol editor —
  // shared-drawing-tool.md §6. Wired to editor's grid-snap toggle and coordinate conversion
  // explicitly (not a shared global), per usePortEditor's own doc comment.
  const portsEditor = usePortEditor({
    initialPorts: definition?.ports ?? [],
    initialGroups: definition?.definitionPortGroups ?? [],
    gridSnapEnabled: editor.gridSnapEnabled,
    gridSpacingFraction: GRID_SPACING_FRACTION,
    fractionFromEvent: editor.fractionFromEvent,
  });

  // Unsaved-changes warning (§7) — isDirty is a snapshot diff, not a scattered `dirty = true` flag
  // touched by every setter: one JSON comparison correctly treats "moved a shape back to where it
  // started" as still dirty (matching normal unsaved-changes UX), and there's exactly one place to
  // keep in sync with new saveable fields. initialSnapshotRef captures the value ONCE at mount —
  // its useRef initializer expression re-evaluates every render (a JS-argument-evaluation quirk),
  // but useRef only keeps the very first result, which is exactly the mount-time snapshot we want.
  function computeSnapshot(): string {
    return JSON.stringify({ name, discipline, category, nativeWidth, nativeHeight, ports: portsEditor.ports, groups: portsEditor.groups, shapes: editor.shapes });
  }
  const initialSnapshotRef = useRef(computeSnapshot());
  const isDirty = computeSnapshot() !== initialSnapshotRef.current;
  const [pendingClose, setPendingClose] = useState(false);

  function requestClose() {
    if (isDirty) setPendingClose(true);
    else onClose();
  }

  // Escape closes just the confirm block, not the whole dialog — a capture-phase listener with
  // stopPropagation, same pattern the polygon/arc-3pt draft-cancel handler (inside
  // useShapeDrawEditor) already uses, since Dialog's own Escape-closes-everything listener is
  // also on document (see project-dialog-escape-listener-conflict).
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

  // Canvas resize, not image resize: editing nativeWidth/nativeHeight changes the fraction-space
  // box's own aspect ratio (via fitCanvasSize), so without this, every shape/port's fraction
  // coordinates would be silently reinterpreted against the new aspect and visibly shift. Rescale
  // their raw coordinates by the old/new *native* (physical, real-world-unit) size ratio — per axis —
  // so each one's ABSOLUTE physical position/size stays fixed and only the surrounding canvas
  // boundary changes, matching an image editor's "canvas size" (keep content in place) rather than
  // "image size" (stretch content). This must use nativeWidth/nativeHeight directly, not the derived
  // canvasWidthPx/heightPx: fitCanvasSize's own scale factor is SHAPE_CANVAS_MAX_PX/Math.max(w,h),
  // so canvasWidthPx/heightPx don't scale linearly per axis with nativeWidth/nativeHeight whenever
  // the aspect ratio changes — only the native sizes themselves do.
  //
  // sMin (for radius/strokeWidth) needs the same native-unit basis, not the derived canvas pixel
  // box, even though shape rendering itself (renderSymbolShapeSvg live, drawSymbolShapes at save-time
  // bake — both share this convention) scales radius by Math.min(canvasWidthPx, canvasHeightPx):
  // that pixel min equals k * Math.min(nativeWidth, nativeHeight) for the single uniform scale
  // k = SHAPE_CANVAS_MAX_PX / Math.max(nativeWidth, nativeHeight), so the *physical* (native-unit)
  // radius a fraction represents is `radius * Math.min(nativeWidth, nativeHeight)` — k cancels out.
  // Using the pixel box's own min instead (as a prior version of this fix did) folds k's own change
  // into sMin too, which is wrong whenever only the *longer* native side moves: e.g. Bath is
  // 48×19.08 (width already the longer side) — widening it to 96×19.08 doesn't change
  // Math.min(nativeWidth, nativeHeight) (still 19.08) so sMin should be 1, but the pixel box's own
  // min shrinks (k halves), which would wrongly double every circle/arc's radius on that edit alone.
  const nativeSizeRef = useRef({ width: nativeWidth, height: nativeHeight });
  useEffect(() => {
    const prev = nativeSizeRef.current;
    if (prev.width === nativeWidth && prev.height === nativeHeight) return;
    const sx = prev.width / nativeWidth;
    const sy = prev.height / nativeHeight;
    const sMin = Math.min(prev.width, prev.height) / Math.min(nativeWidth, nativeHeight);
    editor.commitShapes(editor.shapes.map((s) => rescaleShapeForCanvasResize(s, sx, sy, sMin)));
    portsEditor.setPorts((prevPorts) => prevPorts.map((p) => ({ ...p, fractionX: p.fractionX * sx, fractionY: p.fractionY * sy })));
    nativeSizeRef.current = { width: nativeWidth, height: nativeHeight };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeWidth, nativeHeight]);

  async function handleArtworkFile(file: File) {
    const [dataUrl, bitmap] = await Promise.all([readAsDataUrl(file), loadStampBitmap(file)]);
    const id = crypto.randomUUID();
    if (editor.shapes.length === 0) {
      // First content on an empty canvas — the image defines the element's own physical size and
      // fills the canvas exactly, same as the old Import mode's behavior. nativeSizeRef is updated
      // in lockstep so the nativeWidth/nativeHeight effect above (which exists to preserve EXISTING
      // shapes' physical footprint across a manual canvas-size edit) sees no change and skips its
      // rescale — this image shape already matches the new size 1:1 and doesn't need re-fitting to it.
      const newWidth = (bitmap.width * 72) / STAMP_SOURCE_DPI;
      const newHeight = (bitmap.height * 72) / STAMP_SOURCE_DPI;
      nativeSizeRef.current = { width: newWidth, height: newHeight };
      setNativeWidth(newWidth);
      setNativeHeight(newHeight);
      editor.commitShapes([{ id, kind: 'image', dataUrl, x: 0, y: 0, width: 1, height: 1, style: DEFAULT_STYLE }]);
    } else {
      // Importing onto an existing drawing must not resize the canvas out from under it — fit the
      // image centered within the current canvas box at its own aspect ratio instead (fitCanvasSize's
      // own "contain" convention), landing as a new shape the user can then move/resize/delete.
      const aspect = bitmap.width / bitmap.height;
      const canvasAspect = canvasWidthPx / canvasHeightPx;
      const width = Math.min(1, aspect / canvasAspect);
      const height = Math.min(1, canvasAspect / aspect);
      editor.commitShapes([...editor.shapes, { id, kind: 'image', dataUrl, x: (1 - width) / 2, y: (1 - height) / 2, width, height, style: DEFAULT_STYLE }]);
    }
    editor.setSelectedShapeIds(new Set([id]));
  }

  /** Built definition awaiting the user's confirm/cancel on the Name-collision prompt below — its
      id still matches this dialog's own definition/seed. For a colliding *custom* element,
      confirmOverwrite swaps in that element's id so App.tsx's save handler updates it in place
      instead of adding a new entry (see handleSaveElementDefinition's `isOverwrite` check, keyed
      on id membership). For a colliding *library* element (existingId null — nothing on the
      document side to reuse yet), confirmOverwrite saves the built definition under its own fresh
      id, adding a new custom entry that then shadows the library one in StampsPanel's grid (see
      that component's shadowedLibraryIds). */
  const [pendingOverwrite, setPendingOverwrite] = useState<{ built: StampDefinition; existingId: string | null; existingLabel: string; isLibrary: boolean } | null>(null);

  async function buildDefinition(): Promise<StampDefinition | null> {
    if (!name.trim()) {
      setError('Name is required.');
      return null;
    }
    if (!nativeWidth || !nativeHeight) {
      setError('Width and height are required.');
      return null;
    }
    if (editor.shapes.length === 0) {
      setError('Draw at least one shape, or import an image.');
      return null;
    }
    const widthPx = (nativeWidth / 72) * STAMP_SOURCE_DPI;
    const heightPx = (nativeHeight / 72) * STAMP_SOURCE_DPI;
    const iconRef = await rasterizeSymbolShapes(editor.shapes, widthPx, heightPx);
    return {
      id: definition?.id ?? crypto.randomUUID(),
      label: name.trim(),
      discipline,
      category,
      nativeWidth,
      nativeHeight,
      ports: portsEditor.ports,
      iconRef,
      source: 'custom',
      definitionPortGroups: portsEditor.groups.length > 0 ? portsEditor.groups : undefined,
      shapes: editor.shapes,
    };
  }

  async function handleSave() {
    setError(null);
    const built = await buildDefinition();
    if (!built) return;
    const builtLabel = built.label.toLowerCase();
    const labelMatches = (label: string, labelNl?: string) => label.trim().toLowerCase() === builtLabel || labelNl?.trim().toLowerCase() === builtLabel;
    // A different existing custom element already has this Name (its English name or, for a
    // fixture-generated one carrying a translation, its Dutch name) — saving straight through
    // would silently add a second element sharing it (the original bug report). Ask before
    // overwriting rather than doing it automatically, since the collision could equally mean "I
    // meant to rename this as a new element" (self-match, `id === built.id`, is a normal in-place
    // edit and never prompts).
    const collision = existingCustomDefinitions.find((d) => d.id !== built.id && labelMatches(d.label, d.labelNl));
    if (collision) {
      setPendingOverwrite({ built, existingId: collision.id, existingLabel: collision.label, isLibrary: false });
      return;
    }
    // The Name field can also match a read-only STAMP_LIBRARY entry's English or Dutch name (e.g.
    // duplicating it without renaming). There's no document-side element to overwrite yet, only a
    // hardcoded library entry — confirming here adds a new custom entry under its own id, which
    // then shadows the library tile with the same name in StampsPanel's grid.
    const libraryCollision = STAMP_LIBRARY.find((d) => labelMatches(d.label, d.labelNl));
    if (libraryCollision) {
      setPendingOverwrite({ built, existingId: null, existingLabel: libraryCollision.label, isLibrary: true });
      return;
    }
    onSave(built);
  }

  function confirmOverwrite() {
    if (!pendingOverwrite) return;
    onSave(pendingOverwrite.existingId ? { ...pendingOverwrite.built, id: pendingOverwrite.existingId } : pendingOverwrite.built);
    setPendingOverwrite(null);
  }

  return (
    <Dialog
      title={definition ? 'Edit Element' : 'Create Custom Element'}
      onClose={requestClose}
      closeOnBackdropClick={false}
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
        {pendingOverwrite && (
          <div className="mep-ee-confirm-close">
            <div className="mep-ee-confirm-close-box">
              <p>
                {pendingOverwrite.isLibrary
                  ? <>An element named &ldquo;{pendingOverwrite.existingLabel}&rdquo; already exists in the stamp library. Save your own version — it will take that element&rsquo;s place in the Stamps tab?</>
                  : <>A custom element named &ldquo;{pendingOverwrite.existingLabel}&rdquo; already exists. Overwrite it?</>}
              </p>
              <div className="mep-ee-confirm-close-actions">
                <button type="button" onClick={() => setPendingOverwrite(null)}>
                  Cancel
                </button>
                <button type="button" onClick={confirmOverwrite}>
                  Overwrite
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
          <div className="mep-ee-header-wh">
            <label>
              W <input type="number" min={1} value={nativeWidth} onChange={(e) => setNativeWidth(Number(e.target.value))} />
            </label>
            <label>
              H <input type="number" min={1} value={nativeHeight} onChange={(e) => setNativeHeight(Number(e.target.value))} />
            </label>
          </div>
          <label className="mep-stamp-tile mep-file-btn mep-ee-header-import">
            Import image…
            <input
              type="file"
              accept="image/png,image/svg+xml"
              onChange={(e) => e.target.files?.[0] && void handleArtworkFile(e.target.files[0])}
            />
          </label>
        </div>

        <div className="mep-subtabs">
          <button type="button" className={activeTab === 'shapes' ? 'on' : ''} onClick={() => setActiveTab('shapes')}>
            Shapes
          </button>
          <button type="button" className={activeTab === 'ports' ? 'on' : ''} onClick={() => setActiveTab('ports')}>
            Ports
          </button>
          <button type="button" className={activeTab === 'labels' ? 'on' : ''} disabled title="Coming soon">
            Labels
          </button>
        </div>

        <div className="mep-ee-grid">
          {activeTab === 'shapes' && <ShapeToolRail editor={editor} tools={SHAPE_TOOLS} />}

          <ShapeDrawSurface editor={editor} canvasWidthPx={canvasWidthPx} canvasHeightPx={canvasHeightPx}>
            {portsEditor.ports.map((port) => (
              <div
                key={port.id}
                className={`mep-element-editor-port${portsEditor.linkMode && portsEditor.linkFirstPortId === port.id ? ' selected' : ''}`}
                style={{ left: `${port.fractionX * 100}%`, top: `${port.fractionY * 100}%` }}
                onPointerDown={(e) => portsEditor.handlePortPointerDown(e, port.id)}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => portsEditor.handlePortDoubleClick(e, port)}
                title={port.name}
              >
                <span className="mep-element-editor-port-label">{port.name}</span>
              </div>
            ))}
            {portsEditor.editingPort && (
              <input
                autoFocus
                className="mep-element-editor-port-rename"
                style={{
                  left: `${portsEditor.editingPort.fractionX * 100}%`,
                  top: `${portsEditor.editingPort.fractionY * 100}%`,
                  transform: `scale(${1 / editor.view.scale}) translate(-50%, -140%)`,
                }}
                value={portsEditor.editPortName}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => portsEditor.setEditPortName(e.target.value)}
                onBlur={portsEditor.commitPortRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') portsEditor.commitPortRename();
                  if (e.key === 'Escape') portsEditor.setEditingPortId(null);
                }}
              />
            )}
          </ShapeDrawSurface>

          <div className="mep-ee-sidebar" style={{ gridColumn: '3 / 4' }}>
            {activeTab === 'ports' && (
              <>
                <p className="mep-hint">Use the Port tool on the Shapes tab to add a port. Drag a port to move it. Double-click a port to rename it.</p>
                {portsEditor.ports.length > 0 && (
                  <div className="mep-section">
                    <h4>Ports</h4>
                    {portsEditor.ports.map((port) => (
                      <div className="mep-port-list-row" key={port.id}>
                        <input value={port.name} onChange={(e) => portsEditor.setPorts((prev) => prev.map((p) => (p.id === port.id ? { ...p, name: e.target.value } : p)))} />
                        <button type="button" className="mep-property-row-remove" onClick={() => portsEditor.removePort(port.id)} title="Remove port">
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {portsEditor.ports.length >= 2 && (
                  <div className="mep-section">
                    <h4>Linked Ports</h4>
                    <p className="mep-hint">
                      Linked ports collapse into one connectivity node once placed — e.g. a unit's supply and return,
                      so a segment between them never bridges the two networks.
                    </p>
                    <button
                      type="button"
                      className={portsEditor.linkMode ? 'on' : ''}
                      onClick={() => {
                        portsEditor.setLinkMode(!portsEditor.linkMode);
                        portsEditor.setLinkFirstPortId(null);
                      }}
                    >
                      {portsEditor.linkMode ? 'Done linking' : 'Link ports…'}
                    </button>
                    {portsEditor.linkMode && <p className="mep-hint">Click two ports above to link them.</p>}
                    {portsEditor.groups.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        {portsEditor.groups.map((group, i) => (
                          <span className="mep-port-group-chip" key={i}>
                            {group.map(portsEditor.portName).join(' + ')}
                            <button type="button" className="mep-property-row-remove" onClick={() => portsEditor.ungroup(i)} title="Ungroup">
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

        {activeTab === 'shapes' && <ShapeStyleBar editor={editor} />}

        {error && <p className="mep-field-error">{error}</p>}
      </div>
    </Dialog>
  );
}
