import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import {
  SCHEMATIC_BLOCK_CATALOGUE,
  SCHEMATIC_TEMPLATE_LIBRARY,
  addSchematicExtra,
  addSchematicSymbolExtra,
  copyTemplate,
  countSymbolUses,
  createSchematic,
  duplicateSchematicExtra,
  generateFromSchematic,
  getBlockHeight,
  getBlockWidth,
  getCircuitLabel,
  getSchematicTemplateStatus,
  getStampDefinition,
  refreshSchematicFromTemplate,
  removeSchematicExtra,
  setSchematicFieldValue,
  setTextOverride,
  todayIso,
  uniqueSchematicName,
  updateSchematicExtra,
  type Circuit,
  type CircuitType,
  type Panel,
  type PanelSection,
  type ResolvedBlock,
  type ResolvedField,
  type Schematic,
  type SchematicSymbol,
  type SchematicTemplate,
  type StampDefinition,
} from '@mepapp/core';
import type { StampInfo } from '@mepapp/render';
import { describeDiagnostics } from '../schematicDiagnostics.js';
import { buildSchematicTerminals } from '../schematicTerminals.js';
import { findExtraBlockAt, findTextBlockAt } from '../schematicTextEdit.js';
import { roundMm, textBlockSize, type DrawnItem } from '../sheetDraw.js';
import { useSheetDraw } from '../useSheetDraw.js';
import { useSheetView } from '../useSheetView.js';
import { Dialog } from './Dialog.js';
import { SchematicDrawingEditor } from './SchematicDrawingEditor.js';
import { SchematicExtraProperties } from './SchematicExtraProperties.js';
import { SchematicFieldsForm } from './SchematicFieldsForm.js';
import { SchematicSymbolLibrary } from './SchematicSymbolLibrary.js';
import { SchematicTemplateEditor } from './SchematicTemplateEditor.js';
import { SheetBlockCanvas } from './SheetBlockCanvas.js';
import { SheetDrawTools } from './SheetDrawTools.js';

export interface SchematicDialogProps {
  /** The panel this dialog is about. A schematic covers exactly one panel. */
  panelId: string;
  panels: Panel[];
  circuits: Circuit[];
  panelSections: PanelSection[];
  circuitTypes: CircuitType[];
  stamps: StampInfo[];
  customStampDefinitions: StampDefinition[];
  /** Every saved schematic of the document; the dialog shows the ones of its panel. */
  schematics: Schematic[];
  /** Values of the template fields with scope project, shared by every schematic. */
  projectFields: Record<string, string>;
  onAddSchematic: (schematic: Schematic) => void;
  onUpdateSchematic: (schematic: Schematic) => void;
  onRemoveSchematic: (schematicId: string) => void;
  onProjectFieldChange: (fieldId: string, value: string | undefined) => void;
  /** The user's own templates, listed after the built-in ones. Built-in templates cannot be edited; "Edit template" copies one first. */
  customTemplates: SchematicTemplate[];
  onCustomTemplatesChange: (templates: SchematicTemplate[]) => void;
  /** The user's own symbols (shared-drawing-tool.md Phase 4). A block that names one draws its art. */
  customSymbols: SchematicSymbol[];
  onCustomSymbolsChange: (symbols: SchematicSymbol[]) => void;
  /** The template that the create form offers first. */
  templateId: string;
  onTemplateIdChange: (id: string) => void;
  onClose: () => void;
}

interface TextEdit {
  blockId: string;
  label: string;
  draft: string;
  overridden: boolean;
}

