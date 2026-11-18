import { useEffect, useRef, useState } from 'react';
import type { ReconnectMenuAction, ReconnectMenuItem } from '../pdfFolder.js';

export interface ReconnectButtonProps {
  tooltip: string;
  disabled: boolean;
  /** Null: a click runs `onDirect` (no menu). */
  menu: ReconnectMenuItem[] | null;
  onChoose: (action: ReconnectMenuAction) => void;
  onDirect: () => void;
}

/** The button "Reconnect PDFs…" of the Sheets band. With a menu it opens the choices. Without a menu it runs `onDirect`. */
export function ReconnectButton({ tooltip, disabled, menu, onChoose, onDirect }: ReconnectButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const shown = open && menu !== null;

  useEffect(() => {
    if (menu === null) setOpen(false);
  }, [menu]);

  useEffect(() => {
    if (!shown) return;
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onMouseDown = (event: MouseEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [shown]);

  function choose(action: ReconnectMenuAction) {
    setOpen(false);
    buttonRef.current?.focus();
    onChoose(action);
  }

  return (
    <div
      ref={rootRef}
      className="mep-menu mep-reconnect-menu"
      onKeyDown={(event) => {
        if (event.key === 'Tab' && shown) setOpen(false);
        if (event.key === 'Escape' && shown) {
          event.stopPropagation();
          setOpen(false);
          buttonRef.current?.focus();
          return;
        }
        const list = rootRef.current?.querySelector<HTMLElement>('[role="menu"]');
        if (!shown || !list || !list.contains(event.target as Node)) return;
        const items = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
        const current = items.indexOf(event.target as HTMLButtonElement);
        let next: number;
        if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length;
        else if (event.key === 'ArrowUp') next = current <= 0 ? items.length - 1 : current - 1;
        else return;
        event.preventDefault();
        items[next]?.focus();
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        data-testid="reconnect-pdfs"
        aria-label="Reconnect PDFs"
        title={tooltip}
        disabled={disabled}
        aria-haspopup={menu ? 'menu' : undefined}
        aria-expanded={menu ? open : undefined}
        onClick={() => {
          if (menu === null) onDirect();
          else setOpen((value) => !value);
        }}
      >
        Reconnect PDFs…
      </button>
      {shown && (
        <div className="mep-menu-dropdown mep-reconnect-dropdown" role="menu" data-testid="reconnect-menu">
          {menu.map((item) => (
            <button
              key={item.testId}
              type="button"
              role="menuitem"
              className="mep-menu-item mep-reconnect-item"
              data-testid={item.testId}
              tabIndex={-1}
              onClick={() => choose(item.action)}
            >
              <strong>{item.label}</strong>
              <span className="mep-hint">{item.help}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
