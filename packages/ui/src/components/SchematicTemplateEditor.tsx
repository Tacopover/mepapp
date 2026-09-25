import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  SCHEMATIC_BLOCK_CATALOGUE,
  addBlock,
  addGroup,
  addSymbolBlock,
  buildSampleSchematicInput,
  describeRule,
  detachBlockSymbol,
  duplicateBlock,
  duplicateGroup,
  findBlock,
  generateSchematic,
  getBlockHeight,
  getBlockWidth,
  getBlocksBounds,
  getStampDefinition,
  removeBlock,
  removeGroup,
  reorderBlock,
  reorderGroup,
  resizeKeepingCorner,
  rotationFromPointer,
  snapToGrid,
  toBlockAxes,
  updateBlock,
  validateSchematicTemplate,
  type BlockRef,
  type Circuit,
  type CircuitType,
  type Panel,
  type PanelSection,
  type ResolvedBlock,
  type SchematicBlockScope,
  type SchematicBlockType,
  type SchematicInput,
  type SchematicSymbol,
  type SchematicTemplate,
  type StampDefinition,
  type SymbolShape,
} from '@mepapp/core';
import type { StampInfo } from '@mepapp/render';
import { SchematicBlockSvg } from '../schematicBlockSvg.js';
import { describeDiagnostics } from '../schematicDiagnostics.js';
import { buildSchematicTerminals } from '../schematicTerminals.js';
import { commit, createHistory, endGesture as endHistoryGesture, redo, undo, type History } from '../templateHistory.js';
import { useSheetView } from '../useSheetView.js';
import { SchematicDrawingEditor } from './SchematicDrawingEditor.js';
import { SchematicSymbolLibrary } from './SchematicSymbolLibrary.js';
import { SchematicTemplateProperties, type EditTemplate } from './SchematicTemplateProperties.js';

export interface SchematicTemplateEditorProps {
  /** The template when the editor opens. The editor keeps its own copy and reports every change through `onChange`. */
  initialTemplate: SchematicTemplate;
  onChange: (template: SchematicTemplate) => void;
  panels: Panel[];
  circuits: Circuit[];
  panelSections: PanelSection[];
  circuitTypes: CircuitType[];
  stamps: StampInfo[];
  customStampDefinitions: StampDefinition[];
  /** The symbol library (shared-drawing-tool.md Phase 4). A drawing block can point at one of these. */
  symbols: SchematicSymbol[];
  onSymbolsChange: (symbols: SchematicSymbol[]) => void;
  /** How many template blocks use the symbol, across all the user's templates. */
  symbolUses: (symbolId: string) => number;
  initialPanelId: string;
  onDone: () => void;
}

const SAMPLE = 'sample';
const GRID_OPTIONS = [0, 0.5, 1, 2, 5];
const PALETTE_SCOPES: { scope: SchematicBlockScope; label: string }[] = [
  { scope: 'once', label: 'Sheet' },
  { scope: 'panel', label: 'Panel' },
  { scope: 'section', label: 'Section' },
  { scope: 'circuit', label: 'Circuit' },
  { scope: 'aggregate', label: 'Aggregate' },
];
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

type Gesture =
  | (GestureBase & { kind: 'move'; ref: BlockRef; blockX: number; blockY: number })
  | (GestureBase & { kind: 'rotate'; ref: BlockRef; center: Point })
  | (GestureBase & { kind: 'resize'; ref: BlockRef; blockX: number; blockY: number; width: number; height: number; rotation: number })
  | (GestureBase & { kind: 'anchor'; anchor: Point });

const sameRef = (a: BlockRef | null, b: BlockRef | null) => a !== null && b !== null && a.blockId === b.blockId && a.groupId === b.groupId;

