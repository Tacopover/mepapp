import { useRef } from 'react';
import {
  scaleDialogBody,
  scaleDialogTitle,
  scaleDisconnectHint,
  scaleDisconnectLabel,
  scaleRowChange,
  scaleSetAllHint,
  scaleSetAllLabel,
  type ScaleChangePlan,
} from '../riserScale.js';
import { Dialog } from './Dialog.js';

export interface RiserScaleDialogProps {
  plan: ScaleChangePlan;
  busy: boolean;
  onCancel(): void;
  onSetAll(): void;
  onDisconnect(): void;
}

export function RiserScaleDialog({ plan, busy, onCancel, onSetAll, onDisconnect }: RiserScaleDialogProps) {
  const mountedAt = useRef(Date.now());
  return (
    <Dialog
      title={scaleDialogTitle(plan)}
      onClose={onCancel}
      closeOnBackdropClick={false}
      className="mep-modal--scale-change"
      actions={
        <>
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={() => {
              // Ignore the keypress of the Enter that opened this dialog.
              if (Date.now() - mountedAt.current < 300) return;
              onCancel();
            }}
          >
            Cancel
          </button>
          <button type="button" className="primary" disabled={busy} onClick={onSetAll}>
            {scaleSetAllLabel(plan)}
          </button>
          <button type="button" className="mep-btn-danger" disabled={busy} onClick={onDisconnect}>
            {scaleDisconnectLabel(plan)}
          </button>
        </>
      }
    >
      <p>{scaleDialogBody(plan)}</p>
      <div className="mep-scale-rows">
        {plan.rows.map((row) => (
          <div className="mep-scale-row" key={row.sheetId}>
            <span className="mep-scale-name" title={row.levelName}>
              {row.levelName}
            </span>
            <span className="mep-scale-change">{scaleRowChange(row)}</span>
            <span className="mep-scale-open">{row.open ? 'open' : 'not open'}</span>
          </div>
        ))}
      </div>
      <p className="mep-hint">{scaleSetAllHint(plan)}</p>
      <p className="mep-hint">{scaleDisconnectHint(plan)}</p>
    </Dialog>
  );
}
