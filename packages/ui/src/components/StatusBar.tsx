import type { Calibration } from '@mepapp/core';
import type { DrawingSummary } from '@mepapp/render';

export interface StatusBarProps {
  zoom: number;
  calibration: Calibration | null;
  measurementMm: number | null;
  selectedCount: number;
  drawingSummary: DrawingSummary;
}

export function StatusBar({ zoom, calibration, measurementMm, selectedCount, drawingSummary }: StatusBarProps) {
  return (
    <div className="mep-status">
      <span className="mep-chip">
        Zoom <b>{Math.round(zoom * 100)}%</b>
      </span>
      <span className="mep-chip">
        Units <b>{calibration ? 'mm' : 'pt (uncalibrated)'}</b>
      </span>
      {calibration && (
        <span className="mep-chip">
          Scale <b>{calibration.pageUnitsPerRealUnit.toFixed(4)} pt/mm</b>
        </span>
      )}
      {measurementMm !== null && (
        <span className="mep-chip">
          Last measurement <b>{measurementMm.toFixed(2)} mm</b>
        </span>
      )}
      <span className="mep-chip">
        {drawingSummary.segmentCount} segment{drawingSummary.segmentCount === 1 ? '' : 's'}, {drawingSummary.fittingCount} fitting
        {drawingSummary.fittingCount === 1 ? '' : 's'}, {drawingSummary.networkCount} network{drawingSummary.networkCount === 1 ? '' : 's'}
      </span>
      <span className="mep-scale-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <div className="mep-fill" />
      <span>{selectedCount} selected</span>
    </div>
  );
}
