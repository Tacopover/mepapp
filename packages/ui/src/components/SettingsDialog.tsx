import { Dialog } from './Dialog.js';
import { NumberDraftInput } from './NumberDraftInput.js';
import { MAX_CEILING_HEIGHT_MM, MIN_CEILING_HEIGHT_MM } from './RoomProperties.js';

export interface SettingsDialogProps {
  snapRadiusPx: number;
  onChangeSnapRadiusPx: (px: number) => void;
  angleSnapDegrees: number;
  onChangeAngleSnapDegrees: (degrees: number) => void;
  /** Room detection: door gaps up to this width (mm) count as wall. */
  roomGapMm: number;
  onChangeRoomGapMm: (mm: number) => void;
  /** The default ceiling height (mm): the value of a room when the drawing, its room type and the room give none. */
  ceilingHeightMm: number;
  onChangeCeilingHeightMm: (mm: number) => void;
  onClose: () => void;
}

export const MIN_SNAP_RADIUS_PX = 4;
export const MAX_SNAP_RADIUS_PX = 40;
export const MIN_ANGLE_SNAP_DEGREES = 1;
export const MAX_ANGLE_SNAP_DEGREES = 90;

/** First real Dialog consumer beyond the calibration prompt (ui-atlas-layout-mapping.md §5/§7 D2) — Menu → Settings. */
export function SettingsDialog({ snapRadiusPx, onChangeSnapRadiusPx, angleSnapDegrees, onChangeAngleSnapDegrees, roomGapMm, onChangeRoomGapMm, ceilingHeightMm, onChangeCeilingHeightMm, onClose }: SettingsDialogProps) {
  return (
    <Dialog title="Settings" onClose={onClose} actions={<button onClick={onClose}>Close</button>}>
      <div className="mep-section">
        <h4>Drawing</h4>
        <div className="mep-field-row">
          <label>Segment snap radius (px)</label>
          <NumberDraftInput
            min={MIN_SNAP_RADIUS_PX}
            max={MAX_SNAP_RADIUS_PX}
            value={snapRadiusPx}
            allow={(px) => px >= MIN_SNAP_RADIUS_PX && px <= MAX_SNAP_RADIUS_PX}
            onCommit={onChangeSnapRadiusPx}
          />
        </div>
        <div className="mep-field-row">
          <label>Angle snap (degrees)</label>
          <NumberDraftInput
            min={MIN_ANGLE_SNAP_DEGREES}
            max={MAX_ANGLE_SNAP_DEGREES}
            value={angleSnapDegrees}
            allow={(degrees) => degrees >= MIN_ANGLE_SNAP_DEGREES && degrees <= MAX_ANGLE_SNAP_DEGREES}
            onCommit={onChangeAngleSnapDegrees}
          />
        </div>
      </div>
      <div className="mep-section">
        <h4>Rooms</h4>
        <div className="mep-field-row">
          <label>Door gap closed up to (mm)</label>
          <NumberDraftInput min={100} max={3000} step={100} value={roomGapMm} allow={(mm) => mm >= 100 && mm <= 3000} onCommit={onChangeRoomGapMm} />
        </div>
        <div className="mep-field-row">
          <label htmlFor="settings-ceiling-height">Default ceiling height (mm)</label>
          <NumberDraftInput
            id="settings-ceiling-height"
            min={MIN_CEILING_HEIGHT_MM}
            max={MAX_CEILING_HEIGHT_MM}
            step={100}
            value={ceilingHeightMm}
            allow={(mm) => mm >= MIN_CEILING_HEIGHT_MM && mm <= MAX_CEILING_HEIGHT_MM}
            onCommit={onChangeCeilingHeightMm}
          />
        </div>
        <p className="mep-settings-hint">A drawing, a room type in a drawing (Menu › Ceiling heights) and a room (Room Properties) can each use another height.</p>
      </div>
      <p className="mep-settings-hint">
        How close a click needs to be to an existing stamp or segment endpoint, in screen pixels, before the Draw network tool snaps onto it instead of
        starting a new endpoint. Angle snap locks a segment&apos;s heading to this increment while drawing; hold Shift to draw at a free angle instead.
      </p>
    </Dialog>
  );
}
