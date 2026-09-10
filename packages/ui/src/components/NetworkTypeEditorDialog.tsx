import { useState } from 'react';
import type { LinePattern, NetworkType } from '@mepapp/core';
import { Dialog } from './Dialog.js';

export type NetworkTypeEditPatch = Partial<Pick<NetworkType, 'name' | 'color' | 'lineWidthPt' | 'linePattern'>>;

export interface NetworkTypeEditorDialogProps {
  networkType: NetworkType;
  onSave: (id: string, patch: NetworkTypeEditPatch) => void;
  /** Clones networkType into a brand-new "<name>_copy" type — see SketchScene.duplicateNetworkType. The caller retargets this same dialog at the new copy (pass a new `key` so local state re-seeds) rather than closing it. */
  onDuplicate: (id: string) => void;
  onClose: () => void;
}

const LINE_PATTERNS: Array<{ value: LinePattern; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'dashDot', label: 'Dash-Dot' },
  { value: 'longDash', label: 'Long Dash' },
  { value: 'dashDotDot', label: 'Dash-Dot-Dot' },
];

/** Edits a network type's name and drawn visuals (color/thickness/pattern) — every segment tagged with this type re-renders immediately on Save, via SketchScene.updateNetworkType. Modeled on ElementEditorDialog/GlobalPropertiesDialog's local-draft + explicit Save pattern. */
export function NetworkTypeEditorDialog({ networkType, onSave, onDuplicate, onClose }: NetworkTypeEditorDialogProps) {
  const [name, setName] = useState(networkType.name);
  const [color, setColor] = useState(networkType.color);
  const [lineWidthPt, setLineWidthPt] = useState(networkType.lineWidthPt);
  const [linePattern, setLinePattern] = useState<LinePattern>(networkType.linePattern);

  function handleSave() {
    onSave(networkType.id, { name: name.trim() || networkType.name, color, lineWidthPt, linePattern });
  }

  return (
    <Dialog
      title={`${networkType.name} visuals`}
      onClose={onClose}
      actions={
        <>
          <button onClick={onClose}>Cancel</button>
          <button onClick={() => onDuplicate(networkType.id)} title="Create a copy of this network type">
            Duplicate
          </button>
          <button onClick={handleSave}>Save</button>
        </>
      }
    >
      <div className="mep-section">
        <div className="mep-field-row">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="mep-field-row">
          <label>Color</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <div className="mep-field-row">
          <label>Thickness (pt)</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={lineWidthPt}
            onChange={(e) => setLineWidthPt(Number(e.target.value))}
          />
        </div>
        <div className="mep-field-row">
          <label>Pattern</label>
          <select value={linePattern} onChange={(e) => setLinePattern(e.target.value as LinePattern)}>
            {LINE_PATTERNS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Dialog>
  );
}