export function SchematicTemplateEditor({ initialTemplate, onChange, panels, circuits, panelSections, circuitTypes, stamps, customStampDefinitions, symbols, onSymbolsChange, symbolUses, initialPanelId, onDone }: SchematicTemplateEditorProps) {
  const [history, setHistoryState] = useState<History<SchematicTemplate>>(() => createHistory(initialTemplate));
  const historyRef = useRef(history);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const template = history.present;

  function applyHistory(next: History<SchematicTemplate>) {
    const previous = historyRef.current;
    if (next === previous) return;
    historyRef.current = next;
    setHistoryState(next);
    if (next.present !== previous.present) onChangeRef.current(next.present);
  }
  const edit: EditTemplate = (change, gestureKey = null) => applyHistory(commit(historyRef.current, change(historyRef.current.present), gestureKey));
  const endGesture = () => applyHistory(endHistoryGesture(historyRef.current));

  const [selection, setSelection] = useState<BlockRef | null>(null);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [activeGroupState, setActiveGroupState] = useState<string | null>(null);
  const [grid, setGrid] = useState(1);
  const [drawingRef, setDrawingRef] = useState<BlockRef | null>(null);
  /** The symbol library is open in place of the editor: to add a symbol block, or to change the symbol of one. */
  const [symbolLibrary, setSymbolLibrary] = useState<{ kind: 'add'; inGroup: boolean } | { kind: 'change'; ref: BlockRef } | null>(null);
  const drawingOpenRef = useRef(false);
  const [previewSource, setPreviewSource] = useState<string>(() => (circuits.some((c) => c.panelId === initialPanelId) ? initialPanelId : SAMPLE));

  const rootRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const panClickRef = useRef<Point | null>(null);

  const { view, setSvg, fit, zoomTo, clientToSheet, mmPerPixel, startPan, movePan, endPan } = useSheetView({
    sheetWidthMm: template.sheet.widthMm,
    sheetHeightMm: template.sheet.heightMm,
    resetKey: `${template.id}:${template.sheet.widthMm}x${template.sheet.heightMm}`,
  });

  const activeGroupId = activeGroupState !== null && template.groups.some((g) => g.id === activeGroupState) ? activeGroupState : null;
  const selectedBlock = selection ? findBlock(template, selection) : undefined;
  const selectionRef = useRef<BlockRef | null>(null);
  selectionRef.current = selectedBlock ? selection : null;
  const drawingBlock = drawingRef ? findBlock(template, drawingRef) : undefined;
  drawingOpenRef.current = drawingBlock !== undefined || symbolLibrary !== null;

  const terminals = useMemo(() => buildSchematicTerminals(stamps, customStampDefinitions), [stamps, customStampDefinitions]);
  const previewPanel = previewSource === SAMPLE ? undefined : panels.find((p) => p.id === previewSource);
  const input: SchematicInput = useMemo(
    () => (previewPanel ? { panel: previewPanel, circuits, sections: panelSections, terminals, circuitTypes } : buildSampleSchematicInput(template, circuitTypes)),
    [previewPanel, circuits, panelSections, terminals, circuitTypes, template],
  );
  const generated = useMemo(() => generateSchematic(input, template), [input, template]);
  const notes = useMemo(() => [...validateSchematicTemplate(template), ...describeDiagnostics(generated.diagnostics, input.circuits, input.panel)], [template, generated, input]);
  const loadTypes = useMemo(() => [...new Set(Object.values(input.terminals).map((t) => t.loadType).filter((t): t is string => t !== undefined))], [input]);

  useEffect(() => {
    // Dialog listens for Escape on the document; a capture listener on the window runs first and keeps a block selection from closing the dialog.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !selectionRef.current || drawingOpenRef.current) return;
      event.stopPropagation();
      setSelection(null);
      setInstanceId(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const blocksByTemplateId = (ref: BlockRef | null): ResolvedBlock[] => (ref ? generated.blocks.filter((b) => b.templateBlockId === ref.blockId && b.groupId === ref.groupId) : []);
  const instances = blocksByTemplateId(selectedBlock ? selection : null);
  const handleInstance = instances.find((b) => b.id === instanceId) ?? instances[0];
  const loadShapesFor = (definitionId: string | undefined) => (definitionId ? getStampDefinition(definitionId, customStampDefinitions)?.shapes : undefined);
  const symbolShapesFor = (symbolId: string | undefined) => (symbolId ? symbols.find((s) => s.id === symbolId)?.shapes : undefined);

  function selectBlock(ref: BlockRef | null, instance: string | null = null) {
    setSelection(ref);
    setInstanceId(instance);
    if (ref?.groupId) setActiveGroupState(ref.groupId);
  }

  function selectGroup(groupId: string | null) {
    setActiveGroupState(groupId);
    setSelection(null);
    setInstanceId(null);
  }

  function addFromPalette(type: SchematicBlockType) {
    const info = SCHEMATIC_BLOCK_CATALOGUE[type];
    const present = historyRef.current.present;
    let result: ReturnType<typeof addBlock>;
    if (info.scope === 'circuit') {
      const groupId = activeGroupId ?? present.groups[0]?.id;
      if (groupId === undefined) return;
      result = addBlock(present, type, { groupId });
    } else {
      const at =
        info.scope === 'section'
          ? { x: 0, y: 0 }
          : { x: snapToGrid(view.x + view.w / 2 - info.width / 2, grid), y: snapToGrid(view.y + view.h / 2 - info.height / 2, grid) };
      result = addBlock(present, type, { at });
    }
    if (!result) return;
    applyHistory(commit(historyRef.current, result.template));
    selectBlock(result.ref);
  }

  function addDrawing(inGroup: boolean) {
    const present = historyRef.current.present;
    const groupId = activeGroupId ?? present.groups[0]?.id;
    if (inGroup && groupId === undefined) return;
    const info = SCHEMATIC_BLOCK_CATALOGUE.drawing;
    const at = inGroup ? { x: 0, y: 0 } : { x: snapToGrid(view.x + view.w / 2 - info.width / 2, grid), y: snapToGrid(view.y + view.h / 2 - info.height / 2, grid) };
    const result = addBlock(present, 'drawing', { groupId: inGroup ? groupId : undefined, at });
    if (!result) return;
    applyHistory(commit(historyRef.current, result.template));
    selectBlock(result.ref);
    setDrawingRef(result.ref);
  }

  function finishDrawing(shapes: SymbolShape[]) {
    if (drawingRef) edit((t) => updateBlock(t, drawingRef, { shapes }));
    setDrawingRef(null);
  }

  function openSelectedDrawing() {
    if (selection && selectedBlock?.type === 'drawing' && selectedBlock.symbolId === undefined) setDrawingRef(selection);
  }

  function pickSymbol(symbol: SchematicSymbol) {
    if (!symbolLibrary) return;
    if (symbolLibrary.kind === 'change') {
      const { ref } = symbolLibrary;
      edit((t) => updateBlock(t, ref, { symbolId: symbol.id, shapes: undefined }));
    } else {
      const present = historyRef.current.present;
      const groupId = activeGroupId ?? present.groups[0]?.id;
      if (symbolLibrary.inGroup && groupId === undefined) return;
      const at = symbolLibrary.inGroup ? { x: 0, y: 0 } : { x: snapToGrid(view.x + view.w / 2 - symbol.widthMm / 2, grid), y: snapToGrid(view.y + view.h / 2 - symbol.heightMm / 2, grid) };
      const result = addSymbolBlock(present, symbol, { groupId: symbolLibrary.inGroup ? groupId : undefined, at });
      if (!result) return;
      applyHistory(commit(historyRef.current, result.template));
      selectBlock(result.ref);
    }
    setSymbolLibrary(null);
  }

  function detachSelectedSymbol() {
    const symbol = selectedBlock?.symbolId !== undefined ? symbols.find((s) => s.id === selectedBlock.symbolId) : undefined;
    if (selection && symbol) edit((t) => detachBlockSymbol(t, selection, symbol));
  }

  function deleteSelected() {
    if (!selectedBlock || !selection) return;
    edit((t) => removeBlock(t, selection));
    selectBlock(null);
  }

  function duplicateSelected() {
    if (!selectedBlock || !selection) return;
    const result = duplicateBlock(historyRef.current.present, selection, 4);
    if (!result) return;
    applyHistory(commit(historyRef.current, result.template));
    selectBlock(result.ref);
  }

  function nudgeSelected(dx: number, dy: number) {
    if (!selectedBlock || !selection) return;
    edit((t) => updateBlock(t, selection, { x: selectedBlock.x + dx, y: selectedBlock.y + dy }));
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const tag = (event.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === 'z') {
      event.preventDefault();
      applyHistory(event.shiftKey ? redo(historyRef.current) : undo(historyRef.current));
    } else if (mod && key === 'y') {
      event.preventDefault();
      applyHistory(redo(historyRef.current));
    } else if (mod && key === 'd') {
      event.preventDefault();
      duplicateSelected();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!selectedBlock) return;
      event.preventDefault();
      deleteSelected();
    } else if (event.key.startsWith('Arrow') && selectedBlock) {
      event.preventDefault();
      const step = (grid > 0 ? grid : 1) * (event.shiftKey ? 10 : 1);
      nudgeSelected(event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
    }
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    event.preventDefault();
    rootRef.current?.focus({ preventScroll: true });
    const pointer = clientToSheet(event.clientX, event.clientY);
    if (event.button === 1 || !pointer) {
      startPan(event);
      return;
    }
    if (event.button !== 0) return;
    const target = event.target as Element;
    const handle = target.closest('[data-handle]')?.getAttribute('data-handle');
    const hitId = target.closest('[data-hit-block]')?.getAttribute('data-hit-block');
    const base = { pointerId: event.pointerId, startClient: { x: event.clientX, y: event.clientY }, start: pointer, moved: false };

    if (handle === 'anchor') {
      gestureRef.current = { ...base, kind: 'anchor', anchor: { ...template.groupAnchor } };
    } else if ((handle === 'rotate' || handle === 'resize') && selection && selectedBlock && handleInstance) {
      gestureRef.current =
        handle === 'rotate'
          ? { ...base, kind: 'rotate', ref: selection, center: { x: handleInstance.x + handleInstance.width / 2, y: handleInstance.y + handleInstance.height / 2 } }
          : { ...base, kind: 'resize', ref: selection, blockX: selectedBlock.x, blockY: selectedBlock.y, width: handleInstance.width, height: handleInstance.height, rotation: handleInstance.rotation };
    } else if (hitId) {
      const hit = generated.blocks.find((b) => b.id === hitId);
      const ref: BlockRef | undefined = hit ? { blockId: hit.templateBlockId, groupId: hit.groupId } : undefined;
      const block = ref ? findBlock(template, ref) : undefined;
      if (!hit || !ref || !block) return;
      selectBlock(ref, hit.id);
      gestureRef.current = { ...base, kind: 'move', ref, blockX: block.x, blockY: block.y };
    } else {
      startPan(event);
      panClickRef.current = { x: event.clientX, y: event.clientY };
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
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
      const x = snapToGrid(gesture.blockX + dx, snap);
      const y = snapToGrid(gesture.blockY + dy, snap);
      edit((t) => updateBlock(t, gesture.ref, { x, y }), `move:${gesture.ref.groupId ?? '-'}:${gesture.ref.blockId}`);
    } else if (gesture.kind === 'rotate') {
      const rotation = rotationFromPointer(gesture.center, pointer, event.shiftKey ? undefined : 5);
      edit((t) => updateBlock(t, gesture.ref, { rotation }), `rotate:${gesture.ref.groupId ?? '-'}:${gesture.ref.blockId}`);
    } else if (gesture.kind === 'resize') {
      const local = toBlockAxes(dx, dy, gesture.rotation);
      const width = Math.max(1, snapToGrid(gesture.width + local.x, snap));
      const height = Math.max(1, snapToGrid(gesture.height + local.y, snap));
      const position = resizeKeepingCorner({ x: gesture.blockX, y: gesture.blockY, rotation: gesture.rotation }, { width: gesture.width, height: gesture.height }, { width, height });
      edit((t) => updateBlock(t, gesture.ref, { width, height, ...position }), `resize:${gesture.ref.groupId ?? '-'}:${gesture.ref.blockId}`);
    } else {
      const groupAnchor = { x: snapToGrid(gesture.anchor.x + dx, snap), y: snapToGrid(gesture.anchor.y + dy, snap) };
      edit((t) => ({ ...t, groupAnchor }), 'anchor');
    }
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    gestureRef.current = null;
    endPan();
    endGesture();
    const click = panClickRef.current;
    panClickRef.current = null;
    if (click && event.type === 'pointerup' && Math.hypot(event.clientX - click.x, event.clientY - click.y) < MOVE_THRESHOLD_PX + 1) selectBlock(null);
  }

  function zoomToGroup() {
    const first = generated.blocks.find((b) => b.groupId === activeGroupId);
    if (!first) return;
    const bounds = getBlocksBounds(generated.blocks.filter((b) => b.groupId === activeGroupId && b.circuitId === first.circuitId));
    if (bounds) zoomTo(bounds);
  }

  const px = mmPerPixel;
  const activeGroup = activeGroupId ? template.groups.find((g) => g.id === activeGroupId) : undefined;
  const listedBlocks: { ref: BlockRef; type: SchematicBlockType }[] = [
    ...template.layoutBlocks.map((b) => ({ ref: { blockId: b.id } as BlockRef, type: b.type })),
    ...(activeGroup ? activeGroup.blocks.map((b) => ({ ref: { blockId: b.id, groupId: activeGroup.id } as BlockRef, type: b.type })) : []),
  ];
  const canAddCircuitBlock = template.groups.length > 0;

  if (drawingRef && drawingBlock) {
    return (
      <SchematicDrawingEditor
        key={`${drawingRef.groupId ?? '-'}/${drawingRef.blockId}`}
        title={`Drawing · ${drawingRef.blockId}${drawingRef.groupId !== undefined ? ' (each circuit)' : ''}`}
        shapes={drawingBlock.shapes ?? []}
        widthMm={getBlockWidth(drawingBlock)}
        heightMm={getBlockHeight(drawingBlock)}
        onDone={finishDrawing}
        onCancel={() => setDrawingRef(null)}
      />
    );
  }

  if (symbolLibrary) {
    return <SchematicSymbolLibrary symbols={symbols} onChange={onSymbolsChange} usesOf={symbolUses} onPick={pickSymbol} onClose={() => setSymbolLibrary(null)} />;
  }

  return (
    <div className="mep-schematic mep-schematic-editor" ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="mep-schematic-bar">
        <button type="button" onClick={onDone}>
          Back to schematic
        </button>
        <button type="button" onClick={() => applyHistory(undo(historyRef.current))} disabled={history.past.length === 0} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button type="button" onClick={() => applyHistory(redo(historyRef.current))} disabled={history.future.length === 0} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
        <label>
          Grid
          <select value={grid} onChange={(e) => setGrid(Number(e.target.value))} title="Blocks snap to this grid. Hold Alt while dragging to turn it off.">
            {GRID_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g === 0 ? 'Off' : `${g} mm`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Preview data
          <select value={previewPanel ? previewPanel.id : SAMPLE} onChange={(e) => setPreviewSource(e.target.value)}>
            <option value={SAMPLE}>Sample data</option>
            {panels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={fit}>
          Fit to sheet
        </button>
        <button type="button" onClick={zoomToGroup} disabled={!activeGroupId || !generated.blocks.some((b) => b.groupId === activeGroupId)} title="Zoom to the first circuit drawn by the selected group">
          Zoom to group
        </button>
        <span className="mep-schematic-hint">Scroll to zoom, drag empty space to pan.</span>
      </div>

      <div className="mep-schematic-editor-body">
        <aside className="mep-schematic-side">
          <div className="mep-section">
            <h4>Add block</h4>
            {PALETTE_SCOPES.map(({ scope, label }) => (
              <div key={scope} className="mep-schematic-palette-group">
                <span className="mep-schematic-palette-heading">{label}</span>
                {(Object.keys(SCHEMATIC_BLOCK_CATALOGUE) as SchematicBlockType[])
                  .filter((type) => SCHEMATIC_BLOCK_CATALOGUE[type].scope === scope)
                  .map((type) => {
                    const disabled = scope === 'circuit' && !canAddCircuitBlock;
                    return (
                      <button key={type} type="button" className="mep-schematic-palette-button" disabled={disabled} title={disabled ? 'Add a group first: circuit blocks belong to a group.' : `Add: ${SCHEMATIC_BLOCK_CATALOGUE[type].label}`} onClick={() => (type === 'drawing' ? addDrawing(false) : addFromPalette(type))}>
                        {SCHEMATIC_BLOCK_CATALOGUE[type].label}
                      </button>
                    );
                  })}
                {scope === 'once' && (
                  <button type="button" className="mep-schematic-palette-button" title="Place a symbol from the library on the sheet" onClick={() => setSymbolLibrary({ kind: 'add', inGroup: false })}>
                    Symbol…
                  </button>
                )}
                {scope === 'circuit' && (
                  <button type="button" className="mep-schematic-palette-button" disabled={!canAddCircuitBlock} title={canAddCircuitBlock ? 'Add a drawing that repeats for every circuit of the selected group' : 'Add a group first: circuit blocks belong to a group.'} onClick={() => addDrawing(true)}>
                    Drawing (each circuit)
                  </button>
                )}
                {scope === 'circuit' && (
                  <button type="button" className="mep-schematic-palette-button" disabled={!canAddCircuitBlock} title={canAddCircuitBlock ? 'Add a library symbol that repeats for every circuit of the selected group' : 'Add a group first: circuit blocks belong to a group.'} onClick={() => setSymbolLibrary({ kind: 'add', inGroup: true })}>
                    Symbol (each circuit)…
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="mep-section">
            <h4>Groups</h4>
            <ul className="mep-schematic-list">
              {template.groups.map((group) => (
                <li key={group.id}>
                  <button type="button" className={group.id === activeGroupId ? 'on' : undefined} onClick={() => selectGroup(group.id)}>
                    <b>{group.name}</b>
                    <span>{describeRule(group.rule)}</span>
                  </button>
                </li>
              ))}
              {template.groups.length === 0 && <li className="mep-schematic-hint">No groups. Circuits are not drawn until you add one.</li>}
            </ul>
            <div className="mep-schematic-buttons">
              <button
                type="button"
                onClick={() => {
                  const result = addGroup(historyRef.current.present);
                  applyHistory(commit(historyRef.current, result.template));
                  selectGroup(result.groupId);
                }}
              >
                Add group
              </button>
              <button type="button" disabled={!activeGroupId} title="Move up: it is checked earlier" onClick={() => activeGroupId && edit((t) => reorderGroup(t, activeGroupId, -1))}>
                ↑
              </button>
              <button type="button" disabled={!activeGroupId} title="Move down: it is checked later" onClick={() => activeGroupId && edit((t) => reorderGroup(t, activeGroupId, 1))}>
                ↓
              </button>
              <button
                type="button"
                disabled={!activeGroupId}
                title="Duplicate the group and its blocks"
                onClick={() => {
                  const result = activeGroupId ? duplicateGroup(historyRef.current.present, activeGroupId) : undefined;
                  if (!result) return;
                  applyHistory(commit(historyRef.current, result.template));
                  selectGroup(result.groupId);
                }}
              >
                Duplicate
              </button>
              <button
                type="button"
                disabled={!activeGroupId}
                title="Delete the group and its blocks"
                onClick={() => {
                  if (!activeGroupId) return;
                  edit((t) => removeGroup(t, activeGroupId));
                  selectGroup(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>

          <div className="mep-section">
            <h4>Blocks</h4>
            <ul className="mep-schematic-list">
              {listedBlocks.map(({ ref, type }) => {
                const selected = sameRef(selection, ref);
                return (
                  <li key={`${ref.groupId ?? '-'}/${ref.blockId}`} className="mep-schematic-list-row">
                    <button type="button" className={selected ? 'on' : undefined} onClick={() => selectBlock(ref)}>
                      {type} · {ref.blockId}
                      {ref.groupId === undefined ? '' : ' (group)'}
                    </button>
                    {selected && (
                      <span className="mep-schematic-list-tools">
                        <button type="button" title="Draw earlier (further back)" onClick={() => edit((t) => reorderBlock(t, ref, -1))}>
                          ↑
                        </button>
                        <button type="button" title="Draw later (in front)" onClick={() => edit((t) => reorderBlock(t, ref, 1))}>
                          ↓
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {!activeGroup && template.groups.length > 0 && <p className="mep-schematic-hint">Select a group to list its blocks.</p>}
          </div>
        </aside>

        <div className="mep-schematic-stage">
          <svg
            ref={setSvg}
            className="mep-schematic-canvas"
            role="img"
            aria-label={`Editing template ${template.name}`}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={openSelectedDrawing}
          >
            <rect x={0} y={0} width={template.sheet.widthMm} height={template.sheet.heightMm} fill="#ffffff" stroke="#9aa3ad" strokeWidth={0.4} />
            <g pointerEvents="none">
              {generated.blocks.map((block) => (
                <g key={block.id} opacity={activeGroupId && block.groupId !== undefined && block.groupId !== activeGroupId ? 0.3 : 1}>
                  <SchematicBlockSvg block={block} loadShapes={block.type === 'loadSymbol' ? loadShapesFor(block.loadStampDefinitionId) : undefined} symbolShapes={block.type === 'drawing' ? symbolShapesFor(block.symbolId) : undefined} showEmptyDrawings />
                </g>
              ))}
            </g>

            <g>
              {generated.blocks.map((block) => {
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

            {handleInstance && (
              <g transform={`translate(${handleInstance.x} ${handleInstance.y}) rotate(${handleInstance.rotation} ${handleInstance.width / 2} ${handleInstance.height / 2})`}>
                <line x1={handleInstance.width / 2} y1={0} x2={handleInstance.width / 2} y2={-px * 16} stroke={ACCENT} strokeWidth={px} pointerEvents="none" />
                <circle data-handle="rotate" cx={handleInstance.width / 2} cy={-px * 16} r={px * 5} fill="#ffffff" stroke={ACCENT} strokeWidth={px * 1.5} cursor="grab" />
                <rect data-handle="resize" x={handleInstance.width - px * 4} y={handleInstance.height - px * 4} width={px * 8} height={px * 8} fill="#ffffff" stroke={ACCENT} strokeWidth={px * 1.5} cursor="nwse-resize" />
              </g>
            )}

            <g data-handle="anchor" cursor="move">
              <circle cx={template.groupAnchor.x} cy={template.groupAnchor.y} r={px * 9} fill="transparent" pointerEvents="all" />
              <g pointerEvents="none" stroke={ACCENT} strokeWidth={px * 1.5}>
                <line x1={template.groupAnchor.x - px * 8} y1={template.groupAnchor.y} x2={template.groupAnchor.x + px * 8} y2={template.groupAnchor.y} />
                <line x1={template.groupAnchor.x} y1={template.groupAnchor.y - px * 8} x2={template.groupAnchor.x} y2={template.groupAnchor.y + px * 8} />
                <circle cx={template.groupAnchor.x} cy={template.groupAnchor.y} r={px * 4} fill="none" />
                <text x={template.groupAnchor.x + px * 10} y={template.groupAnchor.y - px * 6} fontSize={px * 11} fill={ACCENT} stroke="none" fontFamily="Arial, Helvetica, sans-serif">
                  Group anchor
                </text>
              </g>
            </g>
          </svg>
        </div>

        <aside className="mep-schematic-side mep-schematic-side--right">
          <SchematicTemplateProperties
            template={template}
            edit={edit}
            endGesture={endGesture}
            selection={selectedBlock ? selection : null}
            activeGroupId={activeGroupId}
            circuitTypes={circuitTypes}
            loadTypes={loadTypes}
            notes={notes}
            onDuplicateBlock={duplicateSelected}
            onDeleteBlock={deleteSelected}
            onEditDrawing={openSelectedDrawing}
            symbols={symbols}
            onChangeSymbol={() => selection && setSymbolLibrary({ kind: 'change', ref: selection })}
            onDetachSymbol={detachSelectedSymbol}
          />
        </aside>
      </div>
    </div>
  );
}
