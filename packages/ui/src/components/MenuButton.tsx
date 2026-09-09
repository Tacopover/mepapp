import { useEffect, useRef, useState } from 'react';
import { IconFile, IconMenu } from '../icons.js';

export interface MenuButtonProps {
  onOpenPdf: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpenSettings: () => void;
  pdfLoaded: boolean;
}

export function MenuButton({ onOpenPdf, onSave, onSaveAs, onOpenSettings, pdfLoaded }: MenuButtonProps) {
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
          <button
            type="button"
            className="mep-menu-item"
            onClick={() => {
              onOpenPdf();
              setOpen(false);
            }}
          >
            <IconFile size={13} /> Open…
          </button>
          <div className="mep-menu-divider" />
          <button
            type="button"
            className="mep-menu-item"
            disabled={!pdfLoaded}
            onClick={() => {
              onSave();
              setOpen(false);
            }}
          >
            Save
          </button>
          <button
            type="button"
            className="mep-menu-item"
            disabled={!pdfLoaded}
            onClick={() => {
              onSaveAs();
              setOpen(false);
            }}
          >
            Save As…
          </button>
          <div className="mep-menu-divider" />
          <button
            type="button"
            className="mep-menu-item"
            onClick={() => {
              onOpenSettings();
              setOpen(false);
            }}
          >
            Settings…
          </button>
        </div>
      )}
    </div>
  );
}
