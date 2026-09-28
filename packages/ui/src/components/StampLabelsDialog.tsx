import { useState } from 'react';
import type { PlacedStamp, StampDefinition, StampLabel, StampPropertyContext } from '@mepapp/core';
import { Dialog } from './Dialog.js';
import { StampLabelsEditor } from './StampLabelsEditor.js';

export interface StampLabelsDialogProps {
  definition: StampDefinition;
  /** The stamp's art, already resolved to a fetchable URL. */
  iconUrl: string;
  /** The placed stamp the dialog was opened from — the preview shows its real values. */
  stamp: PlacedStamp;
  initialLabels: StampLabel[];
  propertyContext: StampPropertyContext;
  /** Receives the whole new layout for `definition.id`. */
  onSave: (labels: StampLabel[]) => void;
  onClose: () => void;
}

/**
 * "Edit labels…" from a placed stamp's Properties panel (label-feature.md §7).
 * Works for library and custom definitions alike, because a label layout is
 * stored on the project, not on the definition. The layout applies to every
 * stamp placed from the same definition.
 */
export function StampLabelsDialog({ definition, iconUrl, stamp, initialLabels, propertyContext, onSave, onClose }: StampLabelsDialogProps) {
  const [labels, setLabels] = useState(initialLabels);
  return (
    <Dialog
      title={`Labels · ${definition.label}`}
      onClose={onClose}
      closeOnBackdropClick={false}
      className="mep-modal--wide"
      actions={
        <>
          <button onClick={onClose}>Cancel</button>
          <button onClick={() => onSave(labels)}>Save</button>
        </>
      }
    >
      <div className="mep-lbl-dialog-body">
        <p className="mep-hint">The layout applies to every stamp placed from this element.</p>
        <StampLabelsEditor
          category={stamp.category}
          nativeWidth={stamp.nativeWidth}
          nativeHeight={stamp.nativeHeight}
          renderArtwork={(widthPx, heightPx) => <image href={iconUrl} width={widthPx} height={heightPx} preserveAspectRatio="none" />}
          initialLabels={initialLabels}
          onChange={setLabels}
          propertyContext={propertyContext}
          sampleStamp={stamp}
        />
      </div>
    </Dialog>
  );
}
