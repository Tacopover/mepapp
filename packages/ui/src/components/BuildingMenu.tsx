import { useEffect, useRef, useState } from 'react';

export interface BuildingMenuProps {
  busy: boolean;
  /** Text of the import item, e.g. "Import 2 old buildings". Null hides the item. */
  importLabel: string | null;
  onNew: () => void;
  onOpen: () => void;
  onImport: () => void;
}

/** The "Building" menu of the Manage Buildings header. Reuses the classes of the app menu. */
export function BuildingMenu({ busy, importLabel, onNew, onOpen, onImport }: BuildingMenuProps) {
  const [shown, setShown] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!shown) return;
    const onMouseDown = (event: MouseEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) setShown(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [shown]);

  function pick(action: () => void) {
    setShown(false);
    buttonRef.current?.focus();
    action();
  }

  return (
    <div
      ref={rootRef}
      className="mep-menu mep-buildings-menu"
      onBlur={(event) => {
        if (shown && !rootRef.current?.contains(event.relatedTarget as Node | null)) setShown(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && shown) {
          event.stopPropagation();
          setShown(false);
          buttonRef.current?.focus();
        }
        const menu = rootRef.current?.querySelector<HTMLElement>('[role="menu"]');
        if (!shown || !menu || !menu.contains(event.target as Node)) return;
        const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
        const current = items.indexOf(event.target as HTMLButtonElement);
        let next: number;
        if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length;
        else if (event.key === 'ArrowUp') next = current <= 0 ? items.length - 1 : current - 1;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = items.length - 1;
        else return;
        event.preventDefault();
        items[next]?.focus();
      }}
    >
      <button ref={buttonRef} type="button" className="mep-menu-btn" aria-haspopup="menu" aria-expanded={shown} onClick={() => setShown((value) => !value)}>
        Building ▾
      </button>
      {shown && (
        <div className="mep-menu-dropdown mep-buildings-menu-dropdown" role="menu">
          <button type="button" role="menuitem" className="mep-menu-item" disabled={busy} autoFocus onClick={() => pick(onNew)}>
            New building…
          </button>
          <button type="button" role="menuitem" className="mep-menu-item" disabled={busy} onClick={() => pick(onOpen)}>
            Open building…
          </button>
          {importLabel !== null && (
            <>
              <div className="mep-menu-divider" />
              <button
                type="button"
                role="menuitem"
                className="mep-menu-item"
                data-testid="import-old-button"
                disabled={busy}
                onClick={() => pick(onImport)}
              >
                {importLabel}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
