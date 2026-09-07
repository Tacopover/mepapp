import { useEffect, useRef, useState } from 'react';
import { IconFile, IconMenu } from '../icons.js';

export interface MenuButtonProps {
  onOpenPdf: (file: File) => void;
  onSaveProject: () => void;
  onLoadProject: (file: File) => void;
  onSyncToPdf: () => void;
  onDownloadPdf: () => void;
  pdfLoaded: boolean;
}

export function MenuButton({ onOpenPdf, onSaveProject, onLoadProject, onSyncToPdf, onDownloadPdf, pdfLoaded }: MenuButtonProps) {
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

  return (
    <div className="mep-menu" ref={rootRef}>
      <button type="button" className="mep-menu-btn" onClick={() => setOpen((o) => !o)}>
        <IconMenu size={15} /> Menu
      </button>
      {open && (
        <div className="mep-menu-dropdown">
          <label className="mep-menu-item">
            <IconFile size={13} /> Open PDF…
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onOpenPdf(file);
                setOpen(false);
              }}
            />
          </label>
          <div className="mep-menu-divider" />
          <button
            type="button"
            className="mep-menu-item"
            onClick={() => {
              onSaveProject();
              setOpen(false);
            }}
          >
            Save project
          </button>
          <label className="mep-menu-item">
            Load project…
            <input
              type="file"
              accept="application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onLoadProject(file);
                setOpen(false);
              }}
            />
          </label>
          <div className="mep-menu-divider" />
          <button
            type="button"
            className="mep-menu-item"
            disabled={!pdfLoaded}
            onClick={() => {
              onSyncToPdf();
              setOpen(false);
            }}
          >
            Sync to PDF
          </button>
          <button
            type="button"
            className="mep-menu-item"
            disabled={!pdfLoaded}
            onClick={() => {
              onDownloadPdf();
              setOpen(false);
            }}
          >
            Download PDF
          </button>
        </div>
      )}
    </div>
  );
}
