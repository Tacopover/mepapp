import { useEffect, useRef, useState, type ReactNode } from 'react';

export type WorkspaceMenuItem = { label: string; onClick: () => void; disabled?: boolean; title?: string } | 'divider';

export interface WorkspaceMenuProps {
  label: ReactNode;
  /** Names the menu button for assistive technology and in its tooltip. */
  title: string;
  items: WorkspaceMenuItem[];
}

/** A drop-down menu in the schematic workspace header. It uses the look of the app's main Menu. */
export function WorkspaceMenu({ label, title, items }: WorkspaceMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    // Capture phase, so this Escape closes only the menu and not the workspace.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <div className="mep-menu" ref={rootRef}>
      <button type="button" className="mep-ws-menu-btn" aria-haspopup="menu" aria-expanded={open} aria-label={title} title={title} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div className="mep-menu-dropdown" role="menu">
          {items.map((item, i) =>
            item === 'divider' ? (
              <div key={`divider-${i}`} className="mep-menu-divider" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="mep-menu-item"
                disabled={item.disabled}
                title={item.title}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
