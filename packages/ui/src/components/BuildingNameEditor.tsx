import { useEffect, useRef, useState } from 'react';

export interface BuildingNameEditorProps {
  name: string;
  /** Called with the trimmed, non-empty new name that differs from the saved name. */
  onRename: (name: string) => void;
  /** Quiet warning text under the name (two buildings with one name). */
  warning?: string | null;
  testId: string; // 'building-name-header' | 'building-name-pane'
  className?: string;
}

/**
 * The building name with a Rename button. The typed text stays in a draft until Enter or blur.
 * Escape drops the draft. A blank draft keeps the input open on Enter and reverts on blur.
 */
export function BuildingNameEditor({ name, onRename, warning = null, testId, className }: BuildingNameEditorProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [blank, setBlank] = useState(false);
  const editingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef(false);
  const editing = draft !== null;

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (returnFocusRef.current) {
      returnFocusRef.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  function start() {
    editingRef.current = true;
    setBlank(false);
    setDraft(name);
  }

  function close() {
    editingRef.current = false;
    setBlank(false);
    setDraft(null);
  }

  function save(blankStays: boolean, viaEnter = false) {
    if (!editingRef.current) return;
    const trimmed = (draft ?? '').trim();
    if (trimmed === '' && blankStays) {
      setBlank(true);
      return;
    }
    if (viaEnter) returnFocusRef.current = true;
    close();
    if (trimmed !== '' && trimmed !== name) onRename(trimmed);
  }

  return (
    <div className={className}>
      <div className="mep-name-row">
        {editing ? (
          <input
            ref={inputRef}
            aria-label="New building name"
            data-testid={`${testId}-input`}
            value={draft ?? ''}
            onChange={(event) => {
              setBlank(false);
              setDraft(event.target.value);
            }}
            onBlur={() => save(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                save(true, true);
              }
              if (event.key === 'Escape') {
                event.stopPropagation();
                returnFocusRef.current = true;
                close();
              }
            }}
          />
        ) : (
          <>
            <span className="mep-name-text" title={name} data-testid={`${testId}-text`}>
              {name}
            </span>
            <button
              ref={buttonRef}
              type="button"
              className="mep-name-rename"
              data-testid={`${testId}-rename`}
              aria-label="Rename building"
              title="Rename building"
              onClick={start}
            >
              Rename
            </button>
          </>
        )}
      </div>
      {editing && blank && (
        <p role="alert" className="mep-hint mep-name-error">
          A building needs a name.
        </p>
      )}
      {!editing && warning && (
        <p className="mep-hint mep-name-warning" data-testid={`${testId}-warning`}>
          {warning}
        </p>
      )}
    </div>
  );
}
