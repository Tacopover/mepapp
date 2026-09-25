import { getBlockHeight, getBlockWidth, type SchematicExtra } from '@mepapp/core';
import { NumberField } from './SchematicTemplateProperties.js';

export interface SchematicExtraPropertiesProps {
  extra: SchematicExtra;
  /** Name of the circuit that the extra follows, when it follows one. */
  circuitLabel?: string;
  /** Name of the library symbol that a drawing extra shows. */
  symbolName?: string;
  onChange: (patch: Partial<SchematicExtra>) => void;
  onEditDrawing: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const TYPE_LABELS: Record<string, string> = { drawing: 'Drawing', freeItem: 'Text' };
const noop = () => {};

/** The properties of one item that the user added to a schematic (electrical-schematic-templates.md Phase 5b-3). */
export function SchematicExtraProperties({ extra, circuitLabel, symbolName, onChange, onEditDrawing, onDuplicate, onDelete }: SchematicExtraPropertiesProps) {
  return (
    <details open className="mep-section">
      <summary>
        <h4>Added item · {TYPE_LABELS[extra.type] ?? extra.type}</h4>
      </summary>
      <p className="mep-schematic-hint">
        {circuitLabel !== undefined ? `Follows circuit ${circuitLabel}. Position is measured from that circuit.` : 'Fixed on the sheet. Position is measured from the top-left corner of the sheet.'}
      </p>
      <NumberField label="x (mm)" value={extra.x} onCommit={(v) => v !== undefined && onChange({ x: v })} onBlur={noop} step={0.5} />
      <NumberField label="y (mm)" value={extra.y} onCommit={(v) => v !== undefined && onChange({ y: v })} onBlur={noop} step={0.5} />
      <NumberField label="Width (mm)" value={extra.width} placeholder={String(getBlockWidth(extra))} onCommit={(v) => onChange({ width: v })} onBlur={noop} optional min={0.1} step={0.5} />
      <NumberField label="Height (mm)" value={extra.height} placeholder={String(getBlockHeight(extra))} onCommit={(v) => onChange({ height: v })} onBlur={noop} optional min={0.1} step={0.5} />
      <NumberField label="Rotation (degrees)" value={extra.rotation} onCommit={(v) => v !== undefined && onChange({ rotation: v })} onBlur={noop} step={5} />
      {extra.type === 'freeItem' && (
        <div className="mep-schematic-field">
          <label htmlFor="sch-extra-text">Text</label>
          <textarea id="sch-extra-text" rows={2} value={extra.binding ?? ''} onChange={(e) => onChange({ binding: e.target.value })} />
          <span className="mep-schematic-hint">Write {'{field.name}'} to show a field value.</span>
        </div>
      )}
      {extra.type === 'drawing' && extra.symbolId !== undefined && <p className="mep-schematic-hint">Symbol: {symbolName ?? 'missing from the schematic'}</p>}
      <div className="mep-schematic-buttons">
        {extra.type === 'drawing' && extra.symbolId === undefined && (
          <button type="button" onClick={onEditDrawing}>
            Edit drawing…
          </button>
        )}
        <button type="button" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </details>
  );
}
