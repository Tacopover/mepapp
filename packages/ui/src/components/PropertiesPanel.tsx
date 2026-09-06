import type { RefObject } from 'react';
import type { SketchScene, StampInfo } from '@mepapp/render';

export interface PropertiesPanelProps {
  sceneRef: RefObject<SketchScene | null>;
  selection: StampInfo[];
  capacityInput: string;
  setCapacityInput: (value: string) => void;
}

export function PropertiesPanel({ sceneRef, selection, capacityInput, setCapacityInput }: PropertiesPanelProps) {
  if (selection.length === 0) {
    return <div className="mep-empty-panel">Select an element to see its properties.</div>;
  }
  if (selection.length > 1) {
    return <div className="mep-empty-panel">{selection.length} elements selected. Select one to edit its properties.</div>;
  }

  const stamp = selection[0];

  return (
    <div>
      <div className="mep-elem-row">
        <div>
          <b>Stamp · {stamp.id}</b>
          <span>{Math.round(stamp.nativeWidth)} × {Math.round(stamp.nativeHeight)} pt</span>
        </div>
      </div>
      <div className="mep-section">
        <h4>Transform</h4>
        <div className="mep-field-row">
          <label>X (pt)</label>
          <input
            type="number"
            value={Math.round(stamp.transform.position.x * 100) / 100}
            onChange={(e) => sceneRef.current?.setSelectedPosition({ x: Number(e.target.value), y: stamp.transform.position.y })}
          />
        </div>
        <div className="mep-field-row">
          <label>Y (pt)</label>
          <input
            type="number"
            value={Math.round(stamp.transform.position.y * 100) / 100}
            onChange={(e) => sceneRef.current?.setSelectedPosition({ x: stamp.transform.position.x, y: Number(e.target.value) })}
          />
        </div>
        <div className="mep-field-row">
          <label>Rotation</label>
          <input
            type="number"
            value={Math.round(stamp.transform.rotationDegrees * 1000) / 1000}
            onChange={(e) => sceneRef.current?.setSelectedRotationDegrees(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="mep-section">
        <h4>Flow</h4>
        <div className="mep-field-row">
          <label>Capacity</label>
          <input
            type="number"
            value={capacityInput}
            onChange={(e) => setCapacityInput(e.target.value)}
            onBlur={() => sceneRef.current?.setTerminalCapacity(stamp.id, Number(capacityInput) || 0)}
          />
        </div>
      </div>
    </div>
  );
}
