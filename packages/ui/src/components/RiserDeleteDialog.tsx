import { Dialog } from './Dialog.js';

export interface RiserDeleteDialogProps {
  label: string;
  onConfirm(): void;
  onCancel(): void;
}

export function RiserDeleteDialog({ label, onConfirm, onCancel }: RiserDeleteDialogProps) {
  return (
    <Dialog
      title="Delete riser"
      onClose={onCancel}
      actions={
        <>
          <button type="button" autoFocus onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="mep-btn-danger" onClick={onConfirm}>
            Delete riser
          </button>
        </>
      }
    >
      <p>Delete {label}? The fittings stay on the sheets.</p>
    </Dialog>
  );
}
