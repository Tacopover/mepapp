import { CONFLICT_MOVE_HELP, CONFLICT_SNAP_HELP, conflictBody, conflictTitle, type RiserConflictInfo } from '../riserActions.js';
import { Dialog } from './Dialog.js';

export interface RiserConflictDialogProps {
  info: RiserConflictInfo;
  onMoveHere(): void;
  onSnapBack(): void;
  onLater(): void;
}

export function RiserConflictDialog({ info, onMoveHere, onSnapBack, onLater }: RiserConflictDialogProps) {
  return (
    <Dialog
      title={conflictTitle(info.label)}
      onClose={onLater}
      closeOnBackdropClick={false}
      className="mep-modal--riser-conflict"
      actions={
        <div className="mep-conflict-footer">
          <div className="mep-conflict-buttons">
            <button type="button" autoFocus onClick={onLater}>
              Decide later
            </button>
            <button type="button" onClick={onSnapBack}>
              Snap back
            </button>
            <button type="button" className="primary" onClick={onMoveHere}>
              Move the riser here
            </button>
          </div>
          <p className="mep-conflict-help">{CONFLICT_MOVE_HELP}</p>
          <p className="mep-conflict-help">{CONFLICT_SNAP_HELP}</p>
        </div>
      }
    >
      <p>{conflictBody(info)}</p>
    </Dialog>
  );
}
