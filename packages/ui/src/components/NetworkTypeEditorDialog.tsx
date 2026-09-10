import { useState } from 'react';
import type { LinePattern, NetworkType } from '@mepapp/core';
import { Dialog } from './Dialog.js';

export type NetworkTypeVisualsPatch = Pick<NetworkType, 'color' | 'lineWidthPt' | 'linePattern'>;

export interface NetworkTypeEditorDialogProps {
  networkType: NetworkType;
  onSave: (id: string, patch: NetworkTypeVisualsPatch) => void;
  onClose: () => void;
}

const LINE_PATTERNS: LinePattern[] = ['solid', 'dashed', 'dotted'];

/** Edits a network type's drawn visuals (color/thickness/pattern) — every segment tagged with this type re-renders immediately on Save, via SketchScene.updateNetworkTypeVisuals. Modeled on ElementEditorDialog/GlobalPropertiesDialog's local-draft + explicit Save pattern. */
export function NetworkTypeEditorDialog({ networkType, onSave, onClose }: NetworkTypeEditorDialogProps) {
  const [color, setColor] = useState(networkType.color);
  const [lineWidthPt, setLineWidthPt] = useState(networkType.lineWidthPt);
  const [linePattern, setLinePattern] = useState<LinePattern>(networkType.linePattern);

  function handleSave() {
    onSave(networkType.id, { color, lineWidthPt, linePattern });
  }

  return (
    <Dialog
      title={`${networkType.name} visuals`}
      onClose={onClose}
      actions={
        <>
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleSave}>Save</button>
        </>
      }
    >
      <div className="mep-section">
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
            {LINE_PATTERNS.map((pattern) => (
              <option key={pattern} value={pattern}>
                {pattern[0].toUpperCase() + pattern.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Dialog>
  );
}
