import { useEffect, useState } from 'react';
import { parseDecimal } from '@mepapp/core';

export interface OptionalNumberInputProps {
  id?: string;
  /** The stored value; undefined shows an empty box with the placeholder (the value that applies instead). */
  value: number | undefined;
  placeholder?: string;
  /** Which numbers may be stored. Text that gives another number shows the stored value again. */
  allow: (value: number) => boolean;
  /** Called on blur or Enter when the text changed: a number, or null for an empty box (remove the value). */
  onCommit: (value: number | null) => void;
}

/** A number box that may be empty: an empty box removes the value, so the level above applies. Accepts "," or "." as the decimal separator. Commits on blur or Enter (one undo step per edit). */
export function OptionalNumberInput({ id, value, placeholder, allow, onCommit }: OptionalNumberInputProps) {
  const shown = value === undefined ? '' : String(value);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const commit = () => {
    if (draft === shown) return;
    if (draft.trim() === '') {
      onCommit(null);
      return;
    }
    const parsed = parseDecimal(draft);
    if (parsed === null || !allow(parsed)) {
      setDraft(shown);
      return;
    }
    onCommit(parsed);
  };
  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}
