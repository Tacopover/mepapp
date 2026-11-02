import { Dialog } from './Dialog.js';

export interface DuplicateDocumentDialogProps {
  fileName: string;
  storedName: string;
  storedPath?: string;
  onUseAsCopy: () => void;
  onSameFile: () => void;
  onCancel: () => void;
}

/**
 * Asks the user what an opened PDF is when its document id matches a sheet of the open building.
 * "Use as a copy" gives the open document a new id. "Same file" moves the stored sheet to the open file.
 */
export function DuplicateDocumentDialog({ fileName, storedName, storedPath, onUseAsCopy, onSameFile, onCancel }: DuplicateDocumentDialogProps) {
  return (
    <Dialog
      title="This file looks like a copy"
      onClose={onCancel}
      closeOnBackdropClick={false}
      actions={
        <>
          <button type="button" data-testid="dup-copy" onClick={onUseAsCopy}>
            Use as a copy (new id)
          </button>
          <button type="button" data-testid="dup-same" onClick={onSameFile}>
            It is the same file (update the location)
          </button>
          <button type="button" data-testid="dup-cancel" onClick={onCancel}>
            Cancel
          </button>
        </>
      }
    >
      <p>
        "{fileName}" is the same document as the sheet "{storedName}" of the open building
        {storedPath && storedPath !== storedName ? ` (stored at ${storedPath})` : ''}.
      </p>
      <p className="mep-hint">
        Choose "Use as a copy" if you made a copy of the file: the copy gets its own new id. Choose "same file" if you moved or renamed the
        file.
      </p>
    </Dialog>
  );
}
