import { Dialog } from './Dialog.js';

export interface SaveBeforeExportDialogProps {
  /** True when the drawing has no file yet: Save then asks for a file name. */
  needsSaveAs: boolean;
  onSave: () => void;
  onCancel: () => void;
}

/** Asks the user to save the drawing before a Level or Building export, because that export reads the saved file. */
export function SaveBeforeExportDialog({ needsSaveAs, onSave, onCancel }: SaveBeforeExportDialogProps) {
  return (
    <Dialog
      title="Save before export"
      onClose={onCancel}
      closeOnBackdropClick={false}
      actions={
        <>
          <button onClick={onCancel}>Cancel</button>
          <button autoFocus onClick={onSave}>
            Save
          </button>
        </>
      }
    >
      <p>Save the drawing first so the export can be made?</p>
      {needsSaveAs && <p className="mep-hint">The drawing has no file yet. You choose a file name in the next step.</p>}
    </Dialog>
  );
}
