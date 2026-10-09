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
  setBlockOverride,
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
  type SchematicBlockOverride,
  type SchematicSymbol,
  type SchematicTemplate,
  type StampDefinition,
} from '@mepapp/core';
import type { StampInfo } from '@mepapp/render';
import { describeDiagnostics } from '../schematicDiagnostics.js';
import { buildSchematicTerminals } from '../schematicTerminals.js';
import { findExtraBlockAt, findTextBlockAt, isMovableBlockType, isTextEditableType } from '../schematicTextEdit.js';
import { roundMm, textBlockSize, type DrawnItem } from '../sheetDraw.js';
import { useSheetDraw } from '../useSheetDraw.js';
import { useSheetView } from '../useSheetView.js';
import { Dialog } from './Dialog.js';
import { SchematicBlockOverrideProperties } from './SchematicBlockOverrideProperties.js';
import { SchematicDrawingEditor } from './SchematicDrawingEditor.js';
import { SchematicExtraProperties } from './SchematicExtraProperties.js';
import { SchematicFieldsForm } from './SchematicFieldsForm.js';
import { SchematicSymbolLibrary } from './SchematicSymbolLibrary.js';
import { SchematicTemplateEditor } from './SchematicTemplateEditor.js';
import { MultiSelectionProperties } from './SchematicTemplateProperties.js';
import { SheetBlockCanvas } from './SheetBlockCanvas.js';
import { SheetToolOptions, SheetToolRail, SheetViewBar, contentBounds, sheetStatusText } from './SheetDrawTools.js';
import { WorkspaceMenu } from './WorkspaceMenu.js';
import { IconClose } from '../icons.js';
import { confirmDialog } from '../confirmDialog.js';

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

/** What one selected thing on the schematic sheet is: an item the user added, or a generated block the template drew (a "block" target's id is the block's own resolved id, `<panelId>/<circuitId|sectionId|->/<templateBlockId>`, not the template block id alone). */
type SchematicTarget = { kind: 'extra'; id: string } | { kind: 'block'; id: string };

