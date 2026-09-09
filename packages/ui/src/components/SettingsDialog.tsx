import { Dialog } from './Dialog.js';

export interface SettingsDialogProps {
  snapRadiusPx: number;
  onChangeSnapRadiusPx: (px: number) => void;
  onClose: () => void;
}

export const MIN_SNAP_RADIUS_PX = 4;
export const MAX_SNAP_RADIUS_PX = 40;

/** First real Dialog consumer beyond the calibration prompt (ui-atlas-layout-mapping.md §5/§7 D2) — Menu → Settings. */
export function SettingsDialog({ snapRadiusPx, onChangeSnapRadiusPx, onClose }: SettingsDialogProps) {
  return (
    <Dialog title="Settings" onClose={onClose} actions={<button onClick={onClose}>Close</button>}>
      <div className="mep-section">
        <h4>Drawing</h4>
        <div className="mep-field-row">
          <label>Segment snap radius (px)</label>
          <input
            type="number"
            min={MIN_SNAP_RADIUS_PX}
            max={MAX_SNAP_RADIUS_PX}
            value={snapRadiusPx}
            onChange={(event) => {
              const raw = Number(event.target.value);
              const clamped = Math.min(MAX_SNAP_RADIUS_PX, Math.max(MIN_SNAP_RADIUS_PX, Number.isFinite(raw) ? raw : MIN_SNAP_RADIUS_PX));
              onChangeSnapRadiusPx(clamped);
            }}
          />
        </div>
      </div>
      <p className="mep-settings-hint">
        How close a click needs to be to an existing stamp or segment endpoint, in screen pixels, before the Draw network tool snaps onto it instead of
        starting a new endpoint.
      </p>
    </Dialog>
  );
}
