import type { Calibration } from '@mepapp/core';
import type { DrawingSummary } from '@mepapp/render';

export interface StatusBarProps {
  zoom: number;
  onZoomBy: (factor: number) => void;
  onResetZoom: () => void;
  pageIndex: number;
  pageCount: number;
  onChangePage: (pageIndex: number) => void;
  calibration: Calibration | null;
  measurementMm: number | null;
  selectedCount: number;
  drawingSummary: DrawingSummary;
}

export function StatusBar({
  zoom,
  onZoomBy,
  onResetZoom,
  pageIndex,
  pageCount,
  onChangePage,
  calibration,
  measurementMm,
  selectedCount,
  drawingSummary,
}: StatusBarProps) {
  return (
    <div className="mep-status">
      <span className="mep-chip mep-zoom-chip">
        <button type="button" onClick={() => onZoomBy(1 / 1.2)} title="Zoom out">
          −
        </button>
        Zoom{' '}
        <b className="mep-zoom-reset" onClick={onResetZoom} title="Reset to 100%">
          {Math.round(zoom * 100)}%
        </b>
        <button type="button" onClick={() => onZoomBy(1.2)} title="Zoom in">
          +
        </button>
      </span>
      {pageCount > 1 && (
        <span className="mep-chip mep-page-chip">
          <button type="button" disabled={pageIndex === 0} onClick={() => onChangePage(pageIndex - 1)} title="Previous page">
            ‹
          </button>
          Page <b>{pageIndex + 1}</b> of {pageCount}
          <button type="button" disabled={pageIndex === pageCount - 1} onClick={() => onChangePage(pageIndex + 1)} title="Next page">
            ›
          </button>
        </span>
      )}
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
        {drawingSummary.fittingCount === 1 ? '' : 's'}, {drawingSummary.annotationCount} annotation{drawingSummary.annotationCount === 1 ? '' : 's'},{' '}
        {drawingSummary.networkCount} network{drawingSummary.networkCount === 1 ? '' : 's'}
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