const sameSchematicTarget = (a: SchematicTarget, b: SchematicTarget) => a.kind === b.kind && a.id === b.id;
const extraTarget = (id: string): SchematicTarget => ({ kind: 'extra', id });

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
  const [selection, setSelection] = useState<SchematicTarget[]>([]);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [grid, setGrid] = useState(1);
  /** Where a drawn shape goes: the sheet, or the id of a circuit that it follows. */
  const [attachTo, setAttachTo] = useState('sheet');
  const [drawingExtraId, setDrawingExtraId] = useState<string | null>(null);
  const [symbolLibraryOpen, setSymbolLibraryOpen] = useState(false);
  const [sideTab, setSideTab] = useState<'fields' | 'selection'>('fields');
  /** The "Switch template" chooser is open. */
  const [switching, setSwitching] = useState(false);
  /** A drawing block or the symbol library is open inside the template editor. */
  const [templateSubviewOpen, setTemplateSubviewOpen] = useState(false);
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
  const { zoomTo, clientToSheet, mmPerPixel } = sheetView;

  const rootRef = useRef<HTMLDivElement>(null);
  const schematicRef = useRef(schematic);
  schematicRef.current = schematic;
  /** `selection`, but with targets whose extra/block no longer exists dropped. */
  const liveSelection: SchematicTarget[] = schematic
    ? selection.filter((target) => (target.kind === 'extra' ? schematic.extras.some((e) => e.id === target.id) : (generated?.blocks.some((b) => b.id === target.id) ?? false)))
    : [];
  const singleSelection = liveSelection.length === 1 ? liveSelection[0] : undefined;
  const selectedExtra = schematic && singleSelection?.kind === 'extra' ? schematic.extras.find((e) => e.id === singleSelection.id) : undefined;
  const selectedBlock = singleSelection?.kind === 'block' ? generated?.blocks.find((b) => b.id === singleSelection.id) : undefined;
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

  function updateBlockOverride(blockId: string, patch: Partial<SchematicBlockOverride> | undefined) {
    const current = schematicRef.current;
    if (current) commitSchematic(setBlockOverride(current, blockId, patch));
  }

  function selectTargets(targets: SchematicTarget[], instance: string | null = null) {
    setSelection(targets);
    setInstanceId(instance);
    if (targets.length > 0) setSideTab('selection');
  }

  function selectTarget(target: SchematicTarget | null, instance: string | null = null) {
    selectTargets(target !== null ? [target] : [], instance);
  }

  function selectExtra(extraId: string | null, instance: string | null = null) {
    selectTarget(extraId !== null ? extraTarget(extraId) : null, instance);
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

  const editingTemplate = editingTemplateId ? customTemplates.find((t) => t.id === editingTemplateId) : undefined;
  const showCreateForm = creating || !schematic;
  const draw = useSheetDraw({
    sheet: sheetTemplate.sheet,
    grid,
    onFinish: onDrawFinish,
    shortcutsEnabled: panel !== undefined && !showCreateForm && !editingTemplate && drawingExtraId === null && !symbolLibraryOpen,
    onChooseSymbol: () => setSymbolLibraryOpen(true),
  });

  const textEditOpenRef = useRef(false);
  const drawEscapeRef = useRef<() => boolean>(() => false);
  const selectionRef = useRef<SchematicTarget[]>([]);
  const subviewOpenRef = useRef(false);
  textEditOpenRef.current = textEdit !== null;
  drawEscapeRef.current = draw.escape;
  selectionRef.current = liveSelection;
  subviewOpenRef.current = editingTemplateId !== null || drawingExtraId !== null || symbolLibraryOpen;

  useEffect(() => {
    setSelection([]);
    setInstanceId(null);
    setAttachTo('sheet');
    setDrawingExtraId(null);
    setSwitching(false);
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
      } else if (selectionRef.current.length > 0) {
        event.stopPropagation();
        setSelection([]);
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

  async function remove() {
    if (!schematic || !(await confirmDialog(`Delete the schematic "${schematic.name}"? Its entered values and typed texts are deleted too.`))) return;
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

  async function deleteTemplate() {
    if (!sourceTemplate || !sourceIsCustom || !(await confirmDialog(`Delete the template "${sourceTemplate.name}"? Schematics that copied it keep their own copy.`))) return;
    onCustomTemplatesChange(customTemplates.filter((t) => t.id !== sourceTemplate.id));
  }

  function updateFromTemplate(source: SchematicTemplate | undefined) {
    if (schematic && source) onUpdateSchematic(refreshSchematicFromTemplate(schematic, source, customSymbols));
    setSwitching(false);
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

  /** The extra-kind ids of the live selection. Delete and duplicate only make sense for items the user added, never for a generated block. */
  const liveExtraIds = () => liveSelection.filter((t): t is { kind: 'extra'; id: string } => t.kind === 'extra').map((t) => t.id);

  function deleteSelectedExtra() {
    const current = schematicRef.current;
    const extraIds = liveExtraIds();
    if (!current || extraIds.length === 0) return;
    commitSchematic(extraIds.reduce((acc, id) => removeSchematicExtra(acc, id), current));
    selectTargets(liveSelection.filter((t) => t.kind !== 'extra'));
  }

  function duplicateSelectedExtra() {
    const current = schematicRef.current;
    const extraIds = liveExtraIds();
    if (!current || extraIds.length === 0) return;
    let next = current;
    const newTargets: SchematicTarget[] = [];
    for (const id of extraIds) {
      const result = duplicateSchematicExtra(next, id);
      if (!result) continue;
      next = result.schematic;
      newTargets.push(extraTarget(result.extraId));
    }
    if (newTargets.length === 0) return;
    commitSchematic(next);
    selectTargets(newTargets);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const tag = (event.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (draw.keyDown(event)) {
      event.preventDefault();
      return;
    }
    if (liveSelection.length === 0) return;
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
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      const current = schematicRef.current;
      if (!current) return;
      // A mixed selection (extras and generated blocks) nudges in one commit, not one step per target.
      let next = current;
      for (const target of liveSelection) {
        if (target.kind === 'extra') {
          const extra = next.extras.find((e) => e.id === target.id);
          if (extra) next = updateSchematicExtra(next, target.id, { x: extra.x + dx, y: extra.y + dy });
        } else {
          const block = generated?.blocks.find((b) => b.id === target.id);
          if (block) next = setBlockOverride(next, target.id, { x: block.x + dx, y: block.y + dy });
        }
      }
      commitSchematic(next);
    }
  }

  function pickSymbol(symbol: SchematicSymbol) {
    draw.setSymbol(symbol);
    draw.setTool('symbol');
    setSymbolLibraryOpen(false);
  }

  function startSwitch() {
    setSwitchTemplateId(sourceTemplate?.id ?? SCHEMATIC_TEMPLATE_LIBRARY[0].id);
    setSwitching(true);
  }

  const overriddenBlocks: ResolvedBlock[] = generated?.blocks.filter((b) => b.overridden) ?? [];
  const movedBlocks: ResolvedBlock[] = generated?.blocks.filter((b) => b.moved) ?? [];
  const blockSelectionCount = liveSelection.filter((t) => t.kind === 'block').length;
  const zoomBounds = generated ? contentBounds(generated.blocks) : undefined;
  const subviewOpen = drawingExtra !== undefined || symbolLibraryOpen;
  /** Any drawing/symbol-library subview is open, in either mode — closing now would discard its in-progress edits. */
  const closeBlocked = subviewOpen || templateSubviewOpen;
  // An Escape that a subview leaves alone (one typed in its text inputs) still reaches the Dialog.
  const closeUnlessBlocked = () => {
    if (!closeBlocked) onClose();
  };

  const header = (
    <div className="mep-ws-header">
      <div className="mep-ws-modes" role="tablist" aria-label="Mode">
        <button type="button" role="tab" aria-selected={!editingTemplate} className={!editingTemplate ? 'on' : undefined} disabled={closeBlocked} onClick={() => setEditingTemplateId(null)}>
          Schematic
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={editingTemplate !== undefined}
          className={editingTemplate ? 'on' : undefined}
          disabled={!editingTemplate && (showCreateForm || !sourceTemplate || subviewOpen)}
          title={editingTemplate ? undefined : !sourceTemplate ? 'The template of this schematic no longer exists' : sourceIsCustom ? 'Edit the template this schematic copied' : 'Built-in templates cannot change. This makes a copy and edits the copy.'}
          onClick={() => !editingTemplate && editTemplate()}
        >
          Template
        </button>
      </div>
      {editingTemplate ? (
        <>
          <span className="mep-ws-title">
            Template <b>{editingTemplate.name}</b>
          </span>
          <span className="mep-schematic-hint">Changes are kept as you make them. A schematic gets them with "Update from template".</span>
        </>
      ) : panel && schematic && !showCreateForm ? (
        <>
          <span className="mep-ws-title">
            Panel <b>{panel.name}</b>
          </span>
          <span className="mep-ws-sep" />
          <span className="mep-ws-title">Schematic</span>
          <select className="mep-ws-select" aria-label="Schematic" value={schematic.id} disabled={closeBlocked} onChange={(event) => setSelectedId(event.target.value)}>
            {panelSchematics.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <WorkspaceMenu
            label="⋯"
            title="Schematic actions"
            items={[
              { label: 'New schematic…', onClick: startCreate },
              { label: 'Rename…', onClick: rename },
              { label: 'Delete schematic…', onClick: remove },
            ]}
          />
          <span className="mep-ws-sep" />
          <span className="mep-ws-title">
            Template <b>{schematic.template.name}</b>
            {status === 'changed' && <span className="mep-ws-badge">changed</span>}
          </span>
          <WorkspaceMenu
            label="Template ▾"
            title="Template actions"
            items={[
              { label: 'Edit template', onClick: editTemplate, disabled: !sourceTemplate || subviewOpen },
              { label: 'Update from template', onClick: () => updateFromTemplate(sourceTemplate), disabled: status !== 'changed', title: status === 'changed' ? 'Load the latest edits of the template' : 'The schematic already has the latest template' },
              { label: 'Switch template…', onClick: startSwitch },
              'divider',
              { label: 'Duplicate template', onClick: duplicateTemplate, disabled: !sourceTemplate },
              { label: 'Delete template…', onClick: deleteTemplate, disabled: !sourceIsCustom, title: sourceIsCustom ? undefined : 'Built-in templates cannot be deleted.' },
            ]}
          />
        </>
      ) : (
        <span className="mep-ws-title">
          Panel <b>{panel?.name ?? ''}</b>
        </span>
      )}
      <button type="button" className="mep-rail-btn mep-ws-close" aria-label="Close" title={closeBlocked ? 'Finish or cancel the open drawing first' : 'Close (Escape)'} disabled={closeBlocked} onClick={onClose}>
        <IconClose size={18} />
      </button>
    </div>
  );

  let body;
  if (editingTemplate) {
    body = (
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
        onSubviewOpenChange={setTemplateSubviewOpen}
      />
    );
  } else if (drawingExtra) {
    body = (
      <div className="mep-ws-page">
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
      </div>
    );
  } else if (symbolLibraryOpen) {
    body = (
      <div className="mep-ws-page">
        <SchematicSymbolLibrary
          symbols={customSymbols}
          onChange={onCustomSymbolsChange}
          usesOf={(symbolId) => countSymbolUses(customTemplates, symbolId)}
          onPick={pickSymbol}
          onClose={() => setSymbolLibraryOpen(false)}
          backLabel="Back to schematic"
          pickHint="Click a symbol, then click on the sheet to place it."
        />
      </div>
    );
  } else if (!panel) {
    body = (
      <div className="mep-ws-page">
        <p className="mep-schematic-empty">This panel no longer exists.</p>
      </div>
    );
  } else if (showCreateForm) {
    body = (
      <div className="mep-ws-page">
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
      </div>
    );
  } else {
    body = (
      <div className="mep-schematic-editor mep-ws-body mep-ws-body--schematic" ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown}>
        <SheetToolRail draw={draw} />

        <div className="mep-ws-stage">
          <SheetToolOptions draw={draw} onChooseSymbol={() => setSymbolLibraryOpen(true)}>
            <label>
              Attach to
              <select value={attachValid ? attachTo : 'sheet'} onChange={(e) => setAttachTo(e.target.value)} title="A shape attached to a circuit moves with that circuit">
                <option value="sheet">Sheet</option>
                {(generated?.circuitOrder ?? []).map((circuitId) => (
                  <option key={circuitId} value={circuitId}>
                    Circuit {circuitLabelOf(circuitId)}
                  </option>
                ))}
              </select>
            </label>
          </SheetToolOptions>

          {status === 'changed' && sourceTemplate && (
            <p className="mep-schematic-note" role="status">
              The template "{sourceTemplate.name}" has changed since this schematic copied it.{' '}
              <button type="button" onClick={() => updateFromTemplate(sourceTemplate)}>
                Update from template
              </button>
            </p>
          )}
          {(status === 'missing-source' || switching) && (
            <p className="mep-schematic-note" role="status">
              {status === 'missing-source' ? 'The template that this schematic copied no longer exists. The schematic keeps its own copy. Switch to another template:' : 'Draw this schematic with another template. Entered values, typed texts and added items stay.'}{' '}
              <select aria-label="Template to switch to" value={switchTemplateId} onChange={(e) => setSwitchTemplateId(e.target.value)}>
                <TemplateOptions customTemplates={customTemplates} />
              </select>{' '}
              <button type="button" onClick={() => updateFromTemplate(allTemplates.find((t) => t.id === switchTemplateId))}>
                Switch template
              </button>
              {switching && (
                <>
                  {' '}
                  <button type="button" onClick={() => setSwitching(false)}>
                    Cancel
                  </button>
                </>
              )}
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
          <SheetBlockCanvas<SchematicTarget>
            ariaLabel={`Schematic of panel ${panel.name}`}
            sheetWidthMm={sheetTemplate.sheet.widthMm}
            sheetHeightMm={sheetTemplate.sheet.heightMm}
            sheetView={sheetView}
            blocks={generated?.blocks ?? []}
            grid={grid}
            loadShapesFor={loadShapesFor}
            symbolShapesFor={symbolShapesFor}
            targetOf={(block) => (block.extraId !== undefined ? extraTarget(block.extraId) : isMovableBlockType(block.type) ? { kind: 'block', id: block.id } : undefined)}
            sameTarget={sameSchematicTarget}
            targetKey={(target) => `${target.kind}:${target.id}`}
            selected={liveSelection}
            instanceId={instanceId}
            onSelect={selectTargets}
            readOrigin={(target) => {
              if (target.kind === 'extra') {
                const extra = schematicRef.current?.extras.find((e) => e.id === target.id);
                return extra ? { x: extra.x, y: extra.y } : undefined;
              }
              const block = generated?.blocks.find((b) => b.id === target.id);
              return block ? { x: block.x, y: block.y } : undefined;
            }}
            onMove={(target, x, y) => (target.kind === 'extra' ? updateExtra(target.id, { x, y }) : updateBlockOverride(target.id, { x, y }))}
            onRotate={(target, rotation) => (target.kind === 'extra' ? updateExtra(target.id, { rotation }) : updateBlockOverride(target.id, { rotation }))}
            onResize={(target, patch) => (target.kind === 'extra' ? updateExtra(target.id, patch) : updateBlockOverride(target.id, patch))}
            onGestureEnd={() => {}}
            draw={draw.pointer}
            overlay={draw.overlay}
            onDoubleClick={openTextEdit}
            hoverTitleOf={(block) => {
              if (block.extraId !== undefined) return undefined;
              const draggable = isMovableBlockType(block.type);
              const textEditable = isTextEditableType(block.type);
              if (textEditable && draggable) return block.overridden ? 'Typed over the template text and can be dragged. Double-click to edit the text.' : 'Double-click to type over. Can also be dragged.';
              if (textEditable) return block.overridden ? 'Typed over the template text. Double-click to edit it.' : 'Double-click to type over';
              if (draggable) return block.moved ? 'Moved from its template position. Drag to move it, or reset it in the Selection panel.' : 'Drag to move it.';
              return undefined;
            }}
            onFocusRequest={() => rootRef.current?.focus({ preventScroll: true })}
            topOverlay={
              <>
                {overriddenBlocks.map((block) => (
                  <circle key={`override-${block.id}`} className="mep-schematic-override-mark" cx={block.x} cy={block.y} r={mmPerPixel * 3} fill="#d9822b" pointerEvents="none">
                    <title>Text typed over the template</title>
                  </circle>
                ))}
                {movedBlocks.map((block) => (
                  <rect
                    key={`moved-${block.id}`}
                    className="mep-schematic-moved-mark"
                    x={block.x + block.width - mmPerPixel * 3}
                    y={block.y + block.height - mmPerPixel * 3}
                    width={mmPerPixel * 6}
                    height={mmPerPixel * 6}
                    transform={`rotate(45 ${block.x + block.width} ${block.y + block.height})`}
                    fill="#2f9e44"
                    pointerEvents="none"
                  >
                    <title>Moved from its template position</title>
                  </rect>
                ))}
              </>
            }
          />
          <SheetViewBar
            sheetView={sheetView}
            onZoomToContent={zoomBounds ? () => zoomTo(zoomBounds) : undefined}
            status={sheetStatusText(draw, 'Click an item to select it, drag to move it, whether you added it or the template drew it. Double-click a text to type over it. Drag empty space to select, hold Shift to add or Shift-click to toggle one. Scroll to zoom, middle-drag to pan.')}
          >
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
          </SheetViewBar>
        </div>

        <aside className="mep-schematic-side mep-ws-right">
          <div className="mep-subtabs" role="tablist" aria-label="Side panel">
            <button type="button" role="tab" aria-selected={sideTab === 'fields'} className={sideTab === 'fields' ? 'on' : undefined} onClick={() => setSideTab('fields')}>
              Fields
            </button>
            <button type="button" role="tab" aria-selected={sideTab === 'selection'} className={sideTab === 'selection' ? 'on' : undefined} onClick={() => setSideTab('selection')}>
              Selection
            </button>
          </div>
          {sideTab === 'fields' ? (
            <SchematicFieldsForm fields={generated?.fields ?? []} dateFormat={sheetTemplate.dateFormat} onChange={changeField} />
          ) : liveSelection.length > 1 ? (
            <MultiSelectionProperties
              count={liveSelection.length}
              onDuplicateBlock={duplicateSelectedExtra}
              onDeleteBlock={deleteSelectedExtra}
              note={
                blockSelectionCount > 0
                  ? `${blockSelectionCount} of ${liveSelection.length} selected ${blockSelectionCount === 1 ? 'is a template block' : 'are template blocks'}. Duplicate and Delete only affect the items you added; move template blocks together, or reset one at a time.`
                  : undefined
              }
            />
          ) : selectedExtra ? (
            <SchematicExtraProperties
              extra={selectedExtra}
              circuitLabel={selectedExtra.circuitId !== undefined ? circuitLabelOf(selectedExtra.circuitId) : undefined}
              symbolName={selectedExtra.symbolId !== undefined ? schematic?.symbols.find((sym) => sym.id === selectedExtra.symbolId)?.name : undefined}
              onChange={(patch) => updateExtra(selectedExtra.id, patch)}
              onEditDrawing={() => setDrawingExtraId(selectedExtra.id)}
              onDuplicate={duplicateSelectedExtra}
              onDelete={deleteSelectedExtra}
            />
          ) : selectedBlock ? (
            <SchematicBlockOverrideProperties
              block={selectedBlock}
              circuitLabel={selectedBlock.circuitId !== undefined ? circuitLabelOf(selectedBlock.circuitId) : undefined}
              onChange={(patch) => updateBlockOverride(selectedBlock.id, patch)}
              onReset={() => updateBlockOverride(selectedBlock.id, undefined)}
            />
          ) : (
            <p className="mep-schematic-hint mep-ws-empty">Nothing is selected. Click a shape or text you added, or a block the template drew, to select it. Double-click a text to type over it.</p>
          )}
        </aside>
      </div>
    );
  }

  return (
    <Dialog title={editingTemplate ? `Schematic template ${editingTemplate.name}` : 'Schematic'} onClose={closeUnlessBlocked} className="mep-modal--workspace" closeOnBackdropClick={false} header={header} isolateKeys>
      {body}
    </Dialog>
  );
}
