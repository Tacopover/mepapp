import { useState } from 'react';
import type { Vec2 } from '@mepapp/core';
import { Dialog } from './Dialog.js';

const UNITS = [
  { id: 'mm', label: 'mm', toMm: 1 },
  { id: 'cm', label: 'cm', toMm: 10 },
  { id: 'm', label: 'm', toMm: 1000 },
] as const;

export interface CalibrationDialogProps {
  /** The two points the user clicked, in page points — the dialog shows their distance. */
  p1: Vec2;
  p2: Vec2;
  /** Called with the entered distance converted to millimeters. */
  onSubmit: (distanceMm: number) => void;
  onCancel: () => void;
}

/** Asks for the real-world distance between the two calibration points. */
export function CalibrationDialog({ p1, p2, onSubmit, onCancel }: CalibrationDialogProps) {
  const [value, setValue] = useState('');
  const [unitId, setUnitId] = useState<(typeof UNITS)[number]['id']>('mm');
  const unit = UNITS.find((u) => u.id === unitId) ?? UNITS[0];
  const distanceMm = Number(value) * unit.toMm;
  const valid = value.trim() !== '' && Number.isFinite(distanceMm) && distanceMm > 0;
  const measuredPt = Math.hypot(p2.x - p1.x, p2.y - p1.y);

  const submit = () => {
    if (valid) onSubmit(distanceMm);
  };

  return (
    <Dialog
      title="Calibrate drawing"
      className="mep-modal--calibration"
      onClose={onCancel}
      actions={
        <>
          <button onClick={onCancel}>Cancel</button>
          <button onClick={submit} disabled={!valid}>
            Set calibration
          </button>
        </>
      }
    >
      <p className="mep-calibration-hint">
        Enter the real-world distance between the two points you clicked. Drawn length on the page: <b>{measuredPt.toFixed(1)} pt</b>.
      </p>
      <div className="mep-calibration-row">
        <input
          autoFocus
          type="number"
          min="0"
          step="any"
          placeholder="Distance"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <select value={unitId} onChange={(e) => setUnitId(e.target.value as typeof unitId)} aria-label="Unit">
          {UNITS.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
    </Dialog>
  );
}
