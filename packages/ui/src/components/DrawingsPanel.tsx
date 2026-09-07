import type { DocumentSummary } from '@mepapp/render';

export interface DrawingsPanelProps {
  documents: DocumentSummary[];
  activeDocumentId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

/** The Drawings tab: every open document, click to switch, "x" to close — see decisions log 2026-09-07's multi-document plan. */
export function DrawingsPanel({ documents, activeDocumentId, onActivate, onClose }: DrawingsPanelProps) {
  return (
    <div>
      <div className="mep-section">
        <h4>Open drawings ({documents.length})</h4>
      </div>
      {documents.length === 0 && <div className="mep-empty-panel">No drawings open.</div>}
      {documents.map((doc) => (
        <div
          key={doc.id}
          className={`mep-elem-row selectable${doc.id === activeDocumentId ? ' active' : ''}`}
          onClick={() => onActivate(doc.id)}
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
  );
}
