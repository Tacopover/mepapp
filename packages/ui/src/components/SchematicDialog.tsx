import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  SCHEMATIC_BLOCK_CATALOGUE,
  SCHEMATIC_TEMPLATE_LIBRARY,
  copyTemplate,
  countSymbolUses,
  createSchematic,
  generateFromSchematic,
  getSchematicTemplateStatus,
  getStampDefinition,
  refreshSchematicFromTemplate,
  setSchematicFieldValue,
  setTextOverride,
  todayIso,
  uniqueSchematicName,
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
import { SchematicBlockSvg } from '../schematicBlockSvg.js';
import { describeDiagnostics } from '../schematicDiagnostics.js';
import { buildSchematicTerminals } from '../schematicTerminals.js';
import { findTextBlockAt } from '../schematicTextEdit.js';
import { useSheetView } from '../useSheetView.js';
import { Dialog } from './Dialog.js';
import { SchematicFieldsForm } from './SchematicFieldsForm.js';
import { SchematicTemplateEditor } from './SchematicTemplateEditor.js';

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

  const { view, setSvg, fit, panHandlers, clientToSheet, mmPerPixel } = useSheetView({
    sheetWidthMm: sheetTemplate.sheet.widthMm,
    sheetHeightMm: sheetTemplate.sheet.heightMm,
    resetKey: `${schematic?.id ?? ''}:${sheetTemplate.sheet.widthMm}x${sheetTemplate.sheet.heightMm}`,
  });

  // The dialog's own Escape closes everything; while the text bar is open Escape only closes the bar.
  useEffect(() => {
    if (!textEdit) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setTextEdit(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [textEdit]);

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
          initialPanelId={panelId}
          onDone={() => setEditingTemplateId(null)}
        />
      </Dialog>
    );
  }

  const overriddenBlocks: ResolvedBlock[] = generated?.blocks.filter((b) => b.overridden) ?? [];

  return (
    <Dialog title="Schematic" onClose={onClose} className="mep-modal--wide" closeOnBackdropClick={false} actions={<button onClick={onClose}>Close</button>}>
      <div className="mep-schematic">
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
              <span className="mep-schematic-hint">Scroll to zoom, drag to pan, double-click a text to type over it.</span>
            </div>

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
              <svg
                ref={setSvg}
                className="mep-schematic-canvas"
                role="img"
                aria-label={`Schematic of panel ${panel.name}`}
                viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
                onDoubleClick={openTextEdit}
                {...panHandlers}
              >
                <rect x={0} y={0} width={sheetTemplate.sheet.widthMm} height={sheetTemplate.sheet.heightMm} fill="#ffffff" stroke="#9aa3ad" strokeWidth={0.4} />
                {generated?.blocks.map((block) => (
                  <SchematicBlockSvg key={block.id} block={block} loadShapes={block.type === 'loadSymbol' ? loadShapesFor(block.loadStampDefinitionId) : undefined} symbolShapes={symbolShapesFor(block.symbolId)} />
                ))}
                {overriddenBlocks.map((block) => (
                  <circle key={`override-${block.id}`} className="mep-schematic-override-mark" cx={block.x} cy={block.y} r={mmPerPixel * 3} fill="#d9822b" pointerEvents="none">
                    <title>Text typed over the template</title>
                  </circle>
                ))}
              </svg>
              <div className="mep-schematic-side">
                <SchematicFieldsForm fields={generated?.fields ?? []} onChange={changeField} />
              </div>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
