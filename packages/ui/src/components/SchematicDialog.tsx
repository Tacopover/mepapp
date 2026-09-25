import { useMemo, useState } from 'react';
import {
  SCHEMATIC_TEMPLATE_LIBRARY,
  copyTemplate,
  countSymbolUses,
  generateSchematic,
  getStampDefinition,
  type Circuit,
  type CircuitType,
  type Panel,
  type PanelSection,
  type SchematicSymbol,
  type SchematicTemplate,
  type StampDefinition,
} from '@mepapp/core';
import type { StampInfo } from '@mepapp/render';
import { SchematicBlockSvg } from '../schematicBlockSvg.js';
import { describeDiagnostics } from '../schematicDiagnostics.js';
import { buildSchematicTerminals } from '../schematicTerminals.js';
import { useSheetView } from '../useSheetView.js';
import { Dialog } from './Dialog.js';
import { SchematicTemplateEditor } from './SchematicTemplateEditor.js';

export interface SchematicDialogProps {
  panels: Panel[];
  circuits: Circuit[];
  panelSections: PanelSection[];
  circuitTypes: CircuitType[];
  stamps: StampInfo[];
  customStampDefinitions: StampDefinition[];
  initialPanelId: string;
  /** The user's own templates, listed after the built-in ones. Built-in templates cannot be edited; "Edit template" copies one first. */
  customTemplates: SchematicTemplate[];
  onCustomTemplatesChange: (templates: SchematicTemplate[]) => void;
  /** The user's own symbols (shared-drawing-tool.md Phase 4). A `drawing` block that names one draws its art. */
  customSymbols: SchematicSymbol[];
  onCustomSymbolsChange: (symbols: SchematicSymbol[]) => void;
  templateId: string;
  onTemplateIdChange: (id: string) => void;
  onClose: () => void;
}

/**
 * The generated distribution board schedule for one panel (electrical-schematic-templates.md
 * Phase 4): the panel's circuits laid out by a template and drawn as SVG in sheet millimetres. It
 * regenerates from the props on every render, so it always shows the current circuits and terminals.
 * "Edit template…" swaps the view for the template editor (Phase 5). Export is Phase 6.
 */
export function SchematicDialog({ panels, circuits, panelSections, circuitTypes, stamps, customStampDefinitions, initialPanelId, customTemplates, onCustomTemplatesChange, customSymbols, onCustomSymbolsChange, templateId, onTemplateIdChange, onClose }: SchematicDialogProps) {
  const [panelId, setPanelId] = useState(initialPanelId);
  const [editing, setEditing] = useState(false);
  const panel = panels.find((p) => p.id === panelId) ?? panels[0];
  const allTemplates = [...SCHEMATIC_TEMPLATE_LIBRARY, ...customTemplates];
  const template = allTemplates.find((t) => t.id === templateId) ?? SCHEMATIC_TEMPLATE_LIBRARY[0];
  const isCustom = customTemplates.some((t) => t.id === template.id);

  const terminals = useMemo(() => buildSchematicTerminals(stamps, customStampDefinitions), [stamps, customStampDefinitions]);
  const generated = useMemo(
    () => (panel ? generateSchematic({ panel, circuits, sections: panelSections, terminals, circuitTypes }, template) : undefined),
    [panel, circuits, panelSections, terminals, circuitTypes, template],
  );

  const { view, setSvg, fit, panHandlers } = useSheetView({ sheetWidthMm: template.sheet.widthMm, sheetHeightMm: template.sheet.heightMm, resetKey: `${template.id}:${template.sheet.widthMm}x${template.sheet.heightMm}` });

  const loadShapesFor = (definitionId: string | undefined) => (definitionId ? getStampDefinition(definitionId, customStampDefinitions)?.shapes : undefined);
  const symbolShapesFor = (symbolId: string | undefined) => (symbolId ? customSymbols.find((s) => s.id === symbolId)?.shapes : undefined);

  const notes = generated ? describeDiagnostics(generated.diagnostics, circuits, panel) : [];
  const memberCount = panel ? circuits.filter((c) => c.panelId === panel.id).length : 0;

  function copyOfTemplate(): SchematicTemplate {
    const copy = copyTemplate(template, allTemplates);
    onCustomTemplatesChange([...customTemplates, copy]);
    onTemplateIdChange(copy.id);
    return copy;
  }

  function deleteTemplate() {
    if (!isCustom || !window.confirm(`Delete the template "${template.name}"?`)) return;
    onCustomTemplatesChange(customTemplates.filter((t) => t.id !== template.id));
    onTemplateIdChange(SCHEMATIC_TEMPLATE_LIBRARY[0].id);
  }

  if (editing && isCustom) {
    return (
      <Dialog title="Schematic template" onClose={onClose} className="mep-modal--wide mep-modal--full" closeOnBackdropClick={false} actions={<button onClick={onClose}>Close</button>}>
        <SchematicTemplateEditor
          key={template.id}
          initialTemplate={template}
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
          initialPanelId={panel?.id ?? initialPanelId}
          onDone={() => setEditing(false)}
        />
      </Dialog>
    );
  }

  return (
    <Dialog title="Schematic" onClose={onClose} className="mep-modal--wide" closeOnBackdropClick={false} actions={<button onClick={onClose}>Close</button>}>
      <div className="mep-schematic">
        <div className="mep-schematic-bar">
          <label>
            Panel
            <select value={panel?.id ?? ''} onChange={(event) => setPanelId(event.target.value)} disabled={panels.length === 0}>
              {panels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Template
            <select value={template.id} onChange={(event) => onTemplateIdChange(event.target.value)} title={template.description}>
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
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              if (!isCustom) copyOfTemplate();
              setEditing(true);
            }}
            title={isCustom ? 'Edit this template' : 'Built-in templates cannot change. This makes a copy and edits the copy.'}
          >
            Edit template…
          </button>
          <button type="button" onClick={copyOfTemplate}>
            Duplicate template
          </button>
          <button type="button" onClick={deleteTemplate} disabled={!isCustom} title={isCustom ? 'Delete this template' : 'Built-in templates cannot be deleted.'}>
            Delete template
          </button>
          <button type="button" onClick={fit}>
            Fit to sheet
          </button>
          <span className="mep-schematic-hint">Scroll to zoom, drag to pan.</span>
        </div>

        {!panel ? (
          <p className="mep-schematic-empty">There is no panel yet. Convert an Equipment stamp to a panel first, then add circuits to it.</p>
        ) : (
          <>
            {memberCount === 0 && <p className="mep-schematic-note">This panel has no circuits yet, so only the panel-level blocks are shown.</p>}
            {notes.map((note, i) => (
              <p key={i} className="mep-schematic-note" role="status">
                {note}
              </p>
            ))}
            <svg ref={setSvg} className="mep-schematic-canvas" role="img" aria-label={`Schematic of panel ${panel.name}`} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} {...panHandlers}>
              <rect x={0} y={0} width={template.sheet.widthMm} height={template.sheet.heightMm} fill="#ffffff" stroke="#9aa3ad" strokeWidth={0.4} />
              {generated?.blocks.map((block) => (
                <SchematicBlockSvg key={block.id} block={block} loadShapes={block.type === 'loadSymbol' ? loadShapesFor(block.loadStampDefinitionId) : undefined} symbolShapes={symbolShapesFor(block.symbolId)} />
              ))}
            </svg>
          </>
        )}
      </div>
    </Dialog>
  );
}
