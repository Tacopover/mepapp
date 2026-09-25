import type { ReactNode } from 'react';
import { LINE_WIDTHS_MM, SHEET_DRAW_TOOLS } from '../sheetDraw.js';
import type { SheetDraw } from '../useSheetDraw.js';

export interface SheetDrawToolsProps {
  draw: SheetDraw;
  /** Opens the symbol library so the user can pick the symbol that the Symbol tool places. */
  onChooseSymbol: () => void;
  /** The target selector of the surface ("Add to" or "Attach to"). */
  children?: ReactNode;
}

/** The draw tool bar of the template editor and the schematic dialog (electrical-schematic-templates.md Phase 5b-3). */
export function SheetDrawTools({ draw, onChooseSymbol, children }: SheetDrawToolsProps) {
  return (
    <div className="mep-schematic-drawtools" role="toolbar" aria-label="Draw tools">
      <div className="mep-schematic-drawtools-row">
        {SHEET_DRAW_TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={draw.tool === tool.id ? 'on' : undefined}
            aria-pressed={draw.tool === tool.id}
            title={tool.hint}
            onClick={() => {
              draw.setTool(tool.id);
              if (tool.id === 'symbol' && !draw.symbol) onChooseSymbol();
            }}
          >
            {tool.label}
          </button>
        ))}
        <label>
          Line width
          <select value={draw.lineWidthMm} onChange={(e) => draw.setLineWidthMm(Number(e.target.value))}>
            {LINE_WIDTHS_MM.map((w) => (
              <option key={w} value={w}>
                {w} mm
              </option>
            ))}
          </select>
        </label>
        <label className="mep-schematic-check">
          <input type="checkbox" checked={draw.fill} onChange={(e) => draw.setFill(e.target.checked)} /> Fill
        </label>
        <label className="mep-schematic-check" title="Stay on the tool after a shape is finished. Holding Shift while you finish a shape does the same for that shape.">
          <input type="checkbox" checked={draw.keepTool} onChange={(e) => draw.setKeepTool(e.target.checked)} /> Keep tool
        </label>
        {children}
      </div>
      {draw.tool === 'symbol' && (
        <div className="mep-schematic-drawtools-row">
          <span>Symbol: {draw.symbol ? draw.symbol.name : 'none chosen'}</span>
          <button type="button" onClick={onChooseSymbol}>
            Choose…
          </button>
          {draw.symbol && <span className="mep-schematic-hint">Click on the sheet to place it.</span>}
        </div>
      )}
      {draw.pendingText && (
        <div className="mep-schematic-drawtools-row">
          <label>
            Text
            <input
              type="text"
              autoFocus
              value={draw.textValue}
              onChange={(e) => draw.setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  draw.confirmText();
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  draw.escape();
                }
              }}
            />
          </label>
          <button type="button" onClick={draw.confirmText}>
            Place text
          </button>
          <span className="mep-schematic-hint">Write {'{field.name}'} to show a field value.</span>
        </div>
      )}
      {draw.tool !== 'select' && !draw.pendingText && <span className="mep-schematic-hint">{SHEET_DRAW_TOOLS.find((t) => t.id === draw.tool)?.hint}. Escape leaves the tool.</span>}
    </div>
  );
}
