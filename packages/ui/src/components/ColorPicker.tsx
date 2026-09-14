import { useEffect, useRef, useState } from 'react';

/** A fixed palette of common CAD/UI colors — always shown, regardless of what the user has picked before. */
const BASIC_COLORS = [
  '#000000', '#5c5c5c', '#9e9e9e', '#ffffff',
  '#f44336', '#ff9800', '#ffc107', '#ffeb3b',
  '#8bc34a', '#4caf50', '#009688', '#00bcd4',
  '#03a9f4', '#2196f3', '#3f51b5', '#673ab7',
  '#9c27b0', '#e91e63', '#795548', '#607d8b',
];

const LAST_USED_KEY = 'mepapp.colorPicker.lastUsed.v1';
const LAST_USED_MAX = 8;

function loadLastUsed(): string[] {
  try {
    const raw = window.localStorage.getItem(LAST_USED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

function rememberLastUsed(color: string): string[] {
  try {
    const next = [color, ...loadLastUsed().filter((c) => c.toLowerCase() !== color.toLowerCase())].slice(0, LAST_USED_MAX);
    window.localStorage.setItem(LAST_USED_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadLastUsed();
  }
}

export interface ColorPickerProps {
  /** undefined = multi-select "Varies" — the swatch shows a placeholder instead of a color. */
  value: string | undefined;
  onChange: (color: string) => void;
}

/**
 * A swatch button that opens a popover with a fixed basic palette, the
 * user's own last-used colors, and a native color input for anything else —
 * matches the old MEPSketcher's stamp/network-type color pickers (a plain
 * `<input type="color">` has no palette or memory of its own).
 */
export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [lastUsed, setLastUsed] = useState<string[]>(() => loadLastUsed());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function pick(color: string) {
    onChange(color);
    setLastUsed(rememberLastUsed(color));
    setOpen(false);
  }

  return (
    <div className="mep-color-picker" ref={rootRef}>
      <button
        type="button"
        className="mep-color-picker-swatch"
        style={value ? { background: value } : undefined}
        title={value ?? 'Varies'}
        onClick={() => setOpen((o) => !o)}
      >
        {!value && <span className="mep-color-picker-varies">?</span>}
      </button>
      {open && (
        <div className="mep-color-picker-popover">
          <div className="mep-color-picker-label">Basic Colors</div>
          <div className="mep-color-picker-grid">
            {BASIC_COLORS.map((c) => (
              <button key={c} type="button" className="mep-color-picker-swatch-sm" style={{ background: c }} title={c} onClick={() => pick(c)} />
            ))}
          </div>
          {lastUsed.length > 0 && (
            <>
              <div className="mep-color-picker-label">Last Used</div>
              <div className="mep-color-picker-grid">
                {lastUsed.map((c) => (
                  <button key={c} type="button" className="mep-color-picker-swatch-sm" style={{ background: c }} title={c} onClick={() => pick(c)} />
                ))}
              </div>
            </>
          )}
          <div className="mep-color-picker-custom">
            <label>Custom</label>
            <input type="color" value={value ?? '#000000'} onChange={(e) => pick(e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}
