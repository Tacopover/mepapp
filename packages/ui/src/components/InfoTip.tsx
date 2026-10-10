import { useId, useState, type ReactNode } from 'react';

export interface InfoTipProps {
  /** The accessible name of the "i" mark, for example "Explanation of Per area". */
  label: string;
  children: ReactNode;
}

/**
 * A small "i" mark that shows an explanation while the pointer is on it or while it has keyboard
 * focus. Escape closes the explanation only: the key does not reach the Dialog around it.
 */
export function InfoTip({ label, children }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const textId = useId();
  return (
    <span
      className="mep-infotip"
      tabIndex={0}
      aria-label={label}
      aria-describedby={open ? textId : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return;
        // The Dialog listens on the document: React's root listener runs first, so this stops it there.
        e.stopPropagation();
        setOpen(false);
      }}
    >
      i
      {open && (
        <span className="mep-infotip-text" role="note" id={textId}>
          {children}
        </span>
      )}
    </span>
  );
}
