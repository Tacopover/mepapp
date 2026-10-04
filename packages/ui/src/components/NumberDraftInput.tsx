import { useState, type InputHTMLAttributes } from 'react';

export interface NumberDraftInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'onBlur'> {
  /** The committed value; undefined shows an empty box (a mixed selection shows its placeholder). */
  value: number | undefined;
  /** Called on each keystroke that leaves a finite number that `allow` accepts. */
  onCommit: (value: number) => void;
  /** Which finite numbers may be committed; every finite number when not given. */
  allow?: (value: number) => boolean;
}

/**
 * A number box that keeps the user's own text while it has focus and commits only values it accepts —
 * an empty box, a lone "-" or an out-of-range value never writes 0 or a clamped value back. On blur it
 * shows the committed value again. Same pattern as ShapeDrawToolbar's StrokeMmInput.
 */
export function NumberDraftInput({ value, onCommit, allow, ...rest }: NumberDraftInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...rest}
      type="number"
      value={draft ?? (value === undefined ? '' : String(value))}
      onChange={(e) => {
        setDraft(e.target.value);
        const parsed = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(parsed) && (allow?.(parsed) ?? true)) onCommit(parsed);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
