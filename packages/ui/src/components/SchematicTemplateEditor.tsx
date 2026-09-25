import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  SCHEMATIC_BLOCK_CATALOGUE,
  addBlock,
  addGroup,
  addSymbolBlock,
  setBlockSymbol,
  buildSampleSchematicInput,
  describeRule,
  detachBlockSymbol,
  duplicateBlock,
  duplicateGroup,
  findBlock,
  generateSchematic,
  todayIso,
  getBlockHeight,
  getBlockWidth,
  getBlocksBounds,
  getStampDefinition,
  removeBlock,
  removeGroup,
  reorderBlock,
  reorderGroup,
  snapToGrid,
  updateBlock,
  validateSchematicTemplate,
  type BlockRef,
  type Circuit,
  type CircuitType,
  type Panel,
  type PanelSection,
  type SchematicBlockScope,
  type SchematicBlockType,
  type SchematicInput,
  type SchematicSymbol,
  type SchematicTemplate,
  type StampDefinition,
  type SymbolShape,
} from '@mepapp/core';
import type { StampInfo } from '@mepapp/render';
import { describeDiagnostics } from '../schematicDiagnostics.js';
import { buildSchematicTerminals } from '../schematicTerminals.js';
import { commit, createHistory, endGesture as endHistoryGesture, redo, undo, type History } from '../templateHistory.js';
import { firstCircuitOrigin, roundMm, textBlockSize, type DrawnItem } from '../sheetDraw.js';
import { useSheetDraw } from '../useSheetDraw.js';
import { useSheetView } from '../useSheetView.js';
import { SchematicDrawingEditor } from './SchematicDrawingEditor.js';
import { SheetBlockCanvas } from './SheetBlockCanvas.js';
import { SheetDrawTools } from './SheetDrawTools.js';
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
  /** Values of the fields shared by every schematic, so the preview shows realistic text. The editor never stores them. */
  projectFieldValues?: Record<string, string>;
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
const sameRef = (a: BlockRef | null, b: BlockRef | null) => a !== null && b !== null && a.blockId === b.blockId && a.groupId === b.groupId;