function TemplateOptions({ customTemplates }: { customTemplates: SchematicTemplate[] }) {
  return (
    <>
      {SCHEMATIC_TEMPLATE_LIBRARY.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
      {customTemplates.length > 0 && (
        <optgroup label="My templates">
          {customTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}

/**
 * A saved schematic of one panel (electrical-schematic-templates.md Phase 5b): the panel's circuits laid
 * out by the schematic's own copy of a template, drawn as SVG in sheet millimetres, plus the values the user
 * enters (a fields form, text typed over a block). It regenerates from the props on every render, so it always
 * shows the current circuits and terminals. "Edit template…" swaps the view for the template editor (Phase 5).
 */
export function SchematicDialog({
  panelId,
  panels,
  circuits,
  panelSections,
  circuitTypes,
  stamps,
  customStampDefinitions,
  schematics,
  projectFields,
  onAddSchematic,
  onUpdateSchematic,
  onRemoveSchematic,
  onProjectFieldChange,
  customTemplates,
  onCustomTemplatesChange,
  customSymbols,
  onCustomSymbolsChange,
  templateId,
  onTemplateIdChange,
  onClose,
}: SchematicDialogProps) {
  const panel = panels.find((p) => p.id === panelId);
  const panelSchematics = useMemo(() => schematics.filter((s) => s.panelId === panelId), [schematics, panelId]);
  const [selectedId, setSelectedId] = useState<string | undefined>(panelSchematics[0]?.id);
  const schematic = panelSchematics.find((s) => s.id === selectedId) ?? panelSchematics[0];
  const [creating, setCreating] = useState(false);
  const [createTemplateId, setCreateTemplateId] = useState(templateId);
  const [createName, setCreateName] = useState(() => uniqueSchematicName(panel?.name ?? 'Schematic', schematics.filter((s) => s.panelId === panelId)));
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [switchTemplateId, setSwitchTemplateId] = useState(SCHEMATIC_TEMPLATE_LIBRARY[0].id);
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);
  const [selectedExtraId, setSelectedExtraId] = useState<string | null>(null);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [grid, setGrid] = useState(1);
  /** Where a drawn shape goes: the sheet, or the id of a circuit that it follows. */
  const [attachTo, setAttachTo] = useState('sheet');
  const [drawingExtraId, setDrawingExtraId] = useState<string | null>(null);
  const [symbolLibraryOpen, setSymbolLibraryOpen] = useState(false);
  const today = useMemo(() => todayIso(), []);

  const allTemplates = [...SCHEMATIC_TEMPLATE_LIBRARY, ...customTemplates];
  const sourceTemplate = schematic ? allTemplates.find((t) => t.id === schematic.sourceTemplateId) : undefined;
  const sourceIsCustom = sourceTemplate !== undefined && customTemplates.some((t) => t.id === sourceTemplate.id);
  const status = schematic ? getSchematicTemplateStatus(schematic, sourceTemplate, customSymbols) : undefined;
  const sheetTemplate = schematic?.template ?? SCHEMATIC_TEMPLATE_LIBRARY[0];

  const terminals = useMemo(() => buildSchematicTerminals(stamps, customStampDefinitions), [stamps, customStampDefinitions]);
  const generated = useMemo(
    () => (panel && schematic ? generateFromSchematic(schematic, { panel, circuits, sections: panelSections, terminals, circuitTypes, projectFieldValues: projectFields, today }) : undefined),
    [panel, schematic, circuits, panelSections, terminals, circuitTypes, projectFields, today],
  );

  const sheetView = useSheetView({
    sheetWidthMm: sheetTemplate.sheet.widthMm,
    sheetHeightMm: sheetTemplate.sheet.heightMm,
    resetKey: `${schematic?.id ?? ''}:${sheetTemplate.sheet.widthMm}x${sheetTemplate.sheet.heightMm}`,
  });
  const { fit, clientToSheet, mmPerPixel } = sheetView;

  const rootRef = useRef<HTMLDivElement>(null);
  const schematicRef = useRef(schematic);
  schematicRef.current = schematic;
  const selectedExtra = schematic && selectedExtraId !== null ? schematic.extras.find((e) => e.id === selectedExtraId) : undefined;
  const drawingExtra = schematic && drawingExtraId !== null ? schematic.extras.find((e) => e.id === drawingExtraId) : undefined;
  const attachValid = attachTo === 'sheet' || generated?.circuitOrigins[attachTo] !== undefined;

  /** Direct edits, like the other schematic edits: the scene is updated at once and nothing here is undoable. */
  function commitSchematic(next: Schematic) {
    schematicRef.current = next;
    onUpdateSchematic(next);
  }

  function updateExtra(extraId: string, patch: Parameters<typeof updateSchematicExtra>[2]) {
    const current = schematicRef.current;
    if (current) commitSchematic(updateSchematicExtra(current, extraId, patch));
  }

  function selectExtra(extraId: string | null, instance: string | null = null) {
    setSelectedExtraId(extraId);
    setInstanceId(instance);
  }

  function onDrawFinish(item: DrawnItem) {
    const current = schematicRef.current;
    if (!current) return;
    const circuitId = attachTo === 'sheet' ? undefined : attachTo;
    const origin = circuitId === undefined ? { x: 0, y: 0 } : generated?.circuitOrigins[circuitId];
    if (!origin) return;
    let result: { schematic: Schematic; extraId: string } | undefined;
    if (item.kind === 'shape') {
      const added = addSchematicExtra(current, 'drawing', { circuitId });
      if (added) result = { extraId: added.extraId, schematic: updateSchematicExtra(added.schematic, added.extraId, { x: roundMm(item.box.x - origin.x), y: roundMm(item.box.y - origin.y), width: roundMm(item.box.width), height: roundMm(item.box.height), shapes: [item.shape] }) };
    } else if (item.kind === 'text') {
      const added = addSchematicExtra(current, 'freeItem', { circuitId });
      const size = textBlockSize(item.text);
      if (added) result = { extraId: added.extraId, schematic: updateSchematicExtra(added.schematic, added.extraId, { x: roundMm(item.at.x - origin.x), y: roundMm(item.at.y - origin.y), width: size.width, height: size.height, binding: item.text }) };
    } else {
      result = addSchematicSymbolExtra(current, item.symbol, { circuitId, at: { x: roundMm(item.at.x - origin.x), y: roundMm(item.at.y - origin.y) } });
    }
    if (!result) return;
    commitSchematic(result.schematic);
    selectExtra(result.extraId);
  }

  const draw = useSheetDraw({ sheet: sheetTemplate.sheet, grid, onFinish: onDrawFinish });

  const textEditOpenRef = useRef(false);
  const drawEscapeRef = useRef<() => boolean>(() => false);
  const selectedExtraRef = useRef<string | null>(null);
  const subviewOpenRef = useRef(false);
  textEditOpenRef.current = textEdit !== null;
  drawEscapeRef.current = draw.escape;
  selectedExtraRef.current = selectedExtraId;
  subviewOpenRef.current = editingTemplateId !== null || drawingExtraId !== null || symbolLibraryOpen;

  useEffect(() => {
    setSelectedExtraId(null);
    setInstanceId(null);
    setAttachTo('sheet');
    setDrawingExtraId(null);
  }, [schematic?.id]);

  // The dialog's own Escape closes everything. Escape first closes the text bar, then leaves a draw tool or a half-drawn shape, then deselects.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || subviewOpenRef.current) return;
      if (textEditOpenRef.current) {
        event.stopPropagation();
        setTextEdit(null);
      } else if (drawEscapeRef.current()) {
        event.stopPropagation();
      } else if (selectedExtraRef.current !== null) {
        event.stopPropagation();
        setSelectedExtraId(null);
        setInstanceId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const loadShapesFor = (definitionId: string | undefined) => (definitionId ? getStampDefinition(definitionId, customStampDefinitions)?.shapes : undefined);
  const symbolShapesFor = (symbolId: string | undefined) => {
    if (!symbolId) return undefined;
    return (schematic?.symbols.find((s) => s.id === symbolId) ?? customSymbols.find((s) => s.id === symbolId))?.shapes;
  };

  const notes = generated ? describeDiagnostics(generated.diagnostics, circuits, panel) : [];
  const orphanOverrides = generated?.diagnostics.filter((d) => d.kind === 'orphan-override') ?? [];
  const orphanExtras = generated?.diagnostics.filter((d) => d.kind === 'orphan-extra') ?? [];
  const memberCount = panel ? circuits.filter((c) => c.panelId === panel.id).length : 0;
  const showCreateForm = creating || !schematic;
  const circuitLabelOf = (circuitId: string) => {
    const circuit = circuits.find((c) => c.id === circuitId);
    return circuit ? getCircuitLabel(circuit, panel) : circuitId;
  };

  function startCreate() {
    setCreateTemplateId(allTemplates.some((t) => t.id === templateId) ? templateId : SCHEMATIC_TEMPLATE_LIBRARY[0].id);
    setCreateName(uniqueSchematicName(panel?.name ?? 'Schematic', panelSchematics));
    setCreating(true);
  }

  function create() {
    const source = allTemplates.find((t) => t.id === createTemplateId);
    if (!panel || !source) return;
    const name = createName.trim() === '' ? uniqueSchematicName(panel.name, panelSchematics) : createName.trim();
    const created = createSchematic({ id: `schematic-${crypto.randomUUID()}`, name, panelId: panel.id, source, library: customSymbols });
    onAddSchematic(created);
    onTemplateIdChange(source.id);
    setSelectedId(created.id);
    setCreating(false);
  }

  function rename() {
    if (!schematic) return;
    const next = window.prompt('Name of the schematic', schematic.name);
    if (next === null || next.trim() === '') return;
    onUpdateSchematic({ ...schematic, name: next.trim() });
  }

  function remove() {
    if (!schematic || !window.confirm(`Delete the schematic "${schematic.name}"? Its entered values and typed texts are deleted too.`)) return;
    onRemoveSchematic(schematic.id);
    setSelectedId(undefined);
  }

  function editTemplate() {
    if (!schematic || !sourceTemplate) return;
    let source = sourceTemplate;
    if (!sourceIsCustom) {
      source = copyTemplate(sourceTemplate, allTemplates);
      onCustomTemplatesChange([...customTemplates, source]);
      onUpdateSchematic({ ...schematic, sourceTemplateId: source.id });
    }
    setEditingTemplateId(source.id);
  }

  function duplicateTemplate() {
    if (sourceTemplate) onCustomTemplatesChange([...customTemplates, copyTemplate(sourceTemplate, allTemplates)]);
  }

  function deleteTemplate() {
    if (!sourceTemplate || !sourceIsCustom || !window.confirm(`Delete the template "${sourceTemplate.name}"? Schematics that copied it keep their own copy.`)) return;
    onCustomTemplatesChange(customTemplates.filter((t) => t.id !== sourceTemplate.id));
  }

  function updateFromTemplate(source: SchematicTemplate | undefined) {
    if (schematic && source) onUpdateSchematic(refreshSchematicFromTemplate(schematic, source, customSymbols));
  }

  function changeField(field: ResolvedField, value: string | undefined) {
    if (field.scope === 'project') onProjectFieldChange(field.id, value);
    else if (schematic) onUpdateSchematic(setSchematicFieldValue(schematic, field.id, value));
  }

  function openTextEdit(event: ReactMouseEvent<SVGSVGElement>) {
    const point = clientToSheet(event.clientX, event.clientY);
    const extraBlock = point && generated ? findExtraBlockAt(generated.blocks, point) : undefined;
    if (extraBlock) {
      const extra = schematic?.extras.find((e) => e.id === extraBlock.extraId);
      if (extra?.type === 'drawing' && extra.symbolId === undefined) {
        selectExtra(extra.id, extraBlock.id);
        setDrawingExtraId(extra.id);
      }
      return;
    }
    const block = point && generated ? findTextBlockAt(generated.blocks, point) : undefined;
    if (!block) return;
    setTextEdit({ blockId: block.id, label: SCHEMATIC_BLOCK_CATALOGUE[block.type].label, draft: block.text ?? '', overridden: block.overridden === true });
  }

  function applyTextEdit() {
    if (!schematic || !textEdit) return;
    onUpdateSchematic(setTextOverride(schematic, textEdit.blockId, textEdit.draft));
    setTextEdit(null);
  }

  function resetTextEdit() {
    if (!schematic || !textEdit) return;
    onUpdateSchematic(setTextOverride(schematic, textEdit.blockId, undefined));
    setTextEdit(null);
  }

  function removeOrphanOverrides() {
    if (!schematic) return;
    const gone = new Set(orphanOverrides.map((d) => (d.kind === 'orphan-override' ? d.blockId : '')));
    onUpdateSchematic({ ...schematic, textOverrides: Object.fromEntries(Object.entries(schematic.textOverrides).filter(([id]) => !gone.has(id))) });
  }

  function removeOrphanExtras() {
    if (!schematic) return;
    const gone = new Set(orphanExtras.map((d) => (d.kind === 'orphan-extra' ? d.extraId : '')));
    onUpdateSchematic({ ...schematic, extras: schematic.extras.filter((e) => !gone.has(e.id)) });
  }

  function deleteSelectedExtra() {
    const current = schematicRef.current;
    if (!current || selectedExtraId === null) return;
    commitSchematic(removeSchematicExtra(current, selectedExtraId));
    selectExtra(null);
  }

  function duplicateSelectedExtra() {
    const current = schematicRef.current;
    const result = current && selectedExtraId !== null ? duplicateSchematicExtra(current, selectedExtraId) : undefined;
    if (!result) return;
    commitSchematic(result.schematic);
    selectExtra(result.extraId);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const tag = (event.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (draw.keyDown(event)) {
      event.preventDefault();
      return;
    }
    if (!selectedExtra) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'd') {
      event.preventDefault();
      duplicateSelectedExtra();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteSelectedExtra();
    } else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const step = (grid > 0 ? grid : 1) * (event.shiftKey ? 10 : 1);
      updateExtra(selectedExtra.id, { x: selectedExtra.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y: selectedExtra.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) });
    }
  }

  function pickSymbol(symbol: SchematicSymbol) {
    draw.setSymbol(symbol);
    draw.setTool('symbol');
    setSymbolLibraryOpen(false);
  }

  const editingTemplate = editingTemplateId ? customTemplates.find((t) => t.id === editingTemplateId) : undefined;
  if (editingTemplate) {
    return (
      <Dialog title="Schematic template" onClose={onClose} className="mep-modal--wide mep-modal--full" closeOnBackdropClick={false} actions={<button onClick={onClose}>Close</button>}>
        <SchematicTemplateEditor
          key={editingTemplate.id}
          initialTemplate={editingTemplate}
          onChange={(next) => onCustomTemplatesChange(customTemplates.map((t) => (t.id === next.id ? next : t)))}
          panels={panels}
          circuits={circuits}
          panelSections={panelSections}
          circuitTypes={circuitTypes}
          stamps={stamps}
          customStampDefinitions={customStampDefinitions}
          symbols={customSymbols}
          onSymbolsChange={onCustomSymbolsChange}
          symbolUses={(symbolId) => countSymbolUses(customTemplates, symbolId)}
          projectFieldValues={projectFields}
          initialPanelId={panelId}
          onDone={() => setEditingTemplateId(null)}
        />
      </Dialog>
    );
  }

  const overriddenBlocks: ResolvedBlock[] = generated?.blocks.filter((b) => b.overridden) ?? [];

  return (
    <Dialog title="Schematic" onClose={onClose} className="mep-modal--wide" closeOnBackdropClick={false} actions={<button onClick={onClose}>Close</button>}>
      {drawingExtra ? (
        <SchematicDrawingEditor
          key={drawingExtra.id}
          title={`Drawing · ${drawingExtra.id}`}
          shapes={drawingExtra.shapes ?? []}
          widthMm={getBlockWidth(drawingExtra)}
          heightMm={getBlockHeight(drawingExtra)}
          onDone={(shapes) => {
            updateExtra(drawingExtra.id, { shapes });
            setDrawingExtraId(null);
          }}
          onCancel={() => setDrawingExtraId(null)}
        />
      ) : symbolLibraryOpen ? (
        <SchematicSymbolLibrary
          symbols={customSymbols}
          onChange={onCustomSymbolsChange}
          usesOf={(symbolId) => countSymbolUses(customTemplates, symbolId)}
          onPick={pickSymbol}
          onClose={() => setSymbolLibraryOpen(false)}
          backLabel="Back to schematic"
          pickHint="Click a symbol, then click on the sheet to place it."
        />
      ) : (
        <div className="mep-schematic mep-schematic-editor" ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown}>
          {!panel ? (
            <p className="mep-schematic-empty">This panel no longer exists.</p>
          ) : showCreateForm ? (
            <div className="mep-section mep-schematic-create">
              <h4>{schematic ? 'New schematic' : `No schematic for ${panel.name} yet`}</h4>
              <div className="mep-schematic-field">
                <label htmlFor="sch-create-name">Name</label>
                <input id="sch-create-name" type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} />
              </div>
              <div className="mep-schematic-field">
                <label htmlFor="sch-create-template">Template</label>
                <select id="sch-create-template" value={createTemplateId} onChange={(e) => setCreateTemplateId(e.target.value)}>
                  <TemplateOptions customTemplates={customTemplates} />
                </select>
                <span className="mep-schematic-hint">{allTemplates.find((t) => t.id === createTemplateId)?.description}</span>
              </div>
              <div className="mep-schematic-create-actions">
                <button type="button" onClick={create}>
                  Create schematic
                </button>
                {schematic && (
                  <button type="button" onClick={() => setCreating(false)}>
                    Cancel
                  </button>
                )}
              </div>
              {!schematic && <p className="mep-schematic-hint">The schematic keeps its own copy of the template. Later template edits reach it when you choose "Update from template".</p>}
            </div>
          ) : (
            <>
              <div className="mep-schematic-bar">
                <label>
                  Schematic
                  <select value={schematic.id} onChange={(event) => setSelectedId(event.target.value)}>
                    {panelSchematics.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={startCreate}>
                  New schematic…
                </button>
                <button type="button" onClick={rename}>
                  Rename
                </button>
                <button type="button" onClick={remove}>
                  Delete
                </button>
                <button type="button" onClick={editTemplate} disabled={!sourceTemplate} title={sourceIsCustom ? 'Edit the template this schematic copied' : 'Built-in templates cannot change. This makes a copy and edits the copy.'}>
                  Edit template…
                </button>
                <button type="button" onClick={duplicateTemplate} disabled={!sourceTemplate}>
                  Duplicate template
                </button>
                <button type="button" onClick={deleteTemplate} disabled={!sourceIsCustom} title={sourceIsCustom ? 'Delete this template' : 'Built-in templates cannot be deleted.'}>
                  Delete template
                </button>
                <button type="button" onClick={fit}>
                  Fit to sheet
                </button>
                <label>
                  Grid
                  <select value={grid} onChange={(e) => setGrid(Number(e.target.value))} title="Added items snap to this grid. Hold Alt to turn it off for one move.">
                    {[0, 0.5, 1, 2, 5].map((g) => (
                      <option key={g} value={g}>
                        {g === 0 ? 'Off' : `${g} mm`}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="mep-schematic-hint">Scroll to zoom, drag to pan, double-click a text to type over it.</span>
              </div>
              <SheetDrawTools draw={draw} onChooseSymbol={() => setSymbolLibraryOpen(true)}>
                <label>
                  Attach to
                  <select value={attachValid ? attachTo : 'sheet'} onChange={(e) => setAttachTo(e.target.value)} title="A shape attached to a circuit moves with that circuit">
                    <option value="sheet">Sheet</option>
                    {(generated?.circuitOrder ?? []).map((circuitId) => {
                      const circuit = circuits.find((c) => c.id === circuitId);
                      return (
                        <option key={circuitId} value={circuitId}>
                          Circuit {circuit ? getCircuitLabel(circuit, panel) : circuitId}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </SheetDrawTools>

              {status === 'changed' && sourceTemplate && (
                <p className="mep-schematic-note" role="status">
                  The template "{sourceTemplate.name}" has changed since this schematic copied it.{' '}
                  <button type="button" onClick={() => updateFromTemplate(sourceTemplate)}>
                    Update from template
                  </button>
                </p>
              )}
              {status === 'missing-source' && (
                <p className="mep-schematic-note" role="status">
                  The template that this schematic copied no longer exists. The schematic keeps its own copy. Switch to another template:{' '}
                  <select value={switchTemplateId} onChange={(e) => setSwitchTemplateId(e.target.value)}>
                    <TemplateOptions customTemplates={customTemplates} />
                  </select>{' '}
                  <button type="button" onClick={() => updateFromTemplate(allTemplates.find((t) => t.id === switchTemplateId))}>
                    Switch template
                  </button>
                </p>
              )}
              {memberCount === 0 && <p className="mep-schematic-note">This panel has no circuits yet, so only the panel-level blocks are shown.</p>}
              {notes.map((note, i) => (
                <p key={i} className="mep-schematic-note" role="status">
                  {note}
                </p>
              ))}
              {orphanOverrides.length > 0 && (
                <p className="mep-schematic-note" role="status">
                  {orphanOverrides.length} typed text{orphanOverrides.length === 1 ? ' has' : 's have'} no block in the template any more.{' '}
                  <button type="button" onClick={removeOrphanOverrides}>
                    Remove them
                  </button>
                </p>
              )}
              {orphanExtras.length > 0 && (
                <p className="mep-schematic-note" role="status">
                  {orphanExtras.length} added item{orphanExtras.length === 1 ? ' follows' : 's follow'} a circuit that is not drawn and {orphanExtras.length === 1 ? 'is' : 'are'} hidden.{' '}
                  <button type="button" onClick={removeOrphanExtras}>
                    Remove them
                  </button>
                </p>
              )}
              {textEdit && (
                <div className="mep-schematic-textedit">
                  <label htmlFor="sch-text-edit">Text of {textEdit.label.toLowerCase()}</label>
                  <textarea
                    id="sch-text-edit"
                    autoFocus
                    rows={2}
                    value={textEdit.draft}
                    onChange={(e) => setTextEdit({ ...textEdit, draft: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        applyTextEdit();
                      }
                    }}
                  />
                  <button type="button" onClick={applyTextEdit}>
                    Apply
                  </button>
                  <button type="button" onClick={resetTextEdit} disabled={!textEdit.overridden} title="Remove the typed text and show the template text again">
                    Reset to template text
                  </button>
                  <button type="button" onClick={() => setTextEdit(null)}>
                    Cancel
                  </button>
                </div>
              )}
              <div className="mep-schematic-main">
                <SheetBlockCanvas<string>
                  ariaLabel={`Schematic of panel ${panel.name}`}
                  sheetWidthMm={sheetTemplate.sheet.widthMm}
                  sheetHeightMm={sheetTemplate.sheet.heightMm}
                  sheetView={sheetView}
                  blocks={generated?.blocks ?? []}
                  grid={grid}
                  loadShapesFor={loadShapesFor}
                  symbolShapesFor={symbolShapesFor}
                  targetOf={(block) => block.extraId}
                  sameTarget={(a, b) => a === b}
                  targetKey={(id) => id}
                  selected={selectedExtra ? selectedExtra.id : null}
                  instanceId={instanceId}
                  onSelect={selectExtra}
                  readOrigin={(id) => {
                    const extra = schematicRef.current?.extras.find((e) => e.id === id);
                    return extra ? { x: extra.x, y: extra.y } : undefined;
                  }}
                  onMove={(id, x, y) => updateExtra(id, { x, y })}
                  onRotate={(id, rotation) => updateExtra(id, { rotation })}
                  onResize={(id, patch) => updateExtra(id, patch)}
                  onGestureEnd={() => {}}
                  draw={draw.pointer}
                  overlay={draw.overlay}
                  onDoubleClick={openTextEdit}
                  onFocusRequest={() => rootRef.current?.focus({ preventScroll: true })}
                  topOverlay={overriddenBlocks.map((block) => (
                    <circle key={`override-${block.id}`} className="mep-schematic-override-mark" cx={block.x} cy={block.y} r={mmPerPixel * 3} fill="#d9822b" pointerEvents="none">
                      <title>Text typed over the template</title>
                    </circle>
                  ))}
                />
                <div className="mep-schematic-side">
                  {selectedExtra && (
                    <SchematicExtraProperties
                      extra={selectedExtra}
                      circuitLabel={selectedExtra.circuitId !== undefined ? circuitLabelOf(selectedExtra.circuitId) : undefined}
                      symbolName={selectedExtra.symbolId !== undefined ? schematic?.symbols.find((sym) => sym.id === selectedExtra.symbolId)?.name : undefined}
                      onChange={(patch) => updateExtra(selectedExtra.id, patch)}
                      onEditDrawing={() => setDrawingExtraId(selectedExtra.id)}
                      onDuplicate={duplicateSelectedExtra}
                      onDelete={deleteSelectedExtra}
                    />
                  )}
                  <SchematicFieldsForm fields={generated?.fields ?? []} onChange={changeField} />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
