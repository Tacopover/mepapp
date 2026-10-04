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
  /** Replaces the title line with the caller's own header, for a workspace that needs controls up there. `title` then only names the dialog for assistive technology. */
  header?: ReactNode;
  /** Keeps every key press inside the dialog: the scene's window key handler (Delete, Ctrl+C, Ctrl+V, tool keys) does not see it, so a Delete meant for the dialog never deletes the canvas selection behind it. Listeners on the document still run. Defaults to true. */
  isolateKeys?: boolean;
}

/**
 * Shared modal shell (D2 in ui-atlas-layout-mapping.md §7) — backdrop-click
 * and Escape both dismiss via onClose. Reuses the mep-modal / mep-modal-actions
 * classes the calibration prompt already established rather than a new look.
 */
export function Dialog({ title, onClose, children, actions, className, closeOnBackdropClick = true, header, isolateKeys = true }: DialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isolateKeys) event.stopPropagation();
      if (event.key !== 'Escape') return;
      // The scene listens on window; without this the same Escape would also act on the canvas (e.g. leave Circuits mode).
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, isolateKeys]);

  return (
    <div className="mep-modal-backdrop" onClick={closeOnBackdropClick ? onClose : undefined}>
      <div className={`mep-modal${className ? ` ${className}` : ''}`} role="dialog" aria-label={title} onClick={(event) => event.stopPropagation()}>
        {header ? <div className="mep-modal-header">{header}</div> : <h3 className="mep-modal-title">{title}</h3>}
        {/* Scrolls independently of the title/actions so a tall dialog (many rows, e.g. the Element Editor's port list) never pushes its action buttons below the viewport. */}
        <div className="mep-modal-body">{children}</div>
        {actions && <div className="mep-modal-actions">{actions}</div>}
      </div>
    </div>
  );
}