export function SchematicTemplateEditor({ initialTemplate, onChange, panels, circuits, panelSections, circuitTypes, stamps, customStampDefinitions, symbols, onSymbolsChange, symbolUses, projectFieldValues, initialPanelId, onDone }: SchematicTemplateEditorProps) {
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
  const [symbolLibrary, setSymbolLibrary] = useState<{ kind: 'add'; inGroup: boolean } | { kind: 'change'; ref: BlockRef } | { kind: 'draw' } | null>(null);
  /** Where a shape drawn on the sheet goes: the sheet, or a group id (repeats on every circuit). */
  const [drawTarget, setDrawTarget] = useState<string>('sheet');
  const drawingOpenRef = useRef(false);
  const [previewSource, setPreviewSource] = useState<string>(() => (circuits.some((c) => c.panelId === initialPanelId) ? initialPanelId : SAMPLE));

  const rootRef = useRef<HTMLDivElement>(null);

  const sheetView = useSheetView({
    sheetWidthMm: template.sheet.widthMm,
    sheetHeightMm: template.sheet.heightMm,
    resetKey: `${template.id}:${template.sheet.widthMm}x${template.sheet.heightMm}`,
  });
  const { view, fit, zoomTo } = sheetView;

  const activeGroupId = activeGroupState !== null && template.groups.some((g) => g.id === activeGroupState) ? activeGroupState : null;
  const selectedBlock = selection ? findBlock(template, selection) : undefined;
  const selectionRef = useRef<BlockRef | null>(null);
  const drawEscapeRef = useRef<() => boolean>(() => false);
  selectionRef.current = selectedBlock ? selection : null;
  const drawingBlock = drawingRef ? findBlock(template, drawingRef) : undefined;
  drawingOpenRef.current = drawingBlock !== undefined || symbolLibrary !== null;

  const terminals = useMemo(() => buildSchematicTerminals(stamps, customStampDefinitions), [stamps, customStampDefinitions]);
  const previewPanel = previewSource === SAMPLE ? undefined : panels.find((p) => p.id === previewSource);
  const input: SchematicInput = useMemo(
    () => (previewPanel ? { panel: previewPanel, circuits, sections: panelSections, terminals, circuitTypes } : buildSampleSchematicInput(template, circuitTypes)),
    [previewPanel, circuits, panelSections, terminals, circuitTypes, template],
  );
  const today = useMemo(() => todayIso(), []);
  const generated = useMemo(() => generateSchematic(input, template, { fieldSources: { projectValues: projectFieldValues, today } }), [input, template, projectFieldValues, today]);
  const notes = useMemo(() => [...validateSchematicTemplate(template), ...describeDiagnostics(generated.diagnostics, input.circuits, input.panel)], [template, generated, input]);
  const groupOriginOf = (groupId: string) => firstCircuitOrigin(template, input, generated, groupId);
  const loadTypes = useMemo(() => [...new Set(Object.values(input.terminals).map((t) => t.loadType).filter((t): t is string => t !== undefined))], [input]);

  useEffect(() => {
    // Dialog listens for Escape on the document; a capture listener on the window runs first and keeps a block selection from closing the dialog.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || drawingOpenRef.current) return;
      if (drawEscapeRef.current()) {
        event.stopPropagation();
        return;
      }
      if (!selectionRef.current) return;
      event.stopPropagation();
      setSelection(null);
      setInstanceId(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

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

  function onDrawFinish(item: DrawnItem) {
    const present = historyRef.current.present;
    const groupId = drawTarget !== 'sheet' && present.groups.some((g) => g.id === drawTarget) ? drawTarget : undefined;
    const origin = groupId === undefined ? { x: 0, y: 0 } : groupOriginOf(groupId);
    if (!origin) return;
    let next: { template: SchematicTemplate; ref: BlockRef } | undefined;
    if (item.kind === 'shape') {
      const added = addBlock(present, 'drawing', { groupId });
      if (!added) return;
      next = { ref: added.ref, template: updateBlock(added.template, added.ref, { x: roundMm(item.box.x - origin.x), y: roundMm(item.box.y - origin.y), width: roundMm(item.box.width), height: roundMm(item.box.height), shapes: [item.shape] }) };
    } else if (item.kind === 'text') {
      const added = addBlock(present, groupId === undefined ? 'freeItem' : 'customAnnotation', { groupId });
      if (!added) return;
      const size = textBlockSize(item.text);
      next = { ref: added.ref, template: updateBlock(added.template, added.ref, { x: roundMm(item.at.x - origin.x), y: roundMm(item.at.y - origin.y), width: size.width, height: size.height, binding: item.text }) };
    } else {
      next = addSymbolBlock(present, item.symbol, { groupId, at: { x: roundMm(item.at.x - origin.x), y: roundMm(item.at.y - origin.y) } });
    }
    if (!next) return;
    applyHistory(commit(historyRef.current, next.template));
    selectBlock(next.ref);
  }

  const draw = useSheetDraw({ sheet: template.sheet, grid, onFinish: onDrawFinish });
  drawEscapeRef.current = draw.escape;
  const drawTargetValid = drawTarget === 'sheet' || (template.groups.some((g) => g.id === drawTarget) && groupOriginOf(drawTarget) !== undefined);

  function finishDrawing(shapes: SymbolShape[]) {
    if (drawingRef) edit((t) => updateBlock(t, drawingRef, { shapes }));
    setDrawingRef(null);
  }

  function openSelectedDrawing() {
    if (selection && selectedBlock?.type === 'drawing' && selectedBlock.symbolId === undefined) setDrawingRef(selection);
  }

  function pickSymbol(symbol: SchematicSymbol) {
    if (!symbolLibrary) return;
    if (symbolLibrary.kind === 'draw') {
      draw.setSymbol(symbol);
      draw.setTool('symbol');
    } else if (symbolLibrary.kind === 'change') {
      const { ref } = symbolLibrary;
      edit((t) => setBlockSymbol(t, ref, symbol));
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
    if (draw.keyDown(event)) {
      event.preventDefault();
      return;
    }
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

  function zoomToGroup() {
    const first = generated.blocks.find((b) => b.groupId === activeGroupId);
    if (!first) return;
    const bounds = getBlocksBounds(generated.blocks.filter((b) => b.groupId === activeGroupId && b.circuitId === first.circuitId));
    if (bounds) zoomTo(bounds);
  }

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

      <SheetDrawTools draw={draw} onChooseSymbol={() => setSymbolLibrary({ kind: 'draw' })}>
        <label>
          Add to
          <select value={drawTargetValid ? drawTarget : 'sheet'} onChange={(e) => setDrawTarget(e.target.value)} title="Where a drawn shape, text or symbol goes">
            <option value="sheet">Sheet</option>
            {template.groups.map((group) => (
              <option key={group.id} value={group.id} disabled={groupOriginOf(group.id) === undefined} title={groupOriginOf(group.id) === undefined ? 'This group draws no circuit in the preview data' : undefined}>
                {group.name} (repeats on every circuit)
              </option>
            ))}
          </select>
        </label>
      </SheetDrawTools>

      <div className="mep-schematic-editor-body">
        <aside className="mep-schematic-side">
          <div className="mep-section">
            <h4>Add block</h4>
            {PALETTE_SCOPES.map(({ scope, label }) => (
              <div key={scope} className="mep-schematic-palette-group">
                <span className="mep-schematic-palette-heading">{label}</span>
                {(Object.keys(SCHEMATIC_BLOCK_CATALOGUE) as SchematicBlockType[])
                  .filter((type) => SCHEMATIC_BLOCK_CATALOGUE[type].scope === scope && type !== 'drawing')
                  .map((type) => {
                    const disabled = scope === 'circuit' && !canAddCircuitBlock;
                    return (
                      <button key={type} type="button" className="mep-schematic-palette-button" disabled={disabled} title={disabled ? 'Add a group first: circuit blocks belong to a group.' : `Add: ${SCHEMATIC_BLOCK_CATALOGUE[type].label}`} onClick={() => addFromPalette(type)}>
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
          <SheetBlockCanvas<BlockRef>
            ariaLabel={`Editing template ${template.name}`}
            sheetWidthMm={template.sheet.widthMm}
            sheetHeightMm={template.sheet.heightMm}
            sheetView={sheetView}
            blocks={generated.blocks}
            grid={grid}
            dimGroupId={activeGroupId}
            showEmptyDrawings
            loadShapesFor={loadShapesFor}
            symbolShapesFor={symbolShapesFor}
            targetOf={(block) => ({ blockId: block.templateBlockId, groupId: block.groupId })}
            sameTarget={(a, b) => sameRef(a, b)}
            targetKey={(ref) => `${ref.groupId ?? '-'}:${ref.blockId}`}
            selected={selectedBlock ? selection : null}
            instanceId={instanceId}
            onSelect={selectBlock}
            readOrigin={(ref) => {
              const block = findBlock(historyRef.current.present, ref);
              return block ? { x: block.x, y: block.y } : undefined;
            }}
            onMove={(ref, x, y, key) => edit((t) => updateBlock(t, ref, { x, y }), key)}
            onRotate={(ref, rotation, key) => edit((t) => updateBlock(t, ref, { rotation }), key)}
            onResize={(ref, patch, key) => edit((t) => updateBlock(t, ref, patch), key)}
            onGestureEnd={endGesture}
            anchor={{ x: template.groupAnchor.x, y: template.groupAnchor.y, label: 'Group anchor', onMove: (x, y, key) => edit((t) => ({ ...t, groupAnchor: { x, y } }), key) }}
            draw={draw.pointer}
            overlay={draw.overlay}
            onDoubleClick={openSelectedDrawing}
            onFocusRequest={() => rootRef.current?.focus({ preventScroll: true })}
          />
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
