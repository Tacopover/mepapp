import { useEffect, type ReactNode } from 'react';

export interface DialogProps {
  title: string;
  /** Called on Escape, backdrop click, or whatever the caller's own action buttons decide counts as "close" (e.g. Cancel). Callers own their open/closed state — render <Dialog> only while open, same as calibrationPrompt/textboxPrompt already do in App.tsx. */
  onClose: () => void;
  children: ReactNode;
  /** Rendered in the footer's button row, e.g. <button onClick={onClose}>Cancel</button>. */
  actions?: ReactNode;
  /** Extra class appended to .mep-modal, e.g. 'mep-modal--wide' for a dialog that needs more than the default width/height. */
  className?: string;
  /** False disables the backdrop-click-dismisses gesture (Escape and the caller's own Cancel action still close it) — for a large, click-heavy dialog like the Element Editor, where a stray click just outside its canvas is far more likely an accidental miss-click than a deliberate cancel. Defaults to true. */
  closeOnBackdropClick?: boolean;
}

/**
 * Shared modal shell (D2 in ui-atlas-layout-mapping.md §7) — backdrop-click
 * and Escape both dismiss via onClose. Reuses the mep-modal / mep-modal-actions
 * classes the calibration prompt already established rather than a new look.
 */
export function Dialog({ title, onClose, children, actions, className, closeOnBackdropClick = true }: DialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="mep-modal-backdrop" onClick={closeOnBackdropClick ? onClose : undefined}>
      <div className={`mep-modal${className ? ` ${className}` : ''}`} onClick={(event) => event.stopPropagation()}>
        <h3 className="mep-modal-title">{title}</h3>
        {/* Scrolls independently of the title/actions so a tall dialog (many rows, e.g. the Element Editor's port list) never pushes its action buttons below the viewport. */}
        <div className="mep-modal-body">{children}</div>
        {actions && <div className="mep-modal-actions">{actions}</div>}
      </div>
    </div>
  );
}
