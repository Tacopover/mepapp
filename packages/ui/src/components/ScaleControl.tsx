import { useState } from 'react';
import { PRESET_SCALE_DENOMINATORS, scaleDenominatorFromCalibration, type Calibration } from '@mepapp/core';
import { Dialog } from './Dialog.js';

const CUSTOM = 'custom';
const CALIBRATED = 'calibrated';
const UNSET = 'unset';

export interface ScaleControlProps {
  calibration: Calibration | null;
  /** Sets the drawing scale to 1:denominator. */
  onSetScale: (denominator: number) => void;
}

/** Status bar scale picker: predefined 1:N scales plus a custom value. A two-point calibration that matches no preset shows as its own entry. */
export function ScaleControl({ calibration, onSetScale }: ScaleControlProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const denominator = calibration ? scaleDenominatorFromCalibration(calibration) : null;
  const matchedPreset = denominator === null ? undefined : PRESET_SCALE_DENOMINATORS.find((p) => Math.abs(denominator / p - 1) < 0.001);
  const selected = !calibration ? UNSET : matchedPreset !== undefined ? String(matchedPreset) : CALIBRATED;

  const customValue = Number(customInput);
  const customValid = customInput.trim() !== '' && Number.isFinite(customValue) && customValue > 0;
  const closeCustom = () => {
    setCustomOpen(false);
    setCustomInput('');
  };
  const submitCustom = () => {
    if (!customValid) return;
    onSetScale(customValue);
    closeCustom();
  };

  return (
    <>
      <span className="mep-chip" title={calibration ? `${calibration.pageUnitsPerRealUnit.toFixed(5)} pt per real mm` : 'No scale set — measurements are in pt'}>
        Scale{' '}
        <select
          className="mep-scale-select"
          value={selected}
          onChange={(e) => {
            if (e.target.value === CUSTOM) setCustomOpen(true);
            else if (e.target.value !== UNSET && e.target.value !== CALIBRATED) onSetScale(Number(e.target.value));
          }}
          aria-label="Drawing scale"
        >
          {selected === UNSET && <option value={UNSET}>Not set</option>}
          {selected === CALIBRATED && denominator !== null && <option value={CALIBRATED}>{`1:${Math.round(denominator)} (calibrated)`}</option>}
          {PRESET_SCALE_DENOMINATORS.map((p) => (
            <option key={p} value={p}>{`1:${p}`}</option>
          ))}
          <option value={CUSTOM}>Custom…</option>
        </select>
      </span>
      {customOpen && (
        <Dialog
          title="Custom scale"
          className="mep-modal--calibration"
          onClose={closeCustom}
          actions={
            <>
              <button onClick={closeCustom}>Cancel</button>
              <button onClick={submitCustom} disabled={!customValid}>
                Set scale
              </button>
            </>
          }
        >
          <p className="mep-calibration-hint">Enter the drawing scale as 1 : N. This assumes the PDF is at its true paper size.</p>
          <div className="mep-calibration-row">
            <span className="mep-calibration-prefix">1 :</span>
            <input
              autoFocus
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 75"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCustom();
              }}
            />
          </div>
        </Dialog>
      )}
    </>
  );
}
