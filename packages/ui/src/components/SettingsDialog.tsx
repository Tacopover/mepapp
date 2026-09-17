import { Dialog } from './Dialog.js';

export interface SettingsDialogProps {
  snapRadiusPx: number;
  onChangeSnapRadiusPx: (px: number) => void;
  angleSnapDegrees: number;
  onChangeAngleSnapDegrees: (degrees: number) => void;
  onClose: () => void;
}

export const MIN_SNAP_RADIUS_PX = 4;
export const MAX_SNAP_RADIUS_PX = 40;
export const MIN_ANGLE_SNAP_DEGREES = 1;
export const MAX_ANGLE_SNAP_DEGREES = 90;

/** First real Dialog consumer beyond the calibration prompt (ui-atlas-layout-mapping.md §5/§7 D2) — Menu → Settings. */
export function SettingsDialog({ snapRadiusPx, onChangeSnapRadiusPx, angleSnapDegrees, onChangeAngleSnapDegrees, onClose }: SettingsDialogProps) {
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
        <div className="mep-field-row">
          <label>Angle snap (degrees)</label>
          <input
            type="number"
            min={MIN_ANGLE_SNAP_DEGREES}
            max={MAX_ANGLE_SNAP_DEGREES}
            value={angleSnapDegrees}
            onChange={(event) => {
              const raw = Number(event.target.value);
              const clamped = Math.min(MAX_ANGLE_SNAP_DEGREES, Math.max(MIN_ANGLE_SNAP_DEGREES, Number.isFinite(raw) ? raw : MIN_ANGLE_SNAP_DEGREES));
              onChangeAngleSnapDegrees(clamped);
            }}
          />
        </div>
      </div>
      <p className="mep-settings-hint">
        How close a click needs to be to an existing stamp or segment endpoint, in screen pixels, before the Draw network tool snaps onto it instead of
        starting a new endpoint. Angle snap locks a segment&apos;s heading to this increment while drawing; hold Shift to draw at a free angle instead.
      </p>
    </Dialog>
  );
}
