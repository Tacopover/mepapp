import { useEffect, useState } from 'react';
import type { SchematicSymbol } from '@mepapp/core';
import { fitCanvasSize } from '../shapeCanvasSize.js';
import { SymbolShapesSvg } from '../symbolShapeSvg.js';
import { SchematicSymbolEditor } from './SchematicSymbolEditor.js';

export interface SchematicSymbolLibraryProps {
  symbols: SchematicSymbol[];
  /** Adds, edits, copies and deletes go through here. */
  onChange: (symbols: SchematicSymbol[]) => void;
  /** How many template blocks use the symbol. A symbol that is in use asks before it is deleted. */
  usesOf: (symbolId: string) => number;
  /** The user chose a symbol to place. */
  onPick: (symbol: SchematicSymbol) => void;
  /** Leave the library without choosing. */
  onClose: () => void;
}

const THUMB_MAX_PX = 64;

/** The symbol's art at thumbnail size. It is the same SVG the schematic draws, so there is no raster step (shared-drawing-tool.md §9 question 1). */
export function SymbolThumbnail({ symbol }: { symbol: SchematicSymbol }) {
  const { widthPx, heightPx } = fitCanvasSize(symbol.widthMm, symbol.heightMm, THUMB_MAX_PX);
  return (
    <svg className="mep-symbol-thumb" width={widthPx} height={heightPx} viewBox={`0 0 ${widthPx} ${heightPx}`} aria-hidden="true">
      <SymbolShapesSvg shapes={symbol.shapes} widthPx={widthPx} heightPx={heightPx} />
    </svg>
  );
}

/**
 * The user's schematic symbols (shared-drawing-tool.md Phase 4): thumbnails, "Draw your own symbol"
 * and per-symbol edit, copy and delete. It fills the schematic dialog in place of the template
 * editor, like `SchematicDrawingEditor`. Choosing a symbol hands it to `onPick`.
 */
export function SchematicSymbolLibrary({ symbols, onChange, usesOf, onPick, onClose }: SchematicSymbolLibraryProps) {
  const [editing, setEditing] = useState<{ symbol?: SchematicSymbol } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Dialog closes on Escape at the document level. Inside the list, Escape goes back to the
  // template instead. The editor has its own Escape handling.
  useEffect(() => {
    if (editing) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    }
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [editing, onClose]);

  if (editing) {
    return (
      <SchematicSymbolEditor
        symbol={editing.symbol}
        onSave={(saved) => {
          onChange(symbols.some((s) => s.id === saved.id) ? symbols.map((s) => (s.id === saved.id ? saved : s)) : [...symbols, saved]);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  function copy(symbol: SchematicSymbol) {
    onChange([...symbols, { ...structuredClone(symbol), id: crypto.randomUUID(), name: `${symbol.name} copy` }]);
  }

  function remove(id: string) {
    onChange(symbols.filter((s) => s.id !== id));
    setPendingDeleteId(null);
  }

  return (
    <div className="mep-schematic mep-schematic-symbols">
      <div className="mep-schematic-bar">
        <button type="button" onClick={onClose}>
          Back to template
        </button>
        <button type="button" onClick={() => setEditing({})}>
          + Draw your own symbol…
        </button>
        <strong>Symbol library</strong>
        <span className="mep-schematic-hint">Click a symbol to place it in the template.</span>
      </div>
      {symbols.length === 0 ? (
        <p className="mep-hint">No symbols yet. Draw your own to add one.</p>
      ) : (
        <ul className="mep-symbol-grid">
          {symbols.map((symbol) => {
            const uses = usesOf(symbol.id);
            return (
              <li key={symbol.id} className="mep-symbol-tile">
                <button type="button" className="mep-symbol-tile-pick" onClick={() => onPick(symbol)} title={`Place ${symbol.name}`}>
                  <SymbolThumbnail symbol={symbol} />
                  <span>{symbol.name}</span>
                  <span className="mep-schematic-hint">
                    {symbol.widthMm} × {symbol.heightMm} mm · {symbol.ports.length} {symbol.ports.length === 1 ? 'port' : 'ports'}
                  </span>
                </button>
                {pendingDeleteId === symbol.id ? (
                  <div className="mep-symbol-tile-actions">
                    <span className="mep-schematic-hint">{uses > 0 ? (uses === 1 ? 'Used by 1 block. It shows a missing-symbol box.' : `Used by ${uses} blocks. They show a missing-symbol box.`) : 'Delete this symbol?'}</span>
                    <button type="button" onClick={() => remove(symbol.id)}>
                      Delete
                    </button>
                    <button type="button" onClick={() => setPendingDeleteId(null)}>
                      Keep
                    </button>
                  </div>
                ) : (
                  <div className="mep-symbol-tile-actions">
                    <button type="button" onClick={() => setEditing({ symbol })}>
                      Edit
                    </button>
                    <button type="button" onClick={() => copy(symbol)}>
                      Copy
                    </button>
                    <button type="button" onClick={() => setPendingDeleteId(symbol.id)}>
                      Delete
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
