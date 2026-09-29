import { SCHEMATIC_BLOCK_CATALOGUE, type ResolvedBlock, type SchematicBlockOverride } from '@mepapp/core';
import { NumberField } from './SchematicTemplateProperties.js';

export interface SchematicBlockOverridePropertiesProps {
  block: ResolvedBlock;
  /** Name of the circuit that the block belongs to, when it belongs to one. */
  circuitLabel?: string;
  onChange: (patch: Partial<SchematicBlockOverride>) => void;
  onReset: () => void;
}

const noop = () => {};

/** The properties of one generated block that the user dragged in Schematic mode (electrical-schematic-templates.md Phase 7 round 2). Position, rotation and size read and write through `Schematic.blockOverrides`, keyed by this block's own resolved id, so only this circuit's copy moves. */
export function SchematicBlockOverrideProperties({ block, circuitLabel, onChange, onReset }: SchematicBlockOverridePropertiesProps) {
  return (
    <div className="mep-section">
      <h4>{SCHEMATIC_BLOCK_CATALOGUE[block.type].label}</h4>
      <p className="mep-schematic-hint">{circuitLabel !== undefined ? `Follows circuit ${circuitLabel}. Moving it moves only this circuit's copy.` : 'Fixed on the sheet. Position is measured from the top-left corner of the sheet.'}</p>
      <NumberField label="x (mm)" value={block.x} onCommit={(v) => v !== undefined && onChange({ x: v })} onBlur={noop} step={0.5} />
      <NumberField label="y (mm)" value={block.y} onCommit={(v) => v !== undefined && onChange({ y: v })} onBlur={noop} step={0.5} />
      <NumberField label="Width (mm)" value={block.width} onCommit={(v) => v !== undefined && onChange({ width: v })} onBlur={noop} min={0.1} step={0.5} />
      <NumberField label="Height (mm)" value={block.height} onCommit={(v) => v !== undefined && onChange({ height: v })} onBlur={noop} min={0.1} step={0.5} />
      <NumberField label="Rotation (degrees)" value={block.rotation} onCommit={(v) => v !== undefined && onChange({ rotation: v })} onBlur={noop} step={5} />
      <div className="mep-schematic-buttons">
        <button type="button" onClick={onReset} disabled={!block.moved} title="Put this block back where the template puts it">
          Reset to template position
        </button>
      </div>
    </div>
  );
}
