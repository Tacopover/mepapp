import { useEffect, type ReactNode } from 'react';

export interface DialogProps {
  title: string;
  /** Called on Escape, backdrop click, or whatever the caller's own action buttons decide counts as "close" (e.g. Cancel). Callers own their open/closed state — render <Dialog> only while open, same as calibrationPrompt/textboxPrompt already do in App.tsx. */
  onClose: () => void;
  children: ReactNode;
  /** Rendered in the footer's button row, e.g. <button onClick={onClose}>Cancel</button>. */
  actions?: ReactNode;
}

/**
 * Shared modal shell (D2 in ui-atlas-layout-mapping.md §7) — backdrop-click
 * and Escape both dismiss via onClose. Reuses the mep-modal / mep-modal-actions
 * classes the calibration prompt already established rather than a new look.
 */
export function Dialog({ title, onClose, children, actions }: DialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="mep-modal-backdrop" onClick={onClose}>
      <div className="mep-modal" onClick={(event) => event.stopPropagation()}>
        <h3 className="mep-modal-title">{title}</h3>
        {/* Scrolls independently of the title/actions so a tall dialog (many rows, e.g. the Element Editor's port list) never pushes its action buttons below the viewport. */}
        <div className="mep-modal-body">{children}</div>
        {actions && <div className="mep-modal-actions">{actions}</div>}
      </div>
    </div>
  );
}
