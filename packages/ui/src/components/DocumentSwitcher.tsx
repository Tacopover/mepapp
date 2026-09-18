import { useEffect, useRef, useState } from 'react';
import type { DocumentSummary } from '@mepapp/render';
import { IconChevDown } from '../icons.js';

export interface DocumentSwitcherProps {
  documents: DocumentSummary[];
  activeDocumentId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

/**
 * Header-row companion to the Drawings dock tab — same documents/activate/close
 * model (see App.tsx's handleActivateDocument/handleCloseDocument), just surfaced
 * compactly so the active document's name keeps the header's full readable width.
 * Other open documents live behind a small "+N" button, never competing with it.
 */
export function DocumentSwitcher({ documents, activeDocumentId, onActivate, onClose }: DocumentSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const active = documents.find((d) => d.id === activeDocumentId) ?? null;
  const others = documents.filter((d) => d.id !== activeDocumentId);

  return (
    <div className="mep-doc-switcher" ref={rootRef}>
      {active?.isDirty && <span className="mep-doc-dirty-dot" title="Unsynced changes" />}
      <span className="mep-title">{active ? active.fileName : 'No sheet loaded'}</span>
      {others.length > 0 && (
        <button
          type="button"
          className="mep-doc-switcher-btn"
          title={`${others.length} more open drawing${others.length === 1 ? '' : 's'}`}
          onClick={() => setOpen((o) => !o)}
        >
          +{others.length}
          <IconChevDown size={10} />
        </button>
      )}
      {open && (
        <div className="mep-doc-switcher-dropdown">
          {others.map((doc) => (
            <div
              key={doc.id}
              className="mep-elem-row selectable"
              onClick={() => {
                onActivate(doc.id);
                setOpen(false);
              }}
            >
              {doc.isDirty && <span className="mep-doc-dirty-dot" title="Unsynced changes" />}
              <div style={{ flex: 1 }}>
                <b>{doc.fileName}</b>
                <span>{doc.hasPdf ? 'PDF loaded' : 'No PDF yet'}</span>
              </div>
              <button
                type="button"
                className="mep-doc-close"
                title={`Close ${doc.fileName}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(doc.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
