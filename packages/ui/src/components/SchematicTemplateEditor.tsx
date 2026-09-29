import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
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
import { SheetToolOptions, SheetToolRail, SheetViewBar, contentBounds, sheetStatusText } from './SheetDrawTools.js';
import { IconRedo, IconUndo } from '../icons.js';
import { SchematicSymbolLibrary } from './SchematicSymbolLibrary.js';
import { SchematicTemplateProperties, type EditTemplate, type TemplatePanelTab } from './SchematicTemplateProperties.js';
import { BLOCK_DRAG_TYPE, TemplateOutlinePanel } from './TemplateOutlinePanel.js';
import { groupRepeatBoxes, repeatAtPoint } from '../templateOutline.js';

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
  /** Reports whether a drawing block or the symbol library is open in place of the editor, so the caller's own close button can wait for it to finish. */
  onSubviewOpenChange?: (open: boolean) => void;
}

const SAMPLE = 'sample';
const GRID_OPTIONS = [0, 0.5, 1, 2, 5];
const ACCENT = '#175a8a';
const sameRef = (a: BlockRef | null, b: BlockRef | null) => a !== null && b !== null && a.blockId === b.blockId && a.groupId === b.groupId;

export function SchematicTemplateEditor({ initialTemplate, onChange, panels, circuits, panelSections, circuitTypes, stamps, customStampDefinitions, symbols, onSymbolsChange, symbolUses, projectFieldValues, initialPanelId, onSubviewOpenChange }: SchematicTemplateEditorProps) {
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

  const [selection, setSelection] = useState<BlockRef[]>([]);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [activeGroupState, setActiveGroupState] = useState<string | null>(null);
  const [grid, setGrid] = useState(1);
  const [drawingRef, setDrawingRef] = useState<BlockRef | null>(null);
  /** The symbol library is open in place of the editor: to pick the Symbol tool's symbol, or to change the symbol of a block. */
  const [symbolLibrary, setSymbolLibrary] = useState<{ kind: 'change'; ref: BlockRef } | { kind: 'draw' } | null>(null);
  const [rightTab, setRightTab] = useState<TemplatePanelTab>('properties');
  /** Where a shape drawn on the sheet goes: the sheet, or a group id (repeats on every circuit). */
  const [drawTarget, setDrawTarget] = useState<string>('sheet');
  const drawingOpenRef = useRef(false);
  const [previewSource, setPreviewSource] = useState<string>(() => (circuits.some((c) => c.panelId === initialPanelId) ? initialPanelId : SAMPLE));
  const [dropNotice, setDropNotice] = useState<string | null>(null);
  const dropNoticeTimer = useRef<number | undefined>(undefined);

  const rootRef = useRef<HTMLDivElement>(null);

  const sheetView = useSheetView({
    sheetWidthMm: template.sheet.widthMm,
    sheetHeightMm: template.sheet.heightMm,
    resetKey: `${template.id}:${template.sheet.widthMm}x${template.sheet.heightMm}`,
  });
  const { view, zoomTo } = sheetView;

  const activeGroupId = activeGroupState !== null && template.groups.some((g) => g.id === activeGroupState) ? activeGroupState : null;
  /** `selection`, but with refs to blocks that no longer exist dropped. */
  const liveSelection = selection.filter((ref) => findBlock(template, ref) !== undefined);
  const singleSelection = liveSelection.length === 1 ? liveSelection[0] : undefined;
  const selectedBlock = singleSelection ? findBlock(template, singleSelection) : undefined;
  const selectionRef = useRef<BlockRef[]>([]);
  const drawEscapeRef = useRef<() => boolean>(() => false);
  selectionRef.current = liveSelection;
  const activeGroupRef = useRef<string | null>(null);
  activeGroupRef.current = activeGroupId;
  const drawingBlock = drawingRef ? findBlock(template, drawingRef) : undefined;
  const templateSubviewOpen = drawingBlock !== undefined || symbolLibrary !== null;
  drawingOpenRef.current = templateSubviewOpen;
  const onSubviewOpenChangeRef = useRef(onSubviewOpenChange);
  onSubviewOpenChangeRef.current = onSubviewOpenChange;
  useEffect(() => {
    onSubviewOpenChangeRef.current?.(templateSubviewOpen);
    return () => onSubviewOpenChangeRef.current?.(false);
  }, [templateSubviewOpen]);

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

  useEffect(() => () => window.clearTimeout(dropNoticeTimer.current), []);

  useEffect(() => {
    // Dialog listens for Escape on the document; a capture listener on the window runs first and keeps a block selection from closing the dialog.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || drawingOpenRef.current) return;
      if (drawEscapeRef.current()) {
        event.stopPropagation();
        return;
      }
      if (selectionRef.current.length > 0) {
        event.stopPropagation();
        setSelection([]);
        setInstanceId(null);
      } else if (activeGroupRef.current) {
        event.stopPropagation();
        setActiveGroupState(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const loadShapesFor = (definitionId: string | undefined) => (definitionId ? getStampDefinition(definitionId, customStampDefinitions)?.shapes : undefined);
  const symbolShapesFor = (symbolId: string | undefined) => (symbolId ? symbols.find((s) => s.id === symbolId)?.shapes : undefined);

  function selectBlocks(refs: BlockRef[], instance: string | null = null) {
    setSelection(refs);
    setInstanceId(instance);
    if (refs.length === 1 && refs[0].groupId) setActiveGroupState(refs[0].groupId);
    if (refs.length > 0) setRightTab('properties');
  }

  function selectBlock(ref: BlockRef | null, instance: string | null = null) {
    selectBlocks(ref ? [ref] : [], instance);
  }

  function selectGroup(groupId: string | null) {
    setActiveGroupState(groupId);
    setSelection([]);
    setInstanceId(null);
    if (groupId) setRightTab('properties');
  }

  function showDropNotice(message: string) {
    setDropNotice(message);
    window.clearTimeout(dropNoticeTimer.current);
    dropNoticeTimer.current = window.setTimeout(() => setDropNotice(null), 4500);
  }

  /** Adds a palette block: at the middle of the view, or where it was dropped on the sheet. */
  function addFromPalette(type: SchematicBlockType, drop?: { x: number; y: number }) {
    const info = SCHEMATIC_BLOCK_CATALOGUE[type];
    const present = historyRef.current.present;
    const centre = drop ?? { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    let result: ReturnType<typeof addBlock>;
    if (info.scope === 'circuit') {
      const hit = drop ? repeatAtPoint(generated.blocks, generated.circuitOrigins, drop) : undefined;
      const groupId = hit?.groupId ?? activeGroupId ?? present.groups[0]?.id;
      if (groupId === undefined) return;
      const groupOrigin = groupOriginOf(groupId);
      const origin = hit?.origin ?? (drop ? groupOrigin : undefined);
      const at = drop && origin ? { x: snapToGrid(drop.x - origin.x - info.width / 2, grid), y: snapToGrid(drop.y - origin.y - info.height / 2, grid) } : undefined;
      result = addBlock(present, type, { groupId, at });
      if (result && groupOrigin === undefined) {
        const group = present.groups.find((g) => g.id === groupId);
        showDropNotice(`Added to "${group?.name ?? groupId}" — not shown here, because the current preview has no circuit in that group yet.`);
      }
    } else {
      const at = info.scope === 'section' ? { x: 0, y: 0 } : { x: snapToGrid(centre.x - info.width / 2, grid), y: snapToGrid(centre.y - info.height / 2, grid) };
      result = addBlock(present, type, { at });
    }
    if (!result) return;
    applyHistory(commit(historyRef.current, result.template));
    selectBlock(result.ref);
  }

  function onDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes(BLOCK_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function onDrop(event: ReactDragEvent<HTMLDivElement>) {
    const type = event.dataTransfer.getData(BLOCK_DRAG_TYPE) as SchematicBlockType;
    if (!type || !(type in SCHEMATIC_BLOCK_CATALOGUE)) return;
    event.preventDefault();
    const point = sheetView.clientToSheet(event.clientX, event.clientY);
    if (!point) return;
    addFromPalette(type, point);
    rootRef.current?.focus({ preventScroll: true });
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

  const draw = useSheetDraw({
    sheet: template.sheet,
    grid,
    onFinish: onDrawFinish,
    shortcutsEnabled: drawingBlock === undefined && symbolLibrary === null,
    onChooseSymbol: () => setSymbolLibrary({ kind: 'draw' }),
  });
  drawEscapeRef.current = draw.escape;
  const drawTargetValid = drawTarget === 'sheet' || (template.groups.some((g) => g.id === drawTarget) && groupOriginOf(drawTarget) !== undefined);

  function finishDrawing(shapes: SymbolShape[]) {
    if (drawingRef) edit((t) => updateBlock(t, drawingRef, { shapes }));
    setDrawingRef(null);
  }

  function openSelectedDrawing() {
    if (singleSelection && selectedBlock?.type === 'drawing' && selectedBlock.symbolId === undefined) setDrawingRef(singleSelection);
  }

  function pickSymbol(symbol: SchematicSymbol) {
    if (!symbolLibrary) return;
    if (symbolLibrary.kind === 'draw') {
      draw.setSymbol(symbol);
      draw.setTool('symbol');
    } else {
      const { ref } = symbolLibrary;
      edit((t) => setBlockSymbol(t, ref, symbol));
    }
    setSymbolLibrary(null);
  }

  function detachSelectedSymbol() {
    const symbol = selectedBlock?.symbolId !== undefined ? symbols.find((s) => s.id === selectedBlock.symbolId) : undefined;
    if (singleSelection && symbol) edit((t) => detachBlockSymbol(t, singleSelection, symbol));
  }

  function deleteSelected() {
    if (liveSelection.length === 0) return;
    edit((t) => liveSelection.reduce((acc, ref) => removeBlock(acc, ref), t));
    selectBlocks([]);
  }

  function duplicateSelected() {
    if (liveSelection.length === 0) return;
    let next = historyRef.current.present;
    const newRefs: BlockRef[] = [];
    for (const ref of liveSelection) {
      const result = duplicateBlock(next, ref, 4);
      if (!result) continue;
      next = result.template;
      newRefs.push(result.ref);
    }
    if (newRefs.length === 0) return;
    applyHistory(commit(historyRef.current, next));
    selectBlocks(newRefs);
  }

  function nudgeSelected(dx: number, dy: number) {
    if (liveSelection.length === 0) return;
    edit((t) => liveSelection.reduce((acc, ref) => {
      const block = findBlock(acc, ref);
      return block ? updateBlock(acc, ref, { x: block.x + dx, y: block.y + dy }) : acc;
    }, t));
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const tag = (event.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (draw.keyDown(event)) {
      event.preventDefault();
      return;
    }
    editKeyDown(event);
  }

  function editKeyDown(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'preventDefault'>) {
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
      if (liveSelection.length === 0) return;
      event.preventDefault();
      deleteSelected();
    } else if (event.key.startsWith('Arrow') && liveSelection.length > 0) {
      event.preventDefault();
      const step = (grid > 0 ? grid : 1) * (event.shiftKey ? 10 : 1);
      nudgeSelected(event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
    }
  }

  const editKeyDownRef = useRef(editKeyDown);
  editKeyDownRef.current = editKeyDown;
  const bodyKeysEnabled = drawingBlock === undefined && symbolLibrary === null;
  useEffect(() => {
    if (!bodyKeysEnabled) return;
    // A button that removes itself on click (outline duplicate, delete, move) drops focus to <body>, outside the editor's own onKeyDown.
    const onBodyKey = (event: KeyboardEvent) => {
      if (event.target === document.body) editKeyDownRef.current(event);
    };
    document.addEventListener('keydown', onBodyKey);
    return () => document.removeEventListener('keydown', onBodyKey);
  }, [bodyKeysEnabled]);

  function zoomToGroup() {
    const first = generated.blocks.find((b) => b.groupId === activeGroupId);
    if (!first) return;
    const bounds = getBlocksBounds(generated.blocks.filter((b) => b.groupId === activeGroupId && b.circuitId === first.circuitId));
    if (bounds) zoomTo(bounds);
  }

  const activeGroup = activeGroupId ? template.groups.find((g) => g.id === activeGroupId) : undefined;
  /** The group shows on the sheet while it is selected, or while one of its blocks is (ambiguous for a multi-selection spanning groups, so it stays hidden then). */
  const shownGroup = activeGroup && (liveSelection.length === 0 || (singleSelection !== undefined && singleSelection.groupId === activeGroup.id)) ? activeGroup : undefined;
  const repeatBoxes = shownGroup ? groupRepeatBoxes(generated.blocks, shownGroup.id) : [];
  const repeatLabelAt = repeatBoxes.length > 0 ? { x: Math.min(...repeatBoxes.map((b) => b.x)), y: Math.max(...repeatBoxes.map((b) => b.y + b.height)) } : undefined;

  if (drawingRef && drawingBlock) {
    return (
      <div className="mep-ws-page">
        <SchematicDrawingEditor
          key={`${drawingRef.groupId ?? '-'}/${drawingRef.blockId}`}
          title={`Drawing · ${drawingRef.blockId}${drawingRef.groupId !== undefined ? ' (each circuit)' : ''}`}
          shapes={drawingBlock.shapes ?? []}
          widthMm={getBlockWidth(drawingBlock)}
          heightMm={getBlockHeight(drawingBlock)}
          onDone={finishDrawing}
          onCancel={() => setDrawingRef(null)}
        />
      </div>
    );
  }

  if (symbolLibrary) {
    return (
      <div className="mep-ws-page">
        <SchematicSymbolLibrary symbols={symbols} onChange={onSymbolsChange} usesOf={symbolUses} onPick={pickSymbol} onClose={() => setSymbolLibrary(null)} />
      </div>
    );
  }

  const zoomBounds = contentBounds(generated.blocks);

  return (
    <div className="mep-schematic-editor mep-ws-body mep-ws-body--template" ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown}>
      <TemplateOutlinePanel
        template={template}
        symbols={symbols}
        selection={liveSelection}
        activeGroupId={activeGroupId}
        onSelectBlock={(ref) => selectBlock(ref)}
        onSelectGroup={(groupId) => selectGroup(groupId)}
        onReorderBlock={(ref, steps) => edit((t) => reorderBlock(t, ref, steps))}
        onDuplicateBlock={duplicateSelected}
        onDeleteBlock={deleteSelected}
        onAddGroup={() => {
          const result = addGroup(historyRef.current.present);
          applyHistory(commit(historyRef.current, result.template));
          selectGroup(result.groupId);
        }}
        onReorderGroup={(groupId, steps) => edit((t) => reorderGroup(t, groupId, steps))}
        onDuplicateGroup={(groupId) => {
          const result = duplicateGroup(historyRef.current.present, groupId);
          if (!result) return;
          applyHistory(commit(historyRef.current, result.template));
          selectGroup(result.groupId);
        }}
        onRemoveGroup={(groupId) => {
          edit((t) => removeGroup(t, groupId));
          selectGroup(null);
        }}
        onAddBlock={(type) => addFromPalette(type)}
      />

      <SheetToolRail draw={draw}>
        <button type="button" className="mep-rail-btn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={history.past.length === 0} onClick={() => applyHistory(undo(historyRef.current))}>
          <IconUndo size={18} />
        </button>
        <button type="button" className="mep-rail-btn" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={history.future.length === 0} onClick={() => applyHistory(redo(historyRef.current))}>
          <IconRedo size={18} />
        </button>
      </SheetToolRail>

      <div className="mep-schematic-stage mep-ws-stage" onDragOver={onDragOver} onDrop={onDrop}>
        <SheetToolOptions draw={draw} onChooseSymbol={() => setSymbolLibrary({ kind: 'draw' })}>
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
        </SheetToolOptions>
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
          selected={liveSelection}
          instanceId={instanceId}
          onSelect={selectBlocks}
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
          overlay={
            <>
              {shownGroup && repeatLabelAt && (
                <g pointerEvents="none" className="mep-group-boxes">
                  {repeatBoxes.map((box) => (
                    <rect key={box.circuitId} x={box.x - sheetView.mmPerPixel * 3} y={box.y - sheetView.mmPerPixel * 3} width={box.width + sheetView.mmPerPixel * 6} height={box.height + sheetView.mmPerPixel * 6} fill={ACCENT} fillOpacity={0.05} stroke={ACCENT} strokeWidth={sheetView.mmPerPixel} strokeDasharray={`${sheetView.mmPerPixel * 4} ${sheetView.mmPerPixel * 3}`} />
                  ))}
                  <text x={repeatLabelAt.x - sheetView.mmPerPixel * 3} y={repeatLabelAt.y + sheetView.mmPerPixel * 16} fontSize={sheetView.mmPerPixel * 11} fill={ACCENT} fontFamily="Arial, Helvetica, sans-serif">
                    {shownGroup.name} · {describeRule(shownGroup.rule)} · {repeatBoxes.length} circuit{repeatBoxes.length === 1 ? '' : 's'}
                  </text>
                </g>
              )}
              {draw.overlay}
            </>
          }
          onDoubleClick={openSelectedDrawing}
          onFocusRequest={() => rootRef.current?.focus({ preventScroll: true })}
        />
        <SheetViewBar
          sheetView={sheetView}
          onZoomToContent={zoomBounds ? () => zoomTo(zoomBounds) : undefined}
          status={dropNotice ?? sheetStatusText(draw, 'Click a block to select it, drag to move it. Drag empty space to select, hold Shift to add or Shift-click to toggle one. Scroll to zoom, middle-drag to pan. Hold Alt to turn off the grid.')}
        >
          <button type="button" className="mep-ws-textbtn" onClick={zoomToGroup} disabled={!activeGroupId || !generated.blocks.some((b) => b.groupId === activeGroupId)} title="Zoom to the first circuit drawn by the selected group">
            Zoom to group
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
          <label title="The circuits that the preview draws">
            Preview
            <select value={previewPanel ? previewPanel.id : SAMPLE} onChange={(e) => setPreviewSource(e.target.value)}>
              <option value={SAMPLE}>Sample data</option>
              {panels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </SheetViewBar>
      </div>

      <aside className="mep-schematic-side mep-schematic-side--right mep-ws-right">
        <SchematicTemplateProperties
          template={template}
          edit={edit}
          endGesture={endGesture}
          selection={liveSelection}
          activeGroupId={activeGroupId}
          circuitTypes={circuitTypes}
          loadTypes={loadTypes}
          notes={notes}
          onDuplicateBlock={duplicateSelected}
          onDeleteBlock={deleteSelected}
          onEditDrawing={openSelectedDrawing}
          symbols={symbols}
          onChangeSymbol={() => singleSelection && setSymbolLibrary({ kind: 'change', ref: singleSelection })}
          onDetachSymbol={detachSelectedSymbol}
          tab={rightTab}
          onTabChange={setRightTab}
        />
      </aside>
    </div>
  );
}
